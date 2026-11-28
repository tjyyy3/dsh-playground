export function workspaceControllerStatus(inspection, taskCount, msg) {
  if (!inspection) return { label: msg('正在核对主控…', 'Checking controller…'), tone: 'muted', check: msg('核对中', 'Checking') };
  if (inspection.archived) return { label: msg('主控已归档', 'Controller archived'), tone: 'warning', check: msg('已归档', 'Archived') };
  if (inspection.kind === 'existing') {
    const id = inspection.sessionId;
    const session = id.length > 13 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
    const count = taskCount > 0 ? msg(` · 此题已有 ${taskCount} 个主控任务`, ` · ${taskCount} existing controller ${taskCount === 1 ? 'task' : 'tasks'} for this challenge`) : '';
    return { label: msg(`主控 ${session} · 已初始化`, `Controller ${session} · Initialized`) + count, tone: 'ready', check: session };
  }
  if (inspection.kind === 'incomplete') return { label: msg('主控尚未初始化', 'Controller setup required'), tone: 'warning', check: msg('未初始化', 'Setup required') };
  if (inspection.kind === 'absent') return { label: msg('还没有主控', 'No controller yet'), tone: 'muted', check: msg('无', 'None') };
  return { label: msg('无法核对主控', 'Controller check unavailable'), tone: 'warning', check: msg('无法核对', 'Unavailable') };
}
