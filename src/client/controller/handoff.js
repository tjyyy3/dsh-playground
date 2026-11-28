import { msg } from '../shared/language.js';
import * as React from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../shared/react.js';
import { taskModalCss } from '../shared/styles.js';
import { controllerDialogCss, handoffCss } from './dialog-styles.js';
import { workspaceControllerStatus } from './handoff-status.js';

function noticeHandoffCopy(inspection, workspace, notice) {
  const name = workspace.title || workspace.workspaceId;
  if (inspection.kind === 'absent') return { label: msg('创建主控对话', 'Create controller chat'),
    message: msg(`工作区「${name}」还没有主控。创建后可确认交接赛题。`, `Workspace “${name}” has no controller. Create one to continue to handoff confirmation.`) };
  if (inspection.kind === 'incomplete') return { label: msg('初始化主控对话', 'Initialize controller chat'),
    message: msg(`请先完成工作区「${name}」的主控 ${inspection.sessionId} 的初始化，再确认交接赛题。`,
      `Finish setting up controller ${inspection.sessionId} in workspace “${name}”, then confirm the handoff.`) };
  return { label: msg('确认交给主控', 'Confirm handoff'),
    message: !notice ? msg(`工作区「${name}」的主控 ${inspection.sessionId} 将协调此题。`,
      `Controller ${inspection.sessionId} in workspace “${name}” will coordinate this challenge.`)
      : msg(`工作区「${name}」的主控 ${inspection.sessionId} 将协调此题。已有任务会在主控中打开。`,
      `Controller ${inspection.sessionId} in workspace “${name}” will coordinate this challenge or open its existing work.`) };
}

