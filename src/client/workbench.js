import { msg, usePluginLanguage } from './shared/language.js';
import * as React from 'react';
import { attemptKey, attemptRefreshMs, clock, noArchiveError, receiptAttemptId, receiptKey, receiptPending, refreshAttempts, taskAttemptScope, unarchiveFocusMs, visibleRefreshGapMs, withLatestAttempt } from './tasks/attempts.js';
import { h } from './shared/react.js';
import { css } from './shared/styles.js';
import { AuthStatusPanel } from './settings/auth.js';
import { CatalogPanel } from './catalog/index.js';
import { ArchivedTaskRow, TaskDetailDrawer, TaskSummaryRow } from './tasks/list.js';

function PlaygroundWorkbench({ libraryOnly, section, active = true, useSessions, useSessionAccess, refreshProjections, openTask, openChat, run, query, requestTask, handoff, login, saveToken, clearToken, useWorkspaces, archiveTask, unarchiveTask, ...props }) {
  usePluginLanguage();
  const catalog = useSessions((state) => state);
  // DSH's archive set lives on the workspace list snapshot. Without it nothing counts as archived and
  // the archive controls stay hidden.
  const archivedIds = typeof useWorkspaces === 'function' ? useWorkspaces((value) => value?.archivedSessionIds) : undefined;
  const archiveAvailable = Array.isArray(archivedIds);
  const archivedSet = new Set(archiveAvailable ? archivedIds : []);
  const sessions = catalog.ids.map((id) => catalog.byId[id]).filter((session) => !session.parentId);
  const allTaskSessions = sessions.filter((session) => session.projectionValues?.playgroundTask?.task || session.displayTitle?.startsWith('Playground · '));
  // Everything below counts, refreshes and selects by default from the tasks that are not archived.
  const taskSessions = allTaskSessions.filter((session) => !archivedSet.has(session.id));
  const archivedTasks = allTaskSessions.filter((session) => archivedSet.has(session.id));
  const [selected, setSelected] = React.useState(() => taskSessions.find((session) => (session.retainedBy?.mainView ?? 0) > 0)?.id || taskSessions[0]?.id || '');
  const [showArchived, setShowArchived] = React.useState(false);
  // Id of the conversation whose archive change is in flight, and the last failure with the conversation
  // it belongs to: a drawer shows only its own task's failure.
  const [archiveBusy, setArchiveBusy] = React.useState('');
  const [archiveError, setArchiveError] = React.useState(noArchiveError);
  const [split, setSplit] = React.useState(50);
  const [announcement, setAnnouncement] = React.useState('');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  // Focus targets from callback refs: each task row's main button and each archived row's 取消归档 by id, the
  // archived-list toggle and the 任务总览 heading. `restored` is a successful 取消归档 from the archived list whose
  // focus move is still due: { id, next, previous } with the archived rows around it when it was pressed.
  const [nav] = React.useState(() => ({ rows: new Map(), archived: new Map(), toggle: null, heading: null, restored: null }));
  const refInto = (map, id) => (node) => { if (node) map.set(id, node); else map.delete(id); };
  // Web root reported by the latest catalog read; only tasks recorded without webUrl or baseUrl use it.
  const [webBase, setWebBase] = React.useState('');
  const [openError, setOpenError] = React.useState('');
  // Latest platform state of each task's submission. Mutable holder plus a version counter: it lives
  // in memory only and never reaches a session projection, so refreshing writes no conversation record.
  const [, setVersion] = React.useState(0);
  const [store] = React.useState(() => {
    const holder = { attempts: {}, refreshedAt: undefined, failed: false, partial: false, controller: null, disposed: false, startedAt: undefined,
      version: 0, query: null, pendingKeys: [], taskKeys: [], receipts: new Map() };
    holder.publish = () => setVersion(++holder.version);
    return holder;
  });
  const receipts = new Map();
  const pendingKeys = new Set();
  for (const item of taskSessions) {
    const state = item.projectionValues?.playgroundTask;
    const receipt = state?.receipt;
    const scope = taskAttemptScope(state);
    const attemptId = receiptAttemptId(receipt);
    const key = attemptKey(scope, attemptId);
    if (!key) continue;
    if (!receipts.has(key)) receipts.set(key, { scope, attemptId, receiptKeys: new Set() });
    receipts.get(key).receiptKeys.add(receiptKey(receipt));
    if (receiptPending(withLatestAttempt(state, store.attempts))) pendingKeys.add(key);
  }
  const anyPending = pendingKeys.size > 0;
  // The timers and listeners below read these at call time. Declared first, so they are current
  // when the mount and polling effects run.
  React.useEffect(() => { store.query = query; store.taskKeys = [...receipts.keys()]; store.pendingKeys = [...pendingKeys]; store.receipts = receipts; });
  const pageVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  // Opening the workbench reads the pending submissions once. A mount that follows a cleanup, as in
  // StrictMode, starts over.
  React.useEffect(() => {
    store.disposed = !active;
    if (active && pageVisible() && section !== 'catalog') refreshAttempts(store, store.pendingKeys);
    return () => { store.disposed = true; store.controller?.abort(); store.controller = null; };
  }, [active]);
  // While any submission is unscored: every two minutes, and when the page becomes visible again unless a
  // round began in the last 30 seconds. It depends on whether anything is pending, not on which ids, so a
  // task finishing neither requests again nor resets the timer. The ids are read when a round starts.
  React.useEffect(() => {
    if (!active || section === 'catalog' || !anyPending) return undefined;
    const tick = () => { if (pageVisible()) refreshAttempts(store, store.pendingKeys); };
    const onVisibility = () => { if (store.startedAt === undefined || Date.now() - store.startedAt >= visibleRefreshGapMs) tick(); };
    // Pending submissions that appear before any round has run (a list that loaded after mounting).
    if (store.startedAt === undefined) tick();
    const timer = setInterval(tick, attemptRefreshMs);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, anyPending]);
  const refreshing = Boolean(store.controller);
  // A task archived from its open drawer stays selected so the drawer can offer "撤销"; once the drawer
  // is closed, the selection moves back to a task that is not archived.
  React.useEffect(() => {
    if (selected && !allTaskSessions.some((session) => session.id === selected)) { setSelected(taskSessions[0]?.id || ''); setDrawerOpen(false); }
    else if (!drawerOpen && archivedSet.has(selected)) setSelected(taskSessions[0]?.id || '');
  }, [selected, drawerOpen, allTaskSessions.map((session) => session.id).join(','), archivedTasks.map((session) => session.id).join(',')]);
  // After 取消归档 in the archived list. While DSH's archive set still holds the task its row and button stay, with
  // focus. Once it is gone: the restored task's row, else the archived row after it (or before it, for the last),
  // else the archived-list toggle, else the 任务总览 heading (the toggle is gone with the last archived task).
  // Focus the user moved elsewhere in the meantime is left alone. The move expires `unarchiveFocusMs` after the
  // change succeeded: DSH normally publishes its archive set at once, and a move much later would pull focus away
  // from whatever the user does by then (a click on empty space also leaves focus on body). After expiry focus
  // stays where it is, as without the move. The window uses the monotonic `performance.now()`, so a system clock
  // adjustment neither stretches nor cuts it.
  React.useEffect(() => {
    const pending = nav.restored;
    if (!pending) return;
    if (performance.now() - pending.at > unarchiveFocusMs) { nav.restored = null; return; }
    if (archivedSet.has(pending.id)) return;
    nav.restored = null;
    const active = typeof document === 'undefined' ? undefined : document.activeElement;
    if (active && active !== document.body && active.isConnected !== false) return;
    [nav.rows.get(pending.id), nav.archived.get(pending.next), nav.archived.get(pending.previous), nav.toggle, nav.heading].find(Boolean)?.focus?.();
  });
  const session = (archivedSet.has(selected) && !drawerOpen ? undefined : catalog.byId[selected]) || taskSessions[0];
  // "归档任务", "撤销" and "取消归档". No confirmation: the conversation can be restored. The actions report
  // failures as a short message and never throw; the catch only covers a host that throws anyway.
  // `fromList` marks 取消归档 in the archived list: a success removes that row and its button, so focus moves to
  // the restored task's row (see the effect below). The drawer's single button stays and keeps focus itself.
  const toggleArchive = (id, archive, { fromList = false } = {}) => {
    if (archiveBusy) return undefined;
    setArchiveBusy(id);
    setArchiveError(noArchiveError);
    setAnnouncement('');
    nav.restored = null;
    const order = archivedTasks.map((item) => item.id);
    const index = order.indexOf(id);
    const neighbours = { next: order[index + 1], previous: order[index - 1] };
    return Promise.resolve().then(() => (archive ? archiveTask : unarchiveTask)(id)).catch(() => ({ ok: false, message: archive ? msg('归档未完成，请重试。', 'Could not archive the task. Try again.') : msg('取消归档未完成，请重试。', 'Could not unarchive the task. Try again.') }))
      .then((result) => {
        setArchiveBusy('');
        if (result?.ok === false) { setArchiveError({ id, message: result.message }); setAnnouncement(result.message); }
        else {
          setAnnouncement(archive ? msg('任务已归档', 'Task archived') : msg('任务已取消归档', 'Task restored'));
          if (fromList && !archive) nav.restored = { id, ...neighbours, at: performance.now() };
        }
      });
  };
  const archive = archiveAvailable ? { busy: archiveBusy, change: toggleArchive } : undefined;
  // Selecting another task or closing the drawer drops the last failure.
  const closeDrawer = () => { setDrawerOpen(false); setArchiveError(noArchiveError); };
  // DSH does not open archived conversations: the header skips an archived selection.
  const openable = session && !archivedSet.has(session.id) ? session : taskSessions[0];
  // The row's "打开对话" and the drawer's "打开任务对话": a failed navigation is reported, not left unhandled.
  // Navigation is deferred so a synchronous throw is caught too and the caller (the drawer's close) always continues.
  // Both messages are cleared first, so a repeated failure changes the live region again and a success leaves no stale note.
  const openConversation = (id) => {
    setAnnouncement('');
    setOpenError('');
    return Promise.resolve().then(() => openTask(id)).catch((failure) => {
      console.warn('Playground: failed to open the task conversation', failure);
      setAnnouncement(msg('无法打开任务对话，请重试。', 'Could not open the task chat. Try again.'));
      setOpenError(msg('无法打开任务对话，请重试。', 'Could not open the task chat. Try again.'));
    });
  };
  return h('main', { className: 'pg-workbench', 'aria-label': msg('Playground 工作台', 'Playground Workbench') },
    h('style', null, css + '.pg-workbench{box-sizing:border-box;min-width:0;width:100%;height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 24px) 24px 32px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}.pg-workbench-inner{max-width:1180px;margin:0 auto}.pg-workbench h1{font-size:22px;margin:0}.pg-workbench .pg-toolbar{margin:20px 0;display:grid;gap:8px}.pg-search{display:grid;grid-template-columns:minmax(0,2fr) minmax(180px,1fr);gap:8px;margin-top:14px}.pg-competition-info{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:10px}.pg-competition-info .pg-note{flex:1 1 280px;min-width:0;margin:0;overflow-wrap:anywhere}.pg-catalog-filters{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 10px;margin-top:10px}.pg-filter{display:grid;gap:4px;flex:1 1 130px;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary)}.pg-filter .pg-input{width:100%;min-width:0;box-sizing:border-box}.pg-filter-other{flex:2 1 240px}.pg-filter-row{display:flex;gap:6px;min-width:0}.pg-filter-row .pg-input{flex:1 1 auto}.pg-filter-check{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;flex:1 1 150px;min-height:32px;font-size:12px}.pg-filter-check .pg-note{margin:0;font-size:11px}.pg-catalog-count{margin:10px 0 0;overflow-wrap:anywhere}.pg-catalog-groups{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}.pg-catalog-groups-label{margin-right:2px;font-size:12px;color:var(--dsw-alias-label-secondary)}.pg-group-chip{min-height:32px;padding:5px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.4;white-space:nowrap;cursor:pointer}.pg-group-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}.pg-group-chip[aria-pressed=true]{border-color:var(--pg-accent);background:var(--pg-accent-soft);color:var(--pg-accent-strong);font-weight:600}.pg-group-chip:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}.pg-group-count{margin-left:5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.pg-group-chip[aria-pressed=true] .pg-group-count{color:inherit}.pg-catalog-failure{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:10px}.pg-catalog-failure .pg-error{flex:1 1 220px;margin:0}.pg-load-more{display:block;margin:12px auto 0}.pg-workbench .pg-guide{padding:20px}.pg-workbench-grid{display:grid;gap:12px;align-items:start;margin-top:12px}.pg-workbench-column{min-width:0}.pg-column-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;padding:0 2px}.pg-column-heading h2{font-size:14px;line-height:1.4}.pg-refresh-controls{display:flex;align-items:center;gap:8px}.pg-refresh{min-height:32px;padding:5px 10px}.pg-refresh-status{margin:0 2px 8px}.pg-task-empty{padding:20px 14px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}.pg-challenge{margin-top:8px;cursor:pointer}.pg-challenge:hover{border-color:var(--dsw-alias-border-l3)}.pg-challenge .pg-primary[aria-disabled=true]:hover{background:var(--dsw-alias-button-primary-fill)}.pg-task-list{display:grid;gap:6px}.pg-task-row{width:100%;min-width:0;box-sizing:border-box;display:flex;align-items:center;gap:6px;padding-right:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}.pg-task-row-select{flex:1 1 auto;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:11px 12px;border:0;border-radius:9px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}.pg-task-row-open{flex:none;min-height:28px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--pg-accent-strong);font:inherit;font-size:11px;line-height:1.4;white-space:nowrap;cursor:pointer}.pg-task-row-open:hover{background:var(--dsw-alias-interactive-bg-hover)}.pg-task-row-select:focus-visible,.pg-task-row-open:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}.pg-task-row:hover{background:var(--dsw-alias-interactive-bg-hover)}.pg-task-row.is-selected{background:var(--dsw-alias-interactive-bg-active)}.pg-task-row-main{display:grid;min-width:0;gap:4px}.pg-task-row-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.pg-task-row-meta,.pg-task-row-updated{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pg-task-row-side{display:grid;justify-items:end;gap:3px;min-width:78px}.pg-task-row-score{font-size:12px;font-weight:600;color:var(--pg-accent-strong)}.pg-task-row-updated{font-size:10px}.pg-split-control{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px}.pg-split-control input{width:118px;accent-color:var(--pg-accent)}.pg-drawer-backdrop{position:fixed;inset:0;z-index:20;background:rgba(15,23,42,.22);display:flex;justify-content:flex-end}.pg-drawer{box-sizing:border-box;width:min(640px,100vw);height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 24px) 24px 24px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:-12px 0 30px rgba(15,23,42,.16)}.pg-drawer-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px}.pg-drawer-title{margin:0;font-size:18px;line-height:1.4;overflow-wrap:anywhere}.pg-drawer-close,.pg-drawer-open{min-height:32px;padding:5px 9px;white-space:nowrap}.pg-drawer-heading{flex:1;min-width:0}.pg-drawer-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;flex:0 0 auto;max-width:50%}.pg-drawer .pg-workflow{margin-top:14px}.pg-drawer .pg-history{margin-top:14px}.pg-history-side{display:grid;justify-items:end;gap:4px}.pg-drawer .pg-archive{align-items:center;flex-wrap:wrap}.pg-archived{margin-top:10px;display:grid;gap:6px}.pg-archived-toggle{justify-self:start;min-height:28px;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}.pg-archived-toggle:hover{color:var(--pg-accent-strong);background:var(--pg-accent-soft)}.pg-archived-toggle:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}.pg-archived-row{justify-content:space-between;padding:8px 10px 8px 12px;background:var(--dsw-alias-bg-base)}.pg-archived-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}.pg-workbench .pg-help{margin-top:20px;font-size:12px;line-height:1.8;color:var(--dsw-alias-label-secondary)}@media(max-width:820px){.pg-workbench-grid{grid-template-columns:1fr!important}.pg-split-control{justify-content:flex-start}}@media(max-width:600px){.pg-workbench{padding-right:14px;padding-left:14px}.pg-workbench .pg-guide{padding:14px}.pg-search{grid-template-columns:1fr}.pg-filter,.pg-filter-other{flex-basis:100%}.pg-load-more{width:100%}.pg-split-control input{width:96px}.pg-task-row{padding-right:8px}.pg-task-row-select{gap:8px;padding:10px}.pg-task-row-side{min-width:0}.pg-drawer{padding:calc(var(--dsh-frame-top-clearance,0px) + 16px) 16px 16px}}'),
    h('div', { className: 'pg-workbench-inner' },
      section ? null : h('header', { className: 'pg-head' },
        h('h1', null, msg('Playground 主控面板', 'Playground controller panel')),
        h('button', { className: 'pg-button', onClick: () => requestTask({ kind: 'controller' }) }, msg('打开工作区主控', 'Open workspace controller')),
        h('button', { className: 'pg-button', onClick: () => openable ? openTask(openable.id) : openChat() }, openable ? msg('返回所选任务对话', 'Return to selected task chat') : msg('打开 DSH 对话', 'Open DSH chat'))),
      libraryOnly ? null : h(AuthStatusPanel, { query, login, saveToken, clearToken }),
      h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, announcement),
      section ? null : h('div', { className: 'pg-split-control' },
        h('span', null, msg('调整左右栏宽度', 'Adjust column widths')),
        h('input', { type: 'range', min: 35, max: 65, step: 5, value: split, 'aria-label': msg('调整左右栏宽度', 'Adjust column widths'), 'aria-valuetext': msg(`左侧 ${split}%，右侧 ${100 - split}%`, `Left ${split}%, right ${100 - split}%`), onChange: (event) => setSplit(Number(event.target.value)) }),
        h('span', null, `${split}% / ${100 - split}%`)),
      h('div', { className: 'pg-workbench-grid', style: { gridTemplateColumns: section ? 'minmax(0,1fr)' : `minmax(0,${split}fr) minmax(0,${100 - split}fr)` } },
        section === 'submissions' ? null : h('section', { className: 'pg-workbench-column', 'aria-label': msg('Playground 赛题目录', 'Playground challenge catalog') },
          h('div', { className: 'pg-column-heading' }, h('h2', null, msg('赛题目录', 'Challenge catalog'))),
          h(CatalogPanel, { query, handoff, onWebBase: setWebBase })),
        section === 'catalog' ? null : h('section', { className: 'pg-workbench-column', 'aria-label': msg('Playground 任务总览', 'Playground task overview') },
          h('div', { className: 'pg-column-heading' }, h('h2', { tabIndex: -1, ref: (node) => { nav.heading = node; } }, msg('任务总览', 'Task overview')),
            h('span', { className: 'pg-refresh-controls' }, h('span', { className: 'pg-badge' }, msg(`${taskSessions.length} 个任务`, `${taskSessions.length} task${taskSessions.length === 1 ? "" : "s"}`)),
              taskSessions.length ? h('button', { type: 'button', className: 'pg-button pg-refresh', disabled: refreshing || !receipts.size,
                onClick: () => refreshAttempts(store, store.taskKeys) }, refreshing ? msg('正在刷新…', 'Refreshing…') : msg('刷新', 'Refresh')) : null)),
          store.failed ? h('p', { className: 'pg-note pg-refresh-status pg-error', role: 'status' },
            store.partial ? msg('刷新失败，部分任务显示的不是最新状态', 'Refresh failed. Some task statuses may be out of date.')
              : store.refreshedAt ? msg(`刷新失败，显示的是 ${clock(store.refreshedAt)} 的状态`, `Refresh failed. Showing statuses from ${clock(store.refreshedAt)}.`) : msg('刷新失败，显示的是任务记录中的状态', 'Refresh failed. Showing the statuses saved in the task records.'))
            : store.refreshedAt ? h('p', { className: 'pg-note pg-refresh-status' }, msg(`状态更新于 ${clock(store.refreshedAt)}`, `Status updated at ${clock(store.refreshedAt)}`)) : null,
          // Visible copy of the navigation failure; the live region above already announces it.
          openError ? h('p', { className: 'pg-note pg-error pg-open-error', role: 'none' }, openError) : null,
          taskSessions.length ? h('div', { className: 'pg-task-list', role: 'list', 'aria-label': msg('Playground 任务列表', 'Playground task list') },
            taskSessions.map((item) => h(TaskSummaryRow, { key: item.id, session: item, attempts: store.attempts, selected: item.id === selected, onSelect: () => { setSelected(item.id); setDrawerOpen(true); setArchiveError(noArchiveError); setAnnouncement(msg(`已打开任务：${item.displayTitle}`, `Opened task: ${item.displayTitle}`)); }, onOpen: () => openConversation(item.id), selectRef: refInto(nav.rows, item.id) })))
            : h('p', { className: 'pg-task-empty' }, archivedTasks.length ? msg('没有未归档的任务。', 'No active tasks.') : msg('还没有 Playground 任务。先从赛题目录选择一个题目。', 'No Playground tasks yet. Select a challenge from the catalog to get started.')),
          // Visible copy of an archive failure while the drawer is closed; the drawer shows its own.
          archive && archiveError.message && !drawerOpen ? h('p', { className: 'pg-note pg-error pg-archive-error', role: 'none' }, archiveError.message) : null,
          archive && archivedTasks.length ? h('div', { className: 'pg-archived' },
            h('button', { type: 'button', className: 'pg-archived-toggle', 'aria-expanded': showArchived, 'aria-controls': 'pg-archived-list',
              onClick: () => setShowArchived(!showArchived), ref: (node) => { nav.toggle = node; } }, msg(`已归档 ${archivedTasks.length} 个`, `Archived (${archivedTasks.length})`)),
            showArchived ? h('div', { id: 'pg-archived-list', className: 'pg-task-list pg-archived-list', role: 'list', 'aria-label': msg('已归档的 Playground 任务', 'Archived Playground tasks') },
              archivedTasks.map((item) => h(ArchivedTaskRow, { key: item.id, session: item, archive, buttonRef: refInto(nav.archived, item.id) }))) : null) : null)),
      // The drawer gives focus back to the row that opened it. When that node is gone it tries the task's current
      // row (archive then 撤销 in the drawer remounts the row as a new node), then, for a task archived in the
      // drawer, the 任务总览 heading.
      drawerOpen && session ? h(TaskDetailDrawer, { session, projection: catalog.projectionsBySession[session.id], close: closeDrawer, focusFallback: () => [nav.rows.get(session.id), nav.heading], attempts: store.attempts, useSessionAccess, refreshProjections, openTask, openConversation, run, query, webBase,
        archive: archive && { ...archive, archived: archivedSet.has(session.id), error: archiveError.id === session.id ? archiveError.message : '' }, ...props }) : null,
      section === 'submissions' ? null : h('details', { className: 'pg-help' }, h('summary', null, msg('如何使用', 'How to use the workbench')),
        h('ol', null,
          h('li', null, msg('搜索比赛和赛题，查看题目后点击“交给主控”。', 'Find a competition or challenge, review its details, and select “Hand off to controller”.')),
          h('li', null, msg('首次交接时选择工作区并确认，主控会在该工作区协调赛题工作。', 'On the first handoff, choose and confirm a workspace. The controller will coordinate work there.')),
          h('li', null, msg('完成方案后，在任务详情点击“提交”，由该任务 Agent 按官方要求执行并记录编号。', 'When your solution is ready, select “Submit” in task details. The task Agent follows the official requirements and records the submission ID.')),
          h('li', null, msg('查询结果与关键指标；排队状态表示尚未得到最终评分。', 'Check results and metrics. Queued submissions are waiting for a final score.'))))));
}

export { PlaygroundWorkbench };

