-- Planner cloud sync: run this once in your Supabase project.
-- Supabase dashboard > SQL Editor > New query > paste everything > Run.
--
-- What it creates
--   teams         a team (e.g. "OMI") that people share tasks in
--   team_members  who is in each team, by email address
--   records       every plan, task, person and preference, one row each, as JSON
-- Security: row level security means each signed-in person can only read and write
--   their own private rows (scope "u:<their id>") and the rows of teams their email
--   belongs to (scope "t:<team id>"). Nobody else's data is visible.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null check (email = lower(email)),
  added_by uuid default auth.uid(),
  added_at timestamptz not null default now(),
  primary key (team_id, email)
);

-- Admins: the team's creator, plus anyone an admin makes one. Admins can delete any message for
-- everyone, recall any message at any time, and read the message log.
alter table public.team_members add column if not exists role text not null default 'member';
do $$ begin
  alter table public.team_members add constraint team_members_role check (role in ('member', 'admin'));
exception when duplicate_object then null; end $$;

create table if not exists public.records (
  scope text not null,
  id text not null,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (scope, id)
);
create index if not exists records_updated_at on public.records (updated_at);

-- The signed-in person's email, lower-cased.
create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- Whether the signed-in person belongs to a team. "security definer" lets the
-- policies below call it without looping back into team_members' own policy.
create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = t and email = public.my_email())
$$;

-- Who may read each S-Team Plan (scope "s:<plan id>"). Admins see every plan of their team.
create table if not exists public.st_access (
  team_id uuid not null references public.teams(id) on delete cascade,
  scope text not null,
  email text not null check (email = lower(email)),
  primary key (scope, email)
);

create or replace function public.is_admin(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = t and email = public.my_email() and role = 'admin')
      or exists (select 1 from public.teams where id = t and created_by = auth.uid())
$$;

-- The scopes the signed-in person may read and write.
create or replace function public.my_scopes() returns setof text
language sql stable security definer set search_path = public as $$
  select 'u:' || auth.uid()::text where auth.uid() is not null
  union all
  select 't:' || team_id::text from public.team_members where email = public.my_email()
  union all
  select scope from public.st_access where email = public.my_email()
  union all
  select a.scope from public.st_access a where public.is_admin(a.team_id)
$$;

alter table public.st_access enable row level security;
drop policy if exists st_access_read on public.st_access;
drop policy if exists st_access_add on public.st_access;
drop policy if exists st_access_remove on public.st_access;
create policy st_access_read on public.st_access for select using (public.is_member(team_id) or public.is_admin(team_id));
-- Admins grant access; anyone can register a brand-new plan (their own) with just themselves.
create policy st_access_add on public.st_access for insert with check (
  public.is_admin(team_id)
  or (email = public.my_email() and public.is_member(team_id)
      and not exists (select 1 from public.st_access b where b.scope = st_access.scope)));
create policy st_access_remove on public.st_access for delete using (public.is_admin(team_id));
grant select, insert, delete on public.st_access to authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.records enable row level security;

drop policy if exists teams_read on public.teams;
drop policy if exists teams_create on public.teams;
drop policy if exists teams_rename on public.teams;
create policy teams_read on public.teams for select using (created_by = auth.uid() or public.is_member(id));
create policy teams_create on public.teams for insert with check (created_by = auth.uid());
create policy teams_rename on public.teams for update using (public.is_member(id));

drop policy if exists members_read on public.team_members;
drop policy if exists members_add on public.team_members;
drop policy if exists members_remove on public.team_members;
drop policy if exists members_role on public.team_members;
create policy members_read on public.team_members for select
  using (public.is_member(team_id) or exists (select 1 from public.teams where id = team_id and created_by = auth.uid()));
-- Any member can add colleagues as members; only admins can add or make admins.
create policy members_add on public.team_members for insert
  with check ((public.is_member(team_id) and role = 'member') or public.is_admin(team_id));
create policy members_role on public.team_members for update using (public.is_admin(team_id)) with check (public.is_admin(team_id));
-- Admins can remove anyone; members can remove only themselves.
create policy members_remove on public.team_members for delete using (public.is_admin(team_id) or email = public.my_email());

drop policy if exists records_rw on public.records;
create policy records_rw on public.records for all
  using (scope in (select public.my_scopes()))
  with check (scope in (select public.my_scopes()));

-- Every deleted or recalled message, kept for the record. Nobody can change or remove an entry.
create table if not exists public.message_log (
  id text primary key,
  team_id uuid references public.teams(id) on delete cascade,
  scope text not null,
  task_id text, task_title text, message_id text not null,
  action text not null check (action in ('deleted for me', 'deleted for everyone', 'recalled')),
  by_email text not null default public.my_email(), by_name text,
  author text, author_name text, message_text text, files jsonb,
  message_at timestamptz, logged_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);
create index if not exists message_log_team on public.message_log (team_id, logged_at desc);
alter table public.message_log enable row level security;
drop policy if exists log_write on public.message_log;
drop policy if exists log_read on public.message_log;
create policy log_write on public.message_log for insert
  with check (by_email = public.my_email() and scope in (select public.my_scopes()) and (team_id is null or scope = 't:' || team_id::text));
-- Team entries: admins only. Private entries: only the person who made them.
create policy log_read on public.message_log for select
  using ((team_id is not null and public.is_admin(team_id)) or (team_id is null and scope = 'u:' || auth.uid()::text));