function ControllerHandoffDialog({ state, workspaces, workspace, inspection, inspectionFailed, inspectController,
  taskCount, query, checkAttempt, busy, selectWorkspace, addTaskWorkspace, message, action, close }) {
  const [picker] = React.useState(() => ({ pending: false }));
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState('');
  const title = msg('交给工作区主控', 'Hand off to workspace controller');
  const groupName = React.useId();
  const [others, setOthers] = React.useState(null);
  const [platformCheck, setPlatformCheck] = React.useState(null);
  const activeId = workspace?.workspaceId;
  const challengeId = state.challenge.id;

  React.useEffect(() => {
    setOthers(null);
    if (workspaces.phase !== 'ready') return;
    const abort = new AbortController();
    for (const { workspaceId } of workspaces.items.filter((item) => item.workspaceId !== activeId)) {
      void inspectController({ workspaceId }, abort.signal).catch(() => ({ kind: 'blocked' })).then((result) => {
        if (!abort.signal.aborted) setOthers((previous) => new Map(previous).set(workspaceId, result));
      });
    }
    return () => abort.abort();
  }, [workspaces.phase, workspaces.items, activeId, inspectController, checkAttempt]);

  React.useEffect(() => {
    setPlatformCheck(null);
    const abort = new AbortController();
    void query({ action: 'challenge', challengeId }, abort.signal).then((detail) => {
      if (abort.signal.aborted) return;
      const checked = detail?.ok && String(detail.id) === challengeId && typeof detail.contentGated === 'boolean';
      setPlatformCheck({ challengeId, kind: checked ? detail.contentGated ? 'gated' : 'readable' : 'unavailable' });
    }).catch(() => {
      if (!abort.signal.aborted) setPlatformCheck({ challengeId, kind: 'unavailable' });
    });
    return () => abort.abort();
  }, [challengeId, query, checkAttempt]);
  const accepted = state.phase === 'accepted' || state.phase === 'opening';
  const canAdd = workspaces.phase === 'ready' && !accepted;
  const canSelect = canAdd && workspaces.items.length > 0 && !busy && !adding;
  const failed = state.phase === 'error' || state.phase === 'accepted' || workspaces.state === 'error';
  const dismiss = () => { if (!picker.pending) close(); };
  const addWorkspace = async () => {
    if (busy || picker.pending) return;
    picker.pending = true;
    setAdding(true);
    setAddError('');
    try {
      const created = await addTaskWorkspace();
      if (created?.workspaceId) selectWorkspace(created.workspaceId);
    } catch {
      setAddError(true);
    } finally {
      picker.pending = false;
      setAdding(false);
    }
  };
  const controllerStatus = (item) => {
    const selected = item.workspaceId === activeId;
    const status = selected ? inspection ?? (inspectionFailed ? { kind: 'blocked' } : null) : others?.get(item.workspaceId);
    return workspaceControllerStatus(status, selected ? taskCount : undefined, msg);
  };
  const workspaceCheck = workspaces.state === 'error' || ['workspace_missing', 'directory_missing'].includes(inspection?.code)
    ? [msg('无法读取', 'Unavailable'), 'error']
    : workspace ? [msg('已注册', 'Registered'), 'ready'] : [msg('等待选择', 'Choose a workspace'), 'muted'];
  const selected = workspace && controllerStatus(workspace);
  const platformKind = platformCheck?.challengeId === challengeId && platformCheck.kind;
  const platformResult = {
    readable: [msg('可查看题面', 'Statement available'), 'ready'],
    gated: [msg('需要访问权限', 'Access required'), 'warning'],
    unavailable: [msg('无法核实', 'Could not verify'), 'warning'],
  };
  const checks = [
    [msg('读取 DSH 工作区', 'Read DSH workspace'), ...workspaceCheck],
    [msg('核对主控对话', 'Verify controller chat'), selected?.check ?? msg('等待选择', 'Choose a workspace'), selected?.tone ?? 'muted'],
    [msg('向平台核实赛题', 'Verify challenge on Playground'), ...(platformResult[platformKind] ?? [msg('核实中', 'Checking'), 'muted'])],
  ];
  const codexHint = inspection?.codex === 'registered'
    ? msg('已检测到 Codex 子智能体。Codex 不可用时，主控可以改用 DSH 子智能体，在独立对话中执行。',
      'Codex subagents detected. If Codex is unavailable, the controller can use a DSH subagent in a separate chat.')
    : inspection?.codex === 'unavailable'
      ? msg('未检测到 Codex 子智能体。主控可以改用 DSH 子智能体，在独立对话中执行。',
        'No Codex subagent detected. The controller can use a DSH subagent in a separate chat.')
      : msg('Codex 子智能体可用性待核对。', 'Codex subagent availability is unverified.');

  return h(Modal, { open: true, headless: true, backdropBlur: true, className: 'pg-task-modal pg-controller-dialog pg-handoff-dialog', title, onClose: dismiss },
    h('style', null, taskModalCss + controllerDialogCss + handoffCss),
    h('header', { className: 'pg-task-header' }, h('h2', { tabIndex: -1, 'data-modal-autofocus': true }, title),
      h('button', { type: 'button', className: 'pg-task-close', 'aria-label': msg('关闭交接弹窗', 'Close handoff dialog'), disabled: busy || adding, onClick: dismiss },
        h('svg', { viewBox: '0 0 14 14', 'aria-hidden': true }, h('path', { d: 'm3 3 8 8M11 3l-8 8' })))),
    h('div', { className: 'pg-task-body' },
      h('section', { className: 'pg-handoff-section', 'aria-label': msg('目标赛题', 'Target challenge') },
        h('span', { className: 'pg-dialog-label' }, msg('目标赛题', 'Target challenge')),
        h('div', { className: 'pg-handoff-target' },
          h('span', { className: 'pg-handoff-icon' },
            h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M3 2.5h7.5L13 5v8.5H3zM5.5 8h5m-5 2.5H9' }))),
          h('div', null, h('h3', null, state.challenge.title),
            h('p', null, [challengeId, state.context?.competition, state.context?.period].filter(Boolean).join(' · '))))),
      h('fieldset', { className: 'pg-handoff-section', 'aria-describedby': message ? groupName + '-status' : undefined },
        h('legend', { className: 'pg-dialog-label' }, msg('目标工作区', 'Target workspace')),
        workspaces.items.map((item) => {
          const checked = item.workspaceId === activeId;
          const status = controllerStatus(item);
          return h('label', { key: item.workspaceId, className: 'pg-handoff-option', 'data-selected': checked },
            h('input', { type: 'radio', name: groupName, value: item.workspaceId, checked, disabled: !canSelect,
              onChange: () => { setAddError(''); selectWorkspace(item.workspaceId); } }),
            h('span', { className: 'pg-handoff-radio', 'aria-hidden': true }),
            h('span', { className: 'pg-handoff-option-body' },
              h('span', { className: 'pg-handoff-workspace' }, item.title || item.workspaceId,
                item.path ? h('span', { className: 'pg-handoff-path' }, item.path) : null),
              h('span', { className: 'pg-handoff-status', 'data-tone': status.tone }, status.label)));
        }),
        canAdd ? h('button', { type: 'button', className: 'pg-task-add', disabled: busy || adding, onClick: addWorkspace },
          h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M8 3v10M3 8h10' })),
          adding ? msg('正在选择目录…', 'Choosing folder…') : msg('添加工作区…', 'Add workspace…')) : null,
        addError ? h('p', { className: 'pg-task-error', role: 'alert' }, msg('无法添加工作区，请重试。', 'Could not add the workspace. Try again.')) : null),
      h('section', { className: 'pg-handoff-checks', 'aria-label': msg('核对结果', 'Verification results') },
        h('ol', null, checks.map(([label, result, tone]) => h('li', { key: label }, label, h('strong', { 'data-tone': tone }, result)))),
        message ? h('p', { id: groupName + '-status', 'data-tone': failed ? 'error' : undefined, role: failed ? 'alert' : 'status' }, message) : null),
      h('p', { className: 'pg-handoff-codex' },
        h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M2.5 4.5 6 8l-3.5 3.5M8 12h5.5' })), codexHint)),
    h('footer', { className: 'pg-task-footer' },
      h('p', null, msg('提交评测需在参赛任务中另行请求。', 'Request evaluation separately in the participation task.')),
      h('button', { type: 'button', className: 'pg-task-button', disabled: busy || adding, onClick: dismiss }, accepted ? msg('关闭', 'Close') : msg('取消', 'Cancel')),
      action || busy ? h('button', { type: 'button', className: 'pg-task-button pg-task-create', disabled: busy || adding, 'data-busy': busy, onClick: action?.run },
        busy ? h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M21 12a9 9 0 1 1-9-9' })) : null,
        busy ? state.phase === 'opening' ? msg('正在打开…', 'Opening…') : state.phase === 'initializing' ? msg('正在初始化…', 'Setting up…') : msg('正在交接…', 'Handing off…') : action.label) : null));
}

export { ControllerHandoffDialog, noticeHandoffCopy };
