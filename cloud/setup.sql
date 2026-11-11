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

-- The scopes the signed-in person may read and write.
create or replace function public.my_scopes() returns setof text
language sql stable security definer set search_path = public as $$
  select 'u:' || auth.uid()::text where auth.uid() is not null
  union all
  select 't:' || team_id::text from public.team_members where email = public.my_email()
$$;

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
create policy members_read on public.team_members for select
  using (public.is_member(team_id) or exists (select 1 from public.teams where id = team_id and created_by = auth.uid()));
create policy members_add on public.team_members for insert
  with check (public.is_member(team_id) or exists (select 1 from public.teams where id = team_id and created_by = auth.uid()));
create policy members_remove on public.team_members for delete using (public.is_member(team_id));

drop policy if exists records_rw on public.records;
create policy records_rw on public.records for all
  using (scope in (select public.my_scopes()))
  with check (scope in (select public.my_scopes()));

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
          merged := jsonb_set(merged, array[k], (
            select coalesce(jsonb_agg(s.x order by (s.x ->> 'at')::numeric nulls first), '[]'::jsonb)
            from (
              select distinct on (e.x ->> 'id') e.x
              from jsonb_array_elements(coalesce(cur -> k, '[]'::jsonb) || (r -> 'data' -> k)) as e(x)
              order by e.x ->> 'id', coalesce((e.x ->> 'deleted')::boolean, false) desc
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
