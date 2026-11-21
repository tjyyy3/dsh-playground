import * as React from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../shared/react.js';
import { taskModalCss } from '../shared/styles.js';
import { workspaceOptions } from '../shared/workspaces.js';

function ControllerHandoffDialog({ state, workspaces, workspace, busy, selectWorkspace, addTaskWorkspace, message, action, close }) {
  const [picker] = React.useState(() => ({ pending: false }));
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState('');
  const title = '交给工作区主控';
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
      setAddError('无法添加工作区，请重试。');
    } finally {
      picker.pending = false;
      setAdding(false);
    }
  };
  return h(Modal, { open: true, headless: true, backdropBlur: false, className: 'pg-task-modal', title, onClose: dismiss },
    h('style', null, taskModalCss),
    h('header', { className: 'pg-task-header' }, h('h2', { tabIndex: -1, 'data-modal-autofocus': true }, title),
      h('button', { type: 'button', className: 'pg-task-close', 'aria-label': '关闭交接弹窗', disabled: busy || adding, onClick: dismiss },
        h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'm6 6 12 12M18 6 6 18' })))),
    h('div', { className: 'pg-task-body' },
      h('section', { className: 'pg-task-summary', 'aria-label': '目标赛题' },
        h('h3', { className: 'pg-task-title', title: state.challenge.title }, state.challenge.title),
        h('p', { className: 'pg-task-id' }, state.challenge.id)),
      h('div', { className: 'pg-task-field' },
        h('label', { htmlFor: 'pg-handoff-workspace' }, '目标工作区'),
        h('div', { className: 'pg-task-select-wrap' },
          h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M3 7.5h6l2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18' })),
          h('select', { id: 'pg-handoff-workspace', className: 'pg-task-select', value: workspace?.workspaceId || '', disabled: !canSelect,
            'data-empty': !workspace,
            'aria-describedby': message ? 'pg-handoff-status' : undefined,
            onChange: (event) => { setAddError(''); selectWorkspace(event.target.value); } },
            h('option', { value: '' }, '请选择工作区'), workspaceOptions(workspaces.items)),
          h('svg', { className: 'pg-task-chevron', viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'm6 9 6 6 6-6' }))),
        message ? h('p', { id: 'pg-handoff-status', className: failed ? 'pg-task-error' : 'pg-task-hint', role: failed ? 'alert' : 'status' }, message) : null,
        addError ? h('p', { className: 'pg-task-error', role: 'alert' }, addError) : null,
        canAdd ? h('button', { type: 'button', className: 'pg-task-add', disabled: busy || adding, onClick: addWorkspace },
          h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M12 5v14M5 12h14' })), adding ? '正在选择目录…' : '添加工作区…') : null)),
    h('footer', { className: 'pg-task-footer' },
      h('div', { className: 'pg-task-actions' },
        h('button', { type: 'button', className: 'pg-task-button', disabled: busy || adding, onClick: dismiss }, accepted ? '关闭' : '取消'),
        action || busy ? h('button', { type: 'button', className: 'pg-task-button pg-task-create', disabled: busy || adding, 'data-busy': busy, onClick: action?.run },
          busy ? h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M21 12a9 9 0 1 1-9-9' })) : null,
          busy ? state.phase === 'opening' ? '正在打开…' : '正在交接…' : action.label) : null)));
}

export { ControllerHandoffDialog };

