import { msg, usePluginLanguage } from '../shared/language.js';
import * as React from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { controllerMessage } from '../controller/messages.js';
import { h } from '../shared/react.js';
import { taskModalCss } from '../shared/styles.js';
import { workspaceOptions } from '../shared/workspaces.js';

function StartTaskButton({ id, title, mode = 'participate', sessionId, requestTask, disabled = false, primary = false }) {
  return h('button', { type: 'button', className: primary ? 'pg-button pg-primary' : 'pg-button pg-list-action', disabled, onClick: () => requestTask({ id: String(id), title: title || String(id), mode, sessionId }) },
    primary ? h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': true },
      h('path', { d: 'M2 1v8l6-4z', fill: 'currentColor' })) : null,
    mode === 'author' ? msg(`开始出题任务 · ${title || id}`, `Start authoring task · ${title || id}`) : msg(`开始参赛任务 · ${title || id}`, `Start participation task · ${title || id}`));
}

function TaskStartOverlay(props) {
  usePluginLanguage();
  const request = props.useTaskRequest((value) => value);
  return request ? h(TaskStartDialog, { key: request.kind === 'controller' ? 'controller' : `${request.sessionId}:${request.id}:${request.mode}`, ...props, request }) : null;
}

function TaskStartDialog({ request, useWorkspaces, closeTaskStart, addTaskWorkspace, run, openTask, inspectController, openController, openControllerChat }) {
  const workspaces = useWorkspaces((value) => value);
  const [selectedId, setSelectedId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState('');
  const [recovery, setRecovery] = React.useState(null);
  const [inspection, setInspection] = React.useState(null);
  const controller = request.kind === 'controller';
  const workspace = workspaces.items.find((item) => item.workspaceId === selectedId);
  const inspectId = controller && workspaces.phase === 'ready' ? workspace?.workspaceId : undefined;
  const snapshot = inspectId && inspection?.workspaceId === inspectId ? inspection.snapshot : null;
  const checking = Boolean(inspectId && !snapshot);
  React.useEffect(() => {
    if (!inspectId) return;
    const abort = new AbortController();
    inspectController({ workspaceId: inspectId }, abort.signal)
      .catch((failure) => ({ kind: 'blocked', reason: failure.message }))
      .then((value) => { if (!abort.signal.aborted) setInspection({ workspaceId: inspectId, snapshot: value }); });
    return () => abort.abort();
  }, [inspectId, inspectController]);
  const archived = snapshot?.archived;
  const needsInitialization = snapshot?.kind === 'absent' || snapshot?.kind === 'incomplete';
  const createLabel = controller ? (snapshot?.kind === 'absent' ? msg('创建主控对话', 'Create controller chat') : snapshot?.kind === 'incomplete' ? msg('初始化主控对话', 'Initialize controller chat') : msg('打开主控对话', 'Open controller chat'))
    : request.mode === 'author' ? msg('创建出题任务', 'Create authoring task') : msg('创建参赛任务', 'Create participation task');
  const actionLabel = recovery ? msg('打开任务对话', 'Open task chat') : createLabel;
  const title = controller ? msg('打开工作区主控', 'Open workspace controller') : actionLabel;
  const controllerError = snapshot?.kind === 'blocked' ? blockedReason(snapshot)
    : archived ? msg('主控对话已归档。请先在 DSH 中取消归档。', 'The controller chat is archived. Unarchive it in DSH first.') : '';
  // DSH keeps `phase` at 'pending' after a terminal list failure and reports it through `state`.
  const listError = workspaces.state === 'error' ? msg(`无法读取 DSH 工作区列表${workspaces.error?.message ? `：${workspaces.error.message}` : ''}。请重启 DSH 后重试。`, `Could not load DSH workspaces${workspaces.error?.message ? `: ${workspaces.error.message}` : ''}. Restart DSH and try again.`) : '';
  const loading = workspaces.phase !== 'ready' && !listError;
  const hint = listError || (loading ? msg('正在读取 DSH 工作区列表…', 'Loading DSH workspaces…') : workspaces.items.length ? msg('选择已有工作区，或添加一个专用目录。', 'Select an existing workspace or add a dedicated folder.') : msg('还没有工作区，请先添加。', 'Add a workspace to get started.'));
  const actionError = recovery ? [recovery.message, error].filter(Boolean).join(' ') : error || controllerError;
  const unavailable = busy || adding || (!recovery && (!workspace || workspaces.phase !== 'ready' || (controller && (!snapshot || Boolean(controllerError)))));
  const confirm = async () => {
    if (unavailable) return;
    setBusy(true); setError('');
    if (recovery) {
      try {
        await openTask(recovery.sessionId);
        closeTaskStart();
      } catch {
        setError(msg('无法打开任务对话，请重试。', 'Could not open the task chat. Try again.'));
        setBusy(false);
      }
      return;
    }
    if (controller) {
      try {
        const result = await openController({ workspaceId: workspace.workspaceId, createIfMissing: needsInitialization });
        if (result.kind !== 'opened') {
          setError(blockedReason(result));
          if (result.code === 'controller_init_failed' || result.code === 'controller_init_required') setInspection({ workspaceId: inspectId, snapshot: { kind: 'incomplete', codex: snapshot.codex } });
          if (result.code === 'controller_attach_failed') setInspection({ workspaceId: inspectId, snapshot: result });
        } else {
          setInspection({ workspaceId: inspectId, snapshot: { kind: 'existing', codex: snapshot.codex } });
          await openControllerChat(result.sessionId, workspace.workspaceId);
          closeTaskStart();
          return;
        }
      } catch (failure) { setError(controllerMessage(failure.message || '无法打开主控对话，请重试。')); }
      setBusy(false);
      return;
    }
    let created;
    try {
      const result = await run(request.sessionId, { action: 'start', challenge_id: request.id, mode: request.mode, workspace_id: workspace.workspaceId });
      if (result.ok && result.sessionId) created = result.sessionId;
      else {
        const message = result.error?.message || msg('任务创建失败', 'Could not create the task');
        if (typeof result.sessionId === 'string' && result.sessionId) setRecovery({ sessionId: result.sessionId, message });
        else setError(message);
      }
    } catch (failure) { setError(failure.message); }
    if (!created) { setBusy(false); return; }
    // Closing unmounts the dialog, so no state is set afterwards. The task already exists and
    // stays reachable from the task list if navigation fails.
    closeTaskStart();
    Promise.resolve(openTask(created)).catch((failure) => console.warn('Playground: failed to open the new task conversation', failure));
  };
  return h(Modal, { open: true, headless: true, backdropBlur: false, className: 'pg-task-modal', title,
    onClose: () => { if (!busy && !adding) closeTaskStart(); } },
  h('style', null, taskModalCss),
  h('header', { className: 'pg-task-header' },
    h('h2', null, title),
    recovery ? null : h('p', { className: 'pg-task-subtitle' }, controller ? msg('选择要协调工作的 DSH 工作区。', 'Select the DSH workspace for the controller.') : msg('选择任务文件的存放工作区', 'Choose a workspace for the task files')),
    h('button', { type: 'button', className: 'pg-task-close', 'aria-label': controller ? msg('关闭工作区主控', 'Close workspace controller') : recovery ? msg('关闭', 'Close') : msg('取消创建任务', 'Cancel task creation'), disabled: busy || adding, onClick: closeTaskStart },
      h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'm6 6 12 12M18 6 6 18' })))),
  h('div', { className: 'pg-task-body', 'aria-busy': busy || adding || loading || checking },
    controller ? null : h('section', { className: 'pg-task-summary', 'aria-label': msg('目标赛题', 'Target challenge') },
      h('div', { className: 'pg-task-summary-top' },
        h('h3', { className: 'pg-task-title', title: request.title }, request.title),
        h('span', { className: 'pg-task-mode' }, request.mode === 'author' ? msg('出题', 'Author') : msg('参赛', 'Participate'))),
      h('p', { className: 'pg-task-id' }, request.id)),
    recovery ? h('p', { className: 'pg-task-error', role: 'alert' }, actionError) : h('div', { className: 'pg-task-field' },
      h('label', { htmlFor: 'pg-task-workspace' }, msg('目标工作区', 'Workspace')),
      h('div', { className: 'pg-task-select-wrap' },
        h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M3 7.5h6l2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18' })),
        h('select', { id: 'pg-task-workspace', className: 'pg-task-select', 'aria-invalid': Boolean(actionError),
          'aria-describedby': `${workspace ? 'pg-task-path' : 'pg-task-hint'}${actionError ? ' pg-task-error' : ''}`, 'data-empty': !workspace, 'data-modal-autofocus': true,
          value: workspace ? selectedId : '', disabled: workspaces.phase !== 'ready' || busy || adding,
          onChange: (event) => { setSelectedId(event.target.value); setError(''); setInspection(null); } },
          h('option', { value: '' }, msg('请选择工作区', 'Select a workspace')),
          workspaceOptions(workspaces.items)),
        h('svg', { className: 'pg-task-chevron', viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'm6 9 6 6 6-6' }))),
      workspace ? h('p', { id: 'pg-task-path', className: 'pg-task-path' }, workspace.path)
        : h('p', { id: 'pg-task-hint', className: listError ? 'pg-task-error' : 'pg-task-hint', role: listError ? 'alert' : loading ? 'status' : undefined }, hint),
      checking ? h('p', { className: 'pg-task-hint', role: 'status' }, msg('正在核对工作区的主控对话…', 'Checking the workspace controller chat…')) : null,
      actionError ? h('p', { id: 'pg-task-error', className: 'pg-task-error', role: 'alert' }, actionError) : null,
      needsInitialization ? h('p', { className: 'pg-task-hint' }, msg('初始化会请当前 DSH 模型确认主控角色。', 'Initialization asks the current DSH model to confirm its controller role.')) : null,
      snapshot?.codex ? h('p', { className: 'pg-task-hint' }, snapshot.codex === 'registered'
        ? msg('已检测到 Codex 子智能体。Codex 不可用时，主控可以改用 DSH 子智能体。', 'Codex subagents are available. The controller can use DSH subagents if Codex becomes unavailable.') : msg('未启用 Codex 时，主控可将工作交给 DSH 子智能体，在独立对话中执行。', 'When Codex is disabled, the controller can delegate work to DSH subagents in separate chats.')) : null,
      h('button', { type: 'button', className: 'pg-task-add', disabled: busy || adding, onClick: async () => {
        setAdding(true); setError('');
        try { const created = await addTaskWorkspace(); if (created) setSelectedId(created.workspaceId); }
        catch (failure) { setError(failure.message); } finally { setAdding(false); }
      } }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M12 5v14M5 12h14' })), adding ? msg('正在选择目录…', 'Choosing folder…') : msg('添加工作区…', 'Add workspace…')))),
  h('footer', { className: 'pg-task-footer' },
    recovery ? null : h('p', null, controller ? msg('主控派发任务并汇总结果。赛题提交在独立参赛对话中完成。', 'The controller assigns tasks and collects results. Submit challenges from their separate participation chats.') : msg('将在所选目录创建独立对话并读写任务文件。', 'A separate chat will use the selected directory to read and write task files.')),
    h('div', { className: 'pg-task-actions' },
      h('button', { type: 'button', className: 'pg-task-button', disabled: busy || adding, onClick: closeTaskStart }, msg('取消', 'Cancel')),
      h('button', { type: 'button', className: 'pg-task-button pg-task-create', 'data-busy': busy,
        disabled: unavailable, onClick: confirm },
        busy ? h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M21 12a9 9 0 1 1-9-9' })) : null,
        busy ? (controller || recovery ? msg('正在打开…', 'Opening…') : msg('正在创建…', 'Creating…')) : actionLabel))));
}

function blockedReason({ reason, sessionIds }) {
  const message = controllerMessage(reason);
  return sessionIds?.length ? message + msg(` 对话编号：${sessionIds.join('、')}`, ` Chat IDs: ${sessionIds.join(', ')}`) : message;
}

export { StartTaskButton, TaskStartOverlay };

