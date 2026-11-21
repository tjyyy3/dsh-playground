import * as React from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../shared/react.js';
import { taskModalCss } from '../shared/styles.js';
import { workspaceOptions } from '../shared/workspaces.js';

function StartTaskButton({ id, title, mode = 'participate', sessionId, requestTask, disabled = false }) {
  return h('button', { className: 'pg-button', disabled, onClick: () => requestTask({ id: String(id), title: title || String(id), mode, sessionId }) },
    mode === 'author' ? `开始出题任务 · ${title || id}` : `开始参赛任务 · ${title || id}`);
}

function TaskStartOverlay(props) {
  const request = props.useTaskRequest((value) => value);
  return request ? h(TaskStartDialog, { key: request.kind === 'controller' ? 'controller' : `${request.sessionId}:${request.id}:${request.mode}`, ...props, request }) : null;
}

function TaskStartDialog({ request, useWorkspaces, closeTaskStart, addTaskWorkspace, run, openTask, inspectController, openController, openControllerChat }) {
  const workspaces = useWorkspaces((value) => value);
  const [selectedId, setSelectedId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState('');
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
  const actionLabel = controller ? (snapshot?.kind === 'absent' ? '创建主控对话' : snapshot?.kind === 'incomplete' ? '初始化主控对话' : '打开主控对话')
    : request.mode === 'author' ? '创建出题任务' : '创建参赛任务';
  const title = controller ? '打开工作区主控' : actionLabel;
  const controllerError = snapshot?.kind === 'blocked' ? `${snapshot.reason}${snapshot.sessionIds?.length ? ` 对话编号：${snapshot.sessionIds.join('、')}` : ''}`
    : archived ? '主控对话已归档。请先在 DSH 中取消归档。' : '';
  // DSH keeps `phase` at 'pending' after a terminal list failure and reports it through `state`.
  const listError = workspaces.state === 'error' ? `无法读取 DSH 工作区列表${workspaces.error?.message ? `：${workspaces.error.message}` : ''}。请重启 DSH 后重试。` : '';
  const loading = workspaces.phase !== 'ready' && !listError;
  const hint = listError || (loading ? '正在读取 DSH 工作区列表…' : workspaces.items.length ? '选择已有工作区，或添加一个专用目录。' : '还没有工作区，请先添加。');
  const confirm = async () => {
    if (!workspace || workspaces.phase !== 'ready' || busy || adding || (controller && (!snapshot || controllerError))) return;
    setBusy(true); setError('');
    if (controller) {
      try {
        const result = await openController({ workspaceId: workspace.workspaceId, createIfMissing: needsInitialization });
        if (result.kind !== 'opened') {
          setError(`${result.reason}${result.sessionIds?.length ? ` 对话编号：${result.sessionIds.join('、')}` : ''}`);
          if (result.code === 'controller_init_failed' || result.code === 'controller_init_required') setInspection({ workspaceId: inspectId, snapshot: { kind: 'incomplete', codex: snapshot.codex } });
          if (result.code === 'controller_attach_failed') setInspection({ workspaceId: inspectId, snapshot: result });
        } else {
          setInspection({ workspaceId: inspectId, snapshot: { kind: 'existing', codex: snapshot.codex } });
          await openControllerChat(result.sessionId, workspace.workspaceId);
          closeTaskStart();
          return;
        }
      } catch (failure) { setError(failure.message || '无法打开主控对话，请重试。'); }
      setBusy(false);
      return;
    }
    let created;
    try { const result = await run(request.sessionId, { action: 'start', challenge_id: request.id, mode: request.mode, workspace_id: workspace.workspaceId });
      if (result.ok && result.sessionId) created = result.sessionId;
      else setError(result.error?.message || '任务创建失败');
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
    h('p', { className: 'pg-task-subtitle' }, controller ? '选择要协调工作的 DSH 工作区。' : '选择任务文件的存放工作区'),
    h('button', { type: 'button', className: 'pg-task-close', 'aria-label': controller ? '关闭工作区主控' : '取消创建任务', disabled: busy || adding, onClick: closeTaskStart },
      h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'm6 6 12 12M18 6 6 18' })))),
  h('div', { className: 'pg-task-body', 'aria-busy': busy || adding || loading || checking },
    controller ? null : h('section', { className: 'pg-task-summary', 'aria-label': '目标赛题' },
      h('div', { className: 'pg-task-summary-top' },
        h('h3', { className: 'pg-task-title', title: request.title }, request.title),
        h('span', { className: 'pg-task-mode' }, request.mode === 'author' ? '出题' : '参赛')),
      h('p', { className: 'pg-task-id' }, request.id)),
    h('div', { className: 'pg-task-field' },
      h('label', { htmlFor: 'pg-task-workspace' }, '目标工作区'),
      h('div', { className: 'pg-task-select-wrap' },
        h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M3 7.5h6l2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18' })),
        h('select', { id: 'pg-task-workspace', className: 'pg-task-select', 'aria-invalid': Boolean(error || controllerError),
          'aria-describedby': `${workspace ? 'pg-task-path' : 'pg-task-hint'}${error || controllerError ? ' pg-task-error' : ''}`, 'data-empty': !workspace, 'data-modal-autofocus': true,
          value: workspace ? selectedId : '', disabled: workspaces.phase !== 'ready' || busy || adding,
          onChange: (event) => { setSelectedId(event.target.value); setError(''); setInspection(null); } },
          h('option', { value: '' }, '请选择工作区'),
          workspaceOptions(workspaces.items)),
        h('svg', { className: 'pg-task-chevron', viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'm6 9 6 6 6-6' }))),
      workspace ? h('p', { id: 'pg-task-path', className: 'pg-task-path' }, workspace.path)
        : h('p', { id: 'pg-task-hint', className: listError ? 'pg-task-error' : 'pg-task-hint', role: listError ? 'alert' : loading ? 'status' : undefined }, hint),
      checking ? h('p', { className: 'pg-task-hint', role: 'status' }, '正在核对工作区的主控对话…') : null,
      (error || controllerError) ? h('p', { id: 'pg-task-error', className: 'pg-task-error', role: 'alert' }, error || controllerError) : null,
      needsInitialization ? h('p', { className: 'pg-task-hint' }, '初始化会请当前 DSH 模型确认主控角色。') : null,
      snapshot?.codex ? h('p', { className: 'pg-task-hint' }, snapshot.codex === 'registered'
        ? '已检测到 Codex 子智能体。Codex 不可用时，主控可以改用 DSH 子智能体。' : '未启用 Codex 时，主控可将工作交给 DSH 子智能体，在独立对话中执行。') : null,
      h('button', { type: 'button', className: 'pg-task-add', disabled: busy || adding, onClick: async () => {
        setAdding(true); setError('');
        try { const created = await addTaskWorkspace(); if (created) setSelectedId(created.workspaceId); }
        catch (failure) { setError(failure.message); } finally { setAdding(false); }
      } }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M12 5v14M5 12h14' })), adding ? '正在选择目录…' : '添加工作区…'))),
  h('footer', { className: 'pg-task-footer' },
    h('p', null, controller ? '主控派发任务并汇总结果。赛题提交在独立参赛对话中完成。' : '将在所选目录创建独立对话并读写任务文件。'),
    h('div', { className: 'pg-task-actions' },
      h('button', { type: 'button', className: 'pg-task-button', disabled: busy || adding, onClick: closeTaskStart }, '取消'),
      h('button', { type: 'button', className: 'pg-task-button pg-task-create', 'data-busy': busy,
        disabled: !workspace || workspaces.phase !== 'ready' || busy || adding || (controller && (!snapshot || Boolean(controllerError))), onClick: confirm },
        busy ? h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M21 12a9 9 0 1 1-9-9' })) : null,
        busy ? (controller ? '正在打开…' : '正在创建…') : actionLabel))));
}

export { StartTaskButton, TaskStartOverlay };

