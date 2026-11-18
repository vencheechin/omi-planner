'use strict';
// ---------- App language: English (default) or Simplified Chinese ----------
// Settings › General › Language. The app is written in English. When Chinese is on, every bit of
// screen text is swapped for its Chinese version as it's drawn (a MutationObserver walks new text
// and the placeholder / title / aria-label attributes), so no page needs its own translation code.
// Your own content (task names, messages, notes, typed values) is left alone.
// To translate more text, add it to I18N_ZH (exact text) or I18N_RX (patterns with numbers or names).

const I18N_ZH = {
  // Menu and pages
  'Planner': '计划', 'Work Planner': '工作计划', 'My Planner': '我的计划', 'Time Box': '时间盒', 'Calendar': '日历', 'Meeting Calendar': '会议日历',
  'Discussion Notes': '讨论笔记', 'Progress Meeting': '进度会议', 'S-Team Plan': 'S-Team 计划', 'S-Team Plans': 'S-Team 计划', 'My S-Team Plan': '我的 S-Team 计划',
  'PD Master Plan': 'PD 总计划', 'PD Plan': 'PD 计划', 'Yearly Planner': '年度计划', 'Yearly': '年度', 'Assignments': '指派', 'Assignment report': '指派报告', 'Fitness': '健身',
  'Growth': '成长', 'Leases': '租约', 'Admin Portal': '管理后台', 'Settings': '设置', 'Delegate To': '委派给', 'Delegate to': '委派给', 'Delegate From': '来自委派',
  'Requests': '请求', 'Request to me': '给我的请求', 'Pending from Others': '等待他人', 'History': '历史记录', 'Approval History': '审批记录', 'Menu': '菜单',
  'Dashboard': '仪表板', 'Pipeline': '产品管线', 'Report': '报告', 'Functions': '功能', 'Plans': '计划', 'Plan': '计划', 'Tasks': '任务', 'Task': '任务',
  'Personal tasks': '个人任务', 'S-Team tasks': 'S-Team 任务', 'Misc tasks': '杂项任务', 'Tomorrow Planning': '明日计划', 'Board': '看板', 'Timeline': '时间线',
  'Search plans and tasks': '搜索计划和任务', 'Search tasks': '搜索任务', 'Search people': '搜索人员', 'Search notes': '搜索笔记',
  // Common buttons
  'Add': '添加', 'Save': '保存', 'Cancel': '取消', 'Close': '关闭', 'Delete': '删除', 'Remove': '移除', 'Edit': '编辑', 'Edit…': '编辑…', 'Rename': '重命名', 'Copy': '复制',
  'Move': '移动', 'Open': '打开', 'Done': '完成', 'Create': '创建', 'Back': '返回', 'Next': '下一步', 'Previous': '上一个', 'Undo': '撤销', 'Redo': '重做', 'Undo (⌘Z)': '撤销 (⌘Z)',
  'Redo (⇧⌘Z)': '重做 (⇧⌘Z)', 'Yes': '是', 'No': '否', 'OK': '确定', 'Keep': '保留', 'Discard': '放弃', 'Dismiss': '关闭', 'Clear': '清除', 'Clear all': '全部清除',
  'Reset': '重置', 'Reset to default': '恢复默认', 'Show': '显示', 'Hide': '隐藏', 'More': '更多', 'More options': '更多选项', 'Set': '设定', 'Use': '使用', 'Play': '播放',
  'Stop': '停止', 'Start': '开始', 'Send': '发送', 'Send now': '立即发送', 'Submit': '提交', 'Import': '导入', 'Restore': '恢复', 'Replace': '替换', 'Pin': '置顶',
  'Unpin': '取消置顶', 'Pinned': '已置顶', 'Accept': '接受', 'Decline': '拒绝', 'Connect': '连接', 'Disconnect': '断开', 'Sign in': '登录', 'Sign out': '退出登录',
  'Signed in as': '登录身份', 'Not now': '以后再说', 'Exit without saving': '不保存退出', 'Save plan': '保存计划', 'Attach': '附加', 'Split': '拆分', 'Select entries': '选择条目',
  'Move up': '上移', 'Move down': '下移', 'Move left': '左移', 'Move right': '右移', 'Drag to move': '拖动以移动', 'Drag to reorder': '拖动以排序',
  'Drag to reorder (only for you)': '拖动以排序（仅对你生效）', 'Reopen': '重新打开', 'Withdraw': '撤回', 'Optimise': '优化', 'Assign': '指派', 'Assign task': '指派任务',
  'Add task': '添加任务', 'Add a task': '添加任务', 'Add item': '添加项目', 'Add person': '添加人员', 'Add person…': '添加人员…', 'Add people': '添加人员', 'Add a person': '添加人员',
  'Add link': '添加链接', 'Add bucket': '添加分组', 'Delete bucket': '删除分组', 'Delete plan': '删除计划', 'Move task': '移动任务', 'Copy task': '复制任务', 'Remove task': '移除任务',
  'Close task': '关闭任务', 'Task options': '任务选项', 'Plan options': '计划选项', 'Add and assign': '添加并指派', 'Add to my list': '加入我的列表', 'Empty bin': '清空回收站',
  // Time words
  'Today': '今天', 'Tomorrow': '明天', 'Yesterday': '昨天', 'Now': '现在', 'Now:': '现在：', 'Today:': '今天：', 'Next:': '下一个：', 'This week': '本周', 'Next week': '下周',
  'Previous week': '上周', 'Back to this week': '回到本周', 'This month': '本月', 'Next year': '明年', 'Previous year': '去年', 'Earlier weeks': '较早的周', 'Later weeks': '较晚的周',
  'Day': '日', 'Week': '周', 'Month': '月', 'Year': '年', 'Hour': '小时', 'Minutes': '分钟', 'Days': '天', 'days': '天', 'weeks': '周', 'min': '分钟', 'hr': '小时', 'times': '次',
  'Full Year': '全年', 'Half Year': '半年', 'Half Years': '半年', 'All day': '全天', 'All time': '全部时间', 'Week no': '周数', 'Week starting': '周开始', 'Remarks': '备注',
  'Monday': '星期一', 'Tuesday': '星期二', 'Wednesday': '星期三', 'Thursday': '星期四', 'Friday': '星期五', 'Saturday': '星期六', 'Sunday': '星期日',
  'Mon': '周一', 'Tue': '周二', 'Wed': '周三', 'Thu': '周四', 'Fri': '周五', 'Sat': '周六', 'Sun': '周日',
  'January': '一月', 'February': '二月', 'March': '三月', 'April': '四月', 'May': '五月', 'June': '六月', 'July': '七月', 'August': '八月', 'September': '九月',
  'October': '十月', 'November': '十一月', 'December': '十二月', 'Jan': '1月', 'Feb': '2月', 'Mar': '3月', 'Apr': '4月', 'Jun': '6月', 'Jul': '7月', 'Aug': '8月',
  'Sep': '9月', 'Oct': '10月', 'Nov': '11月', 'Dec': '12月', 'Jan – Jun': '1月 – 6月', 'Jul – Dec': '7月 – 12月',
  'Weekly': '每周', 'Monthly': '每月', 'Weekdays': '工作日', 'Every day': '每天', 'Every week': '每周', 'Every 2 weeks': '每 2 周', 'Every 3 weeks': '每 3 周', 'Every 4 weeks': '每 4 周',
  'Every month': '每月', 'Every year': '每年', 'Every weekday (Mon–Fri)': '每个工作日（周一至周五）', 'Does not repeat': '不重复', 'Repeat': '重复', 'Repeats': '重复',
  'Custom repeat': '自定义重复', 'Custom': '自定义', 'Custom…': '自定义…', 'Every': '每', 'Ends': '结束', "Doesn't end": '不结束', 'On a date': '在某日期', 'After a number of times': '重复若干次后',
  'Every how many weeks': '每隔几周', 'First date': '首个日期', 'First meeting': '首次会议', 'Start date': '开始日期', 'Due date': '截止日期', 'Due Date': '截止日期', 'Due': '截止',
  'Deadline': '截止期限', 'Date': '日期', 'Dates': '日期', 'Time zone': '时区', 'Time zones': '时区', 'Home time zone': '原时区', 'Or type the time': '或输入时间', 'or scroll': '或滚动',
  'No date': '无日期', 'Unscheduled': '未安排', 'Late': '逾期', 'On time': '准时', 'before': '之前', 'after': '之后', 'to': '至', 'At time of event': '活动开始时',
  // Task fields and status
  'Task name': '任务名称', 'Task Name': '任务名称', 'Untitled task': '未命名任务', 'Task Requirement': '任务要求', 'Task details': '任务详情', 'Details': '详情', 'Notes': '备注',
  'Checklist': '清单', 'Checklist item': '清单项', 'Add a checklist item': '添加清单项', 'Group checklist': '分组清单', 'Attachments': '附件', 'Files': '文件', 'Files and links': '文件和链接',
  'Comments': '评论', 'Comment': '评论', 'Conversation': '对话', 'Labels': '标签', 'Label': '标签', 'No label': '无标签', 'Edit labels': '编辑标签', 'Label name': '标签名称',
  'Label colour': '标签颜色', 'Search or create a label': '搜索或创建标签', 'Bucket': '分组', 'Bucket name': '分组名称', 'No bucket': '无分组', 'Priority': '优先级',
  'Urgent': '紧急', 'Important': '重要', 'Medium': '中', 'Low': '低', 'Progress': '进度', 'Not started': '未开始', 'In progress': '进行中', 'Completed': '已完成',
  'Not completed': '未完成', 'Finished': '已完成', 'Not finished': '未完成', 'Task Completed': '任务完成', 'Completed on': '完成于', 'Date completed': '完成日期', 'Date added': '添加日期',
  'Traffic Light': '红绿灯', 'Traffic light': '红绿灯', 'Green': '绿', 'Yellow': '黄', 'Red': '红', 'Red / Yellow': '红 / 黄', 'On Track': '正常推进', 'Needs focus': '需要关注',
  'Needs support': '需要支持', 'Assigned to': '指派给', 'Assigned by': '指派人', 'Assigned on': '指派日期', 'Assigned from': '指派来源', 'Assigned': '已指派', 'Unassigned': '未指派',
  'To be Assigned': '待指派', 'Time required': '所需时间', 'Time Required': '所需时间', 'Time spent': '已用时间', 'Estimate': '预估', 'Status': '状态', 'Waiting': '等待中',
  'Waiting for': '等待', 'Waiting on them': '等待对方', 'Waiting for you': '等待你', 'Waiting for check': '等待检查', 'Waiting for your check': '等待你检查', 'Category': '类别',
  'Type': '类型', 'Name': '名称', 'Title': '标题', 'Owner': '负责人', 'Person': '人员', 'People': '人员', 'Who': '谁', 'When': '时间', 'How': '方式', 'Where it\'s at': '当前进展',
  'Total': '合计', 'Group': '分组', 'Group by': '分组方式', 'By person': '按人员', 'Sort by': '排序', 'Recent': '最近', 'Last used': '最近使用', 'None': '无', 'Not set': '未设置',
  'Unknown': '未知', 'Someone': '某人', 'You': '你', 'you': '你', 'optional': '可选', '(optional)': '（可选）', 'Optional': '可选', 'Untitled plan': '未命名计划', 'New plan': '新计划',
  'Plan name': '计划名称', 'Plan Name': '计划名称', 'Plan members': '计划成员', 'Which plan': '哪个计划', 'Most Important Outcome': '最重要成果', '★ 3 Most Important Outcomes': '★ 3 个最重要成果',
  'Strategic': '战略', 'Management': '管理', 'Collaboration': '协作', 'Ideas': '想法', 'Issue': '问题', 'Impact': '影响', 'Recommendation': '建议', 'Item': '项目',
  'Work type': '工作类型', 'Type colour': '类型颜色', 'Colour': '颜色', 'Original colour': '原始颜色', 'Rename or change colour': '重命名或更改颜色',
  'No open tasks yet.': '暂无未完成任务。', 'No tasks match.': '没有匹配的任务。', 'No plans yet': '暂无计划', 'No plans yet.': '暂无计划。', 'Nothing yet': '暂无', 'Nothing yet.': '暂无。',
  'Nothing.': '无。', 'Nothing waiting.': '没有等待项。', 'No matches': '没有匹配', 'No match.': '没有匹配。', 'Nothing due this week.': '本周没有到期事项。',
  'Filter by task name or notes': '按任务名称或备注筛选',
  // Checking, approval, decision
  'Checking': '检查', 'Approval': '审批', 'Decision': '决策', 'Decision Required': '需要决策', 'Pending Checking': '待检查', 'Pending Approval': '待审批', 'Pending Decision': '待决策',
  'Submit for checking': '提交检查', 'Submitted for review': '已提交审核', 'To check': '待检查', 'Checked': '已检查', 'Approve': '批准', 'Approved': '已批准', 'Reject': '拒绝',
  'Rejected': '已拒绝', 'Send back': '退回', 'Return for changes': '退回修改', 'Request a change': '请求修改', 'Request Change': '请求修改', 'Reason': '原因', 'Approve by': '审批截止',
  'Approval Request': '审批请求', 'Approval request': '审批请求', 'Decision Request': '决策请求', 'Decision deadline': '决策截止', 'Decision:': '决策：', 'Decided by you': '由你决定',
  'Ready for decision': '待决策', 'Decision and approval requests': '决策和审批请求', 'Oldest request': '最早的请求', 'Newest request': '最新的请求', 'Nothing checked yet.': '尚无检查记录。',
  'Nothing decided yet.': '尚无决策。', 'Reject decision request': '拒绝决策请求', 'Reject approval request': '拒绝审批请求', 'Decision Window': '决策时段', 'Biweekly Review': '双周回顾',
  'Review': '回顾', 'Revise': '修改', 'Suggest edits': '建议修改', 'Suggestions': '建议',
  // Time Box and rest
  'Time box': '时间盒', 'Time boxing': '时间盒设置', 'Time Box Allocation': '时间盒分配', 'In this time box': '在此时间盒中', 'Tasks in this time box': '此时间盒中的任务',
  'In a time box': '在时间盒中', 'Remove this time box': '移除此时间盒', 'Remove from Time Box': '从时间盒移除', 'Go to its Time Box': '前往其时间盒', 'Book time': '预约时间',
  'Next free': '下一个空档', 'No free slot': '没有空档', 'Book the next free slot': '预约下一个空档', 'Day starts': '一天开始', 'Day ends': '一天结束', 'Daily capacity (hours)': '每日容量（小时）',
  'Move unfinished work': '移动未完成工作', 'Move unfinished work…': '移动未完成工作…', 'Repeat to the next days…': '重复到接下来几天…', 'Clear this day': '清空这一天', 'Focus': '专注',
  'Focus sessions': '专注时段', 'When Do You Focus Best?': '你什么时候最专注？', 'Rest': '休息', 'Rest now': '现在休息', 'Rest reminder': '休息提醒', 'Rest reminders': '休息提醒',
  'Remind me to rest': '提醒我休息', 'Then rest for': '然后休息', 'Rest taken': '已休息', 'Rest and recovery': '休息与恢复', 'Rest days': '休息日', 'Rests': '休息次数', 'Interval': '间隔',
  'Short exercise between work': '工作间隙的简短运动', 'Workout': '锻炼', 'Exercise': '运动', 'Weekly exercise targets': '每周运动目标', 'Work–exercise balance': '工作与运动平衡',
  'Next up': '接下来', 'Waiting in the Time Box list': '在时间盒列表中等待', 'Planning': '规划', 'Planning length': '规划时长',
  // Calendar
  'New': '新建', 'Event': '活动', 'Meeting': '会议', 'Birthday': '生日', 'Reminder': '提醒', 'Location': '地点', 'Address': '地址', 'Map link': '地图链接', 'Map link (optional)': '地图链接（可选）',
  'Open in Google Maps': '在 Google 地图中打开', 'Open the location in Google Maps': '在 Google 地图中打开地点', 'Save Location': '保存地点', 'Save this location': '保存此地点',
  'Saved Locations': '已保存地点', 'Saved locations': '已保存地点', 'No saved locations yet.': '暂无已保存地点。', 'Choose one of your saved locations': '选择一个已保存的地点',
  'Search an address, or pick a saved location': '搜索地址，或选择已保存地点', 'Place name': '地点名称', 'Searching…': '搜索中…', 'Guests': '嘉宾', 'Guest': '嘉宾', 'Add guests': '添加嘉宾',
  'Add guests: type a name or email': '添加嘉宾：输入姓名或邮箱', 'Notify guests': '通知嘉宾', 'Guest notification': '嘉宾通知', 'Video call link': '视频会议链接', 'Notifications': '通知',
  'Notification': '通知', 'Your notifications': '你的通知', 'Default notifications': '默认通知', 'Remove notification': '移除通知', 'Add notification': '添加通知', 'Shared calendar': '共享日历',
  'New shared calendar': '新共享日历', 'Calendars': '日历', 'My calendar': '我的日历', 'Calendar name': '日历名称', 'Your calendars and shared calendars': '你的日历和共享日历',
  'Block this time in my Time Box': '在我的时间盒中占用这段时间', 'Time to leave': '出发时间', 'Tell me when to leave for events with a place': '有地点的活动提醒我何时出发', 'Buffer': '缓冲时间',
  'Transport': '交通方式', 'Where I am (this device\'s location)': '我的位置（本设备定位）', 'Drop files here or': '把文件拖到这里，或', 'Files added earlier': '之前添加的文件',
  'Gift ideas, how to celebrate': '礼物想法、庆祝方式', 'Set up meeting': '安排会议', 'Set up progress meeting': '安排进度会议', 'Department': '部门', 'DIC': '负责人 (DIC)',
  'Recycle bin: drop a task here, or click to restore': '回收站：把任务拖到这里，或点击恢复', 'The recycle bin is empty.': '回收站是空的。',
  // Discussion notes
  'New note': '新笔记', 'To discuss': '待讨论', 'Point to discuss': '讨论要点', 'Add a point to discuss': '添加讨论要点', 'Task for me': '给我的任务', 'Back to notes': '返回笔记', 'Delete note': '删除笔记',
  'Remove point': '移除要点', 'Mark discussed': '标记为已讨论', 'Discussed': '已讨论', 'Choose a person…': '选择人员…', 'Who this discussion is with': '与谁讨论', 'Title, e.g. Weekly catch-up': '标题，例如：每周例会',
  'What was said, decisions, follow-ups…': '讨论内容、决定、后续跟进…', 'Pick a note, or start a': '选择一条笔记，或开始一条', 'With': '与',
  // Settings
  'General': '通用', 'Sounds': '声音', 'Messages': '消息', 'Sync & Data': '同步与数据', 'Language': '语言', 'Appearance': '外观', 'System': '跟随系统', 'Light': '浅色', 'Dark': '深色',
  'Font': '字体', 'Text size': '文字大小', 'Colour Style': '配色风格', 'Colour style': '配色风格', 'Colour style in use': '当前配色风格', 'Pop-up messages': '弹出消息', 'Theme': '主题',
  'Messages with Undo, and warnings, always show.': '带撤销的消息和警告始终显示。', 'Planner Name': '计划名称', 'Name Your Planner': '为你的计划命名', "Time's up alert": '时间到提醒',
  'Task complete sound': '任务完成提示音', 'Reminder sound': '提醒提示音', 'Play a sound when I complete a task': '完成任务时播放声音', 'Play a ringtone when time is up': '时间到时播放铃声',
  'Play a sound when a reminder goes off': '提醒响起时播放声音', 'Volume': '音量', 'Your own sound': '你自己的声音', 'Remove your sound': '移除你的声音', 'Play your sound': '播放你的声音',
  'Cloud sync': '云同步', 'Team sync': '团队同步', 'Shared folder': '共享文件夹', 'Sync now': '立即同步', 'Backup': '备份', 'Export backup': '导出备份', 'Import backup': '导入备份',
  'Make a backup': '创建备份', 'Delete all data': '删除所有数据', 'Import from Microsoft Planner': '从 Microsoft Planner 导入', 'Choose Excel file…': '选择 Excel 文件…',
  'Reporting Lines': '汇报关系', 'Reports to': '汇报给', 'Set who reports to whom': '设置汇报关系', 'Admin': '管理员', 'Admins': '管理员', 'Open Admin Portal': '打开管理后台',
  'Open the Admin Portal': '打开管理后台', 'Admins & Departments': '管理员和部门', 'Departments': '部门', 'Department name': '部门名称', 'Members': '成员', 'S-Team Access': 'S-Team 访问权限',
  'Culture': '企业文化', 'Culture quotes': '企业文化语录', 'Stages': '阶段', 'Organisation': '组织', 'Messages and Language': '消息与语言', 'Default Language': '消息默认语言',
  'Translate automatically (Google Translate)': '自动翻译（Google 翻译）', 'Message log': '消息记录', 'Email': '邮箱', 'Your name': '你的名字', 'Your email': '你的邮箱',
  'Change your profile photo': '更换头像', 'Name or email': '姓名或邮箱', 'Only an admin can change these.': '只有管理员可以更改这些。', 'Only admins can open the Admin Portal.': '只有管理员可以打开管理后台。',
  'Reporting lines, admins, departments and the team dashboard are in the Admin Portal.': '汇报关系、管理员、部门和团队仪表板都在管理后台。',
  'Show confirmation messages (like “Most Important Task for Today.”)': '显示确认消息（例如“今天最重要的任务”）', 'Saved on this device': '已保存在本设备', 'Save failed': '保存失败',
  'New events start with these. You can still change them on each event.': '新活动默认使用这些设置，每个活动仍可单独修改。',
  // Sounds (names)
  'Zen': '禅意', 'Nature': '自然', 'Classic': '经典', 'Young': '青春', 'Fun': '趣味', 'Wind chime': '风铃', 'Wind chimes': '风铃', 'Tibetan singing bowl': '藏式颂钵', 'Singing bowl': '颂钵',
  'Zen garden': '禅意花园', 'Wind': '风声', 'Wave': '海浪', 'Water drops': '水滴', 'Morning birds': '晨鸟', 'Temple gong': '寺庙锣声', 'Soft bowl': '柔和颂钵', 'Ding': '叮', 'Ding dong': '叮咚',
  'Double chime': '双音', 'Marimba': '马林巴', 'Beep beep': '哔哔', 'Fanfare': '号角', 'Ta-da': '哒哒', 'Coin': '金币', 'Jet fighter pass': '战斗机掠过', 'Rock': '摇滚', 'Hard rock': '硬摇滚',
  'Cool': '酷', 'Drum fill': '鼓点', 'Power riff': '力量和弦', 'Slap bass groove': '贝斯律动', 'Disco strut': '迪斯科', 'Electro pulse': '电子脉冲', 'Horn stabs': '铜管', 'Rising arpeggio': '上行琶音', 'Arena chord': '体育场和弦',
  // Misc
  'Welcome': '欢迎', 'Getting started': '开始使用', 'Message': '消息', 'Sent': '已发送', 'Not sent': '未发送', 'Message by': '发送者', 'Mark all read': '全部标为已读', 'No messages yet.': '暂无消息。',
  'Turn on desktop notifications': '开启桌面通知', 'Recommended to you': '为你推荐', 'Brand': '品牌', 'Product': '产品', 'Stage': '阶段', 'Period': '期间', 'Analysis': '分析',
  'Activity': '活动记录', 'Action': '操作', 'Page': '页面', 'View': '查看', 'Code': '代码', 'Number': '数字', 'Type a number': '输入数字', 'Year born': '出生年份', 'Workload': '工作量',
  'Public holidays': '公众假期', 'Public and school holidays': '公众假期和学校假期', 'School terms and holidays': '学期和学校假期', 'Holidays shown': '显示的假期',
  // Pages: more
  'You have not made a backup yet. Your plans are stored only on this device.': '你还没有备份。你的计划只保存在本设备上。', 'Filter': '筛选', 'Group by Bucket': '按分组', 'Add new bucket': '添加新分组',
  'Mark complete': '标记完成', 'Rows': '行', 'Early and late hours': '清晨和深夜时段', 'Misc': '杂项', 'Allocation': '分配', 'Show my other open tasks': '显示我其他未完成的任务',
  'Alert when a time box ends': '时间盒结束时提醒', 'Drag to resize · double-click to reset': '拖动调整大小 · 双击重置', "Everyone's": '所有人的', 'Holidays': '假期', '(No title)': '（无标题）',
  'No notes yet. Write down what you want to discuss with someone.': '还没有笔记。写下你想和某人讨论的事项。', 'Submit for approval': '提交审批', 'Select': '选择', 'PIC': '负责人',
  'Need support': '需要支持', 'Off plan, recoverable': '偏离计划，可挽回', 'On plan': '按计划', 'New S-Team Plan': '新 S-Team 计划', 'Pick several entries to move, copy or delete (or Shift-click them)': '选择多个条目以移动、复制或删除（或按住 Shift 点击）',
  'Download the months on screen as an Excel file': '把屏幕上的月份下载为 Excel 文件', 'Half year months': '半年月份', 'Product pipeline': '产品管线', 'Access': '访问权限', 'Framework': '框架',
  'Choose who can view, suggest or edit': '选择谁可以查看、建议或编辑', 'Tasting versions': '试吃版本', 'Itinerary': '行程', 'Hotel': '酒店', 'Go to a month': '前往某月',
  'Drag to move this column; drag its edge to resize': '拖动以移动此列；拖动边缘以调整宽度', 'Export to Excel (CSV)': '导出到 Excel (CSV)', 'Anyone': '任何人', 'Everyone': '所有人', 'Any status': '任何状态',
  'Assigned to date': '截至目前已指派', 'No assignments yet': '暂无指派', 'of 3h target': '（目标 3 小时）', 'Sessions': '次数', 'this week': '本周', 'Movement breaks today': '今天的活动休息',
  'Balance': '平衡', 'book work in the Time Box to compare': '在时间盒中安排工作以便比较', 'Running': '跑步', 'This week:': '本周：', 'usual': '通常', 'Log a session': '记录一次', 'Weight Training': '重量训练',
  'Add an activity': '添加活动', 'Swimming, yoga, cycling…': '游泳、瑜伽、骑行…', 'Remind me': '提醒我', 'For': '时长', 'Usual goal': '通常目标', 'Reminding you every': '提醒间隔：每', ', for': '，持续', ', goal': '，目标',
  'Qi Gong': '气功', 'Stretching': '伸展', 'Weight Lifting': '举重', 'Another kind': '其他类型', "Tap a kind after you've done it to count the break.": '做完后点一下类型，记为一次休息。',
  'days with no workout so far': '天没有锻炼', 'Last session': '上次', 'Longest gap': '最长间隔', 'none yet': '暂无', 'Qi Gong break': '气功休息', 'Not yet': '还没有', 'Add a book': '添加书籍',
  'This year': '今年', 'Hours spent growing': '成长时长', 'Reading now': '正在阅读', 'Nothing on the go. Start one from your list below.': '目前没有进行中的。从下方列表开始一个。',
  'Want to read, listen or watch': '想读、想听或想看', 'Add the books, audiobooks and videos you plan to learn from.': '添加你打算学习的书籍、有声书和视频。', 'Books you finish show here with the time they took.': '读完的书会显示在这里，并附上所用时间。',
  'Add outlet': '添加门店', 'Keep every outlet’s lease in one place: term, expiry, gross rent and reviews.': '把每家门店的租约放在一处：租期、到期日、总租金和复审。', 'Button Usage': '按钮使用情况',
  'Open tasks': '未完成任务', 'Late now': '当前逾期', 'nothing late': '没有逾期', 'of completed tasks': '的已完成任务', 'Time to complete': '完成用时', 'delegated tasks, on average': '委派任务平均',
  'Requests waiting': '等待中的请求', 'Avg time': '平均用时', 'Done in period': '期间完成', 'Traffic light, open tasks': '红绿灯，未完成任务', 'Avg answer': '平均回复', 'Draft': '草稿',
  'Approved, rejected and answer time cover the period above.': '批准、拒绝和回复时间统计的是上述期间。', 'OMI Corporate Colour': 'OMI 企业色', 'Coastal Blue': '海岸蓝', 'Eucalyptus': '桉树绿',
  'Desert Clay': '沙漠陶土', 'Graphite': '石墨', 'Vibrant': '鲜艳', 'Garamond (OMI)': 'Garamond (OMI)', 'System (Apple)': '系统字体 (Apple)', 'Marketing': '市场部', 'Operation': '运营部',
  'Dessert': '甜品', 'Drinks': '饮品', 'Prototype': '原型', 'Development': '开发', 'Pre-Launch': '上市前', 'Go Live': '上线', 'Launch': '上市', 'Direction': '方向', 'Show completed': '显示已完成', 'Exit': '退出', 'Approve with comment (optional)': '批准并附评论（可选）',
  // Settings: more
  'Search plans, tasks and functions': '搜索计划、任务和功能', 'Own': '自定义', 'sound': '声音', 'Project URL': '项目网址', 'Anon (public) key': '公开密钥 (Anon key)',
  'Your team server (recommended).': '你的团队服务器（推荐）。', 'Server address': '服务器地址', 'Team code': '团队代码', 'Other ways': '其他方式', 'Folder on this computer…': '本电脑上的文件夹…',
  'Test folder on this device': '本设备上的测试文件夹', 'Energetic': '活力', 'Funk & Retro Pop': '放克与复古流行', '8-bit power-up': '8-bit 能量提升', '8-bit level clear': '8-bit 过关',
  '8-bit jump': '8-bit 跳跃', '8-bit stage clear fanfare': '8-bit 通关号角', '8-bit item pops out': '8-bit 道具出现', 'Ringtone': '铃声', 'Add location': '添加地点', 'No buffer': '不留缓冲',
  'Start from': '出发地', 'Locations you use often. Pick them with Saved Locations in an event, and they come up first when you type a Location.': '常用地点。在活动中通过“已保存地点”选择，输入地点时也会优先出现。',
  'Drive time is estimated without live traffic; the buffer covers parking and traffic. Works while Planner is open.': '车程按无实时路况估算；缓冲时间用于停车和交通。计划打开时有效。',
  'Time interval': '时间间隔', 'Duration choices': '时长选项', 'Tasks typed into the Time Box go to:': '在时间盒中输入的任务放到：', 'ask each time': '每次询问', 'Ask each time': '每次询问',
  'Every working day': '每个工作日', 'Protected': '受保护', 'Add block': '添加时段', 'Edit types': '编辑类型', 'Add biweekly review': '添加双周回顾', 'Restore default rhythm': '恢复默认节奏',
  'Requests go up: you send Decision Requests, Approval Requests and S-Team Plans to the people you report to. Delegating goes down, to the people who report to you.': '请求向上：你把决策请求、审批请求和 S-Team 计划发给你的上级。委派向下：交给向你汇报的人。',
  'Top': '最高层', 'Edit in Admin Portal': '在管理后台编辑', 'Bucket name size': '分组名称字号', 'The OMI style guide: navy, olive, ochre on cream.': 'OMI 品牌规范：米色底上的海军蓝、橄榄绿和赭黄。',
  'Deep sea blue, sea-glass teal and warm sand.': '深海蓝、海玻璃青和暖沙色。', 'Bush green, gum-leaf grey and wattle gold.': '丛林绿、桉叶灰和金合欢金。', 'Red earth, clay and dusk brown.': '红土、陶土和暮色棕。',
  'Quiet greys with a muted gold accent.': '安静的灰色，点缀柔和金色。', 'Bright and colourful: cobalt blue, emerald and tangerine.': '明亮多彩：钴蓝、翡翠绿和橘色。', 'Last backup: never': '上次备份：从未',
  'A folder on this computer works with any service that syncs it. OneDrive folders often hold back files that aren’t downloaded yet, so use the team server if sync stalls.': '本电脑上的文件夹可配合任何同步服务使用。OneDrive 文件夹常会保留尚未下载的文件，如果同步卡住，请使用团队服务器。',
  'Add label': '添加标签', 'Assign to Time Box': '分配到时间盒', 'Check List': '清单', 'Notify me when ticked': '勾选时通知我', 'Notifying me when ticked': '勾选时会通知我', 'Log': '记录',
  'S-Team': 'S-Team', 'Notes': '笔记', 'Hold an item and drag it to the bottom bar': '按住一项，拖到底部栏即可添加',
  'Schedule': '日程', 'Nothing planned': '没有安排', 'Show later months': '显示之后的月份',
  'My team': '我的团队', 'Everyone who reports to you. Tick to see their calendar with yours.': '所有向你汇报的人。勾选即可与你的日历一起查看。',
  'Calendar settings': '日历设置', 'Time zone, calendars and holidays': '时区、日历和假期',
  'New task': '新任务',
  'Duplicate': '复制一份', 'Copy to…': '复制到…', 'More options': '更多选项', 'organiser': '组织者', 'Join call': '加入通话', 'Repeats every year': '每年重复',
  'Schedule settings': '日程设置',
  'Search plans, tasks and schedule': '搜索计划、任务和日程', 'Search plans, tasks, schedule and functions': '搜索计划、任务、日程和功能',
  'Delete recurring event': '删除重复活动', 'This event': '此活动', 'This and all following events': '此活动及之后所有活动', 'All events': '所有活动', 'This event deleted.': '已删除此活动。', 'This and all following events deleted.': '已删除此活动及之后所有活动。',
  'Public holiday': '公共假期', 'School holiday': '学校假期', 'Weekend': '周末',
  'Org Chart': '组织架构图', 'Not in the chart yet': '尚未加入架构图', 'Remove person?': '移除此人？',
  'Your profile': '我的资料', 'People in the Admin Portal': '在管理后台管理人员',
  'Roles': '角色', 'Role': '角色', 'Manager': '经理', 'Staff': '员工',
  'Module Access': '模块权限',
  'Add a requirement': '添加一项要求', 'No requirements yet.': '暂无要求。',
  'Apply to all': '全部应用', 'Ends': '结束', 'Ended': '已结束', 'End date for everyone': '所有人的结束日期', 'Clear all end dates': '清除所有结束日期',
  'For your information: it’s under Delegate To.': '供参考：在“委派给”下。',
  'Go to month': '前往月份', 'Go to this month': '前往本月', 'Edit this month': '编辑本月', 'Pan Pan': '盼盼',
};