-- How often each person uses each button, to decide what to show or hide. One row per person and button.
create table if not exists public.button_usage (
  email text not null default public.my_email(),
  team_id uuid references public.teams(id) on delete set null,
  action text not null,
  uses integer not null default 0,
  first_used timestamptz, last_used timestamptz,
  primary key (email, action)
);
alter table public.button_usage enable row level security;
drop policy if exists usage_write on public.button_usage;
drop policy if exists usage_update on public.button_usage;
drop policy if exists usage_read on public.button_usage;
create policy usage_write on public.button_usage for insert with check (email = public.my_email() and (team_id is null or public.is_member(team_id)));
create policy usage_update on public.button_usage for update using (email = public.my_email()) with check (email = public.my_email() and (team_id is null or public.is_member(team_id)));
-- Your own rows, and (for admins) the team's.
create policy usage_read on public.button_usage for select using (email = public.my_email() or (team_id is not null and public.is_admin(team_id)));
grant select, insert, update on public.button_usage to authenticated;

-- Whether a change that deletes or recalls a message is allowed: admins always; the author may
-- recall their own message within 5 minutes; anything goes in your own private rows.
create or replace function public.message_change_allowed(scope text, cur jsonb, nxt jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when scope like 'u:%' then true
    when scope like 't:%' and public.is_admin(substr(scope, 3)::uuid) then true
    when not coalesce((nxt ->> 'deleted')::boolean, false) and nxt ? 'recalled'
      and cur ->> 'author' = 'e:' || public.my_email()
      and extract(epoch from now()) * 1000 - (cur ->> 'at')::numeric < 6 * 60 * 1000 then true
    else false end
$$;

-- Merges changes from a device into the stored rows, field by field.
-- Each record carries "_v": { field: [time changed in ms, person id] }. A field is only
-- replaced when the incoming change is newer, so two people editing different fields
-- offline both keep their edits. Comments and history are merged as lists by id.
-- Runs with the caller's rights, so the row level security above still applies.
create or replace function public.merge_records(rows jsonb) returns integer
language plpgsql set search_path = public as $$
declare
  r jsonb;
  cur jsonb;
  merged jsonb;
  k text;
  v jsonb;
  old jsonb;
  n integer := 0;
begin
  for r in select value from jsonb_array_elements(rows) loop
    if not exists (select 1 from public.my_scopes() s where s = r ->> 'scope') then
      raise exception 'Not allowed to write to %', r ->> 'scope';
    end if;
    select data into cur from public.records where scope = r ->> 'scope' and id = r ->> 'id' for update;
    if cur is null then
      insert into public.records (scope, id, kind, data)
      values (r ->> 'scope', r ->> 'id', r ->> 'kind', r -> 'data');
    else
      merged := cur || jsonb_build_object('_v', coalesce(cur -> '_v', '{}'::jsonb));
      for k, v in select key, value from jsonb_each(coalesce(r -> 'data' -> '_v', '{}'::jsonb)) loop
        -- The due date of an assigned task belongs to whoever assigned it.
        if k = 'due' and coalesce(cur ->> 'assignedBy', '') <> '' and (v ->> 1) <> (cur ->> 'assignedBy') then continue; end if;
        old := merged -> '_v' -> k;
        if old is null
          or (v ->> 0)::numeric > (old ->> 0)::numeric
          or ((v ->> 0)::numeric = (old ->> 0)::numeric and (v ->> 1) > (old ->> 1)) then
          merged := jsonb_set(merged, array[k], coalesce(r -> 'data' -> k, 'null'::jsonb), true);
          merged := jsonb_set(merged, array['_v', k], v, true);
        end if;
      end loop;
      foreach k in array array['comments', 'history'] loop
        if jsonb_typeof(r -> 'data' -> k) = 'array' then
          -- A delete-for-everyone or recall someone isn't allowed to make is ignored.
          if k = 'comments' then
            r := jsonb_set(r, array['data', 'comments'], (
              select coalesce(jsonb_agg(case
                when (coalesce((x ->> 'deleted')::boolean, false) or x ? 'recalled') and y is not null
                  and not coalesce((y ->> 'deleted')::boolean, false) and not (y ? 'recalled')
                  and not public.message_change_allowed(r ->> 'scope', y, x)
                then y else x end), '[]'::jsonb)
              from jsonb_array_elements(r -> 'data' -> 'comments') as a(x)
              left join lateral (select b.y from jsonb_array_elements(coalesce(cur -> 'comments', '[]'::jsonb)) as b(y)
                                 where b.y ->> 'id' = a.x ->> 'id' limit 1) c on true));
          end if;
          merged := jsonb_set(merged, array[k], (
            select coalesce(jsonb_agg(s.x order by (s.x ->> 'at')::numeric nulls first), '[]'::jsonb)
            from (
              select distinct on (e.x ->> 'id') e.x
              from jsonb_array_elements(coalesce(cur -> k, '[]'::jsonb) || (r -> 'data' -> k)) as e(x)
              order by e.x ->> 'id', coalesce((e.x ->> 'deleted')::boolean, false) desc, (e.x ? 'recalled') desc
            ) s), true);
        end if;
      end loop;
      update public.records
        set data = merged, kind = r ->> 'kind', updated_at = clock_timestamp()
        where scope = r ->> 'scope' and id = r ->> 'id';
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function public.merge_records(jsonb) to authenticated;
grant execute on function public.my_scopes() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.my_email() to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.message_change_allowed(text, jsonb, jsonb) to authenticated;
grant select, insert on public.message_log to authenticated;