const I18N_RX = [
  [/^(.+)'s Work Planner$/, '$1的工作计划'], [/^(.+)’s Work Planner$/, '$1的工作计划'], [/^(.+)'s Planner$/, '$1的计划'], [/^(.+)’s Planner$/, '$1的计划'],
  [/^(\d+) mins?$/, '$1 分钟'], [/^(\d+) minutes?$/, '$1 分钟'], [/^(\d+) hours?$/, '$1 小时'], [/^(\d+) hrs?$/, '$1 小时'], [/^(\d+) days?$/, '$1 天'], [/^(\d+) weeks?$/, '$1 周'],
  [/^(\d+) (?:mins?|minutes?) before$/, '提前 $1 分钟'], [/^(\d+) hours? before$/, '提前 $1 小时'], [/^(\d+) days? before$/, '提前 $1 天'], [/^(\d+) weeks? before$/, '提前 $1 周'],
  [/^Every (\d+) (?:weeks)$/, '每 $1 周'], [/^Every (\d+) days$/, '每 $1 天'], [/^Every (\d+) months$/, '每 $1 个月'], [/^Week (\d+)$/, '第 $1 周'], [/^(\d+) open$/, '$1 项未完成'],
  [/^(\d+)m$/, '$1 分钟'], [/^(\d+)h$/, '$1 小时'], [/^(\d+)h (\d+)m$/, '$1 小时 $2 分钟'], [/^(\d+) of (\d+)$/, '$1 / $2'], [/^(\d+) a day$/, '每天 $1 次'], [/^every (\d+) mins at work$/, '工作时每 $1 分钟'],
  [/^Show completed \((\d+)\)$/, '显示已完成 ($1)'], [/^Finished and stopped \((\d+)\)$/, '已完成和已停止 ($1)'], [/^(\d+) assigned$/, '已指派 $1 项'], [/^(\d+) books? finished$/, '已读完 $1 本'],
  [/^Stage (\d) (.+)$/, (m, n, x) => `第 ${n} 阶段 ${I18N_ZH[x] || x}`], [/^\((\d+) min\)$/, '（$1 分钟）'], [/^\((\d+) days? ago\)$/, '（$1 天前）'], [/^every (\d+) days$/, '每 $1 天'],
  [/^(\d+)× a week$/, '每周 $1 次'], [/^(\d+)m each$/, '每次 $1 分钟'], [/^Book (\d+) in Time Box$/, '在时间盒中预约 $1 次'], [/^done$/, '完成'], [/^(\d+) to plan$/, '$1 次待安排'],
  [/^(\d+) \/ (\d+) min$/, '$1 / $2 分钟'], [/^Using (.+) on this device$/, '本设备已用 $1'], [/^Last backup: (.+)$/, '上次备份：$1'],
  [/^Task for (.+)$/, '给 $1 的任务'], [/^With (.+)$/, '与 $1'], [/^(\d+) tasks?$/, '$1 个任务'], [/^(\d+) items?$/, '$1 项'],
  [/^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),? )?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?: (\d{4}))?$/, (m, w, d, mo, y) => `${y ? `${y}年` : ''}${I18N_MON[mo]}月${d}日${w ? ` ${I18N_ZH[w]}` : ''}`],
  [/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2})$/, (m, d, mo, y) => `20${y}年${I18N_MON[mo]}月${Number(d)}日`],
  [/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m, w, d, mo, y) => `${y}年${I18N_MON[mo.slice(0, 3)]}月${d}日 ${I18N_ZH[w]}`],
  [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}|\d{2})$/, (m, mo, y) => `${y.length === 2 ? `20${y}` : y}年${I18N_MON[mo]}月`],
  [/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) – (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/, (m, d1, m1, d2, m2) => `${I18N_MON[m1]}月${d1}日 – ${I18N_MON[m2]}月${d2}日`],
  [/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m, mo, y) => `${y}年${I18N_MON[mo.slice(0, 3)]}月`],
];
const I18N_MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

const i18nLang = () => {
  const v = typeof S !== 'undefined' && S?.settings?.uiLang;
  if (v) return v === 'zh' ? 'zh' : 'en';
  try { return localStorage.getItem(lsKey('planner-lang')) === 'zh' ? 'zh' : 'en'; } catch { return 'en'; }
};
/** Chinese for one piece of screen text, or the text unchanged when there's none. */
function i18nT(s) {
  const t = s.trim();
  if (!t || !/[A-Za-z]/.test(t)) return s;
  let z = Object.prototype.hasOwnProperty.call(I18N_ZH, t) ? I18N_ZH[t] : null;
  if (z == null) for (const [rx, to] of I18N_RX) if (rx.test(t)) { z = t.replace(rx, to); break; }
  if (z == null && /^[\d:\sapm–\-·]+$/.test(t) && /\d ?[ap]m/.test(t)) z = i18nTime(t);
  if (z == null && t.includes(' · ')) { const parts = t.split(' · ').map((p) => i18nT(p)); const j = parts.join(' · '); if (j !== t) z = j; }
  return z == null ? s : s.replace(t, z);
}
/** 2:30 pm → 下午2:30, 9 am → 上午9点 */
const i18nTime = (t) => t.replace(/(\d{1,2})(?::(\d\d))? ?(am|pm)/g, (m, h, mm, ap) => `${ap === 'am' ? (Number(h) === 12 ? '凌晨' : '上午') : (Number(h) === 12 ? '中午' : '下午')}${h}${mm ? `:${mm}` : '点'}`);
// Your own content stays as you wrote it.
const I18N_SKIP = 'textarea,script,style,[contenteditable],.no-tr,.card-title,.task-title,.msg-text,.c-title,.dn-item b,.tb-q-title,.tb-b-title,.pm-chip';
const I18N_ATTRS = ['placeholder', 'title', 'aria-label'];
function i18nWalk(root) {
  if (!root || root.nodeType === 8) return;
  if (root.nodeType === 3) { const p = root.parentElement; if (p && !p.closest(I18N_SKIP)) { const v = i18nT(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
  for (const el of els) {
    for (const a of I18N_ATTRS) { const v = el.getAttribute(a); if (v) { const z = i18nT(v); if (z !== v) el.setAttribute(a, z); } }
  }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement;
    if (!p || p.closest(I18N_SKIP)) continue;
    const v = i18nT(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  }
}
let i18nObs = null;
function i18nApply() {
  const zh = i18nLang() === 'zh';
  document.documentElement.lang = zh ? 'zh-Hans' : 'en';
  if (!zh || i18nObs) return;
  i18nWalk(document.body);
  document.title = i18nT(document.title);
  // Microtask, so the Chinese is in place before the screen paints.
  i18nObs = new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'childList') r.addedNodes.forEach(i18nWalk);
      else if (r.type === 'characterData') { const v = i18nT(r.target.nodeValue); if (v !== r.target.nodeValue && !r.target.parentElement?.closest(I18N_SKIP)) r.target.nodeValue = v; }
    }
    if (/[A-Za-z]/.test(document.title)) { const t = i18nT(document.title); if (t !== document.title) document.title = t; }
  });
  i18nObs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

function langSettingsHTML() {
  const v = i18nLang();
  return `<div class="seg">${[['en', 'English'], ['zh', '简体中文']].map(([k, l]) => `<button class="${v === k ? 'on' : ''}" data-act="setUiLang" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="small muted">${v === 'zh' ? '界面语言。你自己输入的内容（任务、消息、笔记）不会被翻译。' : 'The language of the app’s buttons and menus. What you type (tasks, messages, notes) isn’t translated.'}</p>`;
}
Object.assign(actions, {
  setUiLang: async (el) => {
    const v = el.dataset.v === 'zh' ? 'zh' : 'en';
    if (v === i18nLang()) return;
    S.settings.uiLang = v;
    try { localStorage.setItem(lsKey('planner-lang'), v); } catch { /* the setting itself is saved below */ }
    Store.save();
    await Store.flush();
    location.reload();
  },
});
// Also after each full draw, so it starts as soon as your settings have loaded.
const i18nRender0 = render;
render = function () { i18nRender0.apply(this, arguments); i18nApply(); };
i18nApply();
