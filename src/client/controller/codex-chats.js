import * as React from 'react';
import { h } from '../shared/react.js';

const reasons = {
  controller_changed: '主控或工作区已变更，请重新打开。',
  target_missing: '找不到此对话，请刷新并核对编号。',
  target_changed: '目标会话已变更，请重新选择。',
  thread_not_attached: '共享 Codex 服务未打开该会话。请在原会话中继续。',
  thread_busy: '该对话正在运行或状态未知，请稍后查看。',
  codex_incompatible: '请使用支持工作区和账号筛选的本机 Codex 版本。',
  user_action_required: '请从主控工作台发起操作。',
  interaction_required: '此轮需要在原 Codex 对话中处理交互。',
};
const label = (source) => `${source.title} · ${source.threadId}`;
const verdict = (source) => source.text || (source.result === 'empty' ? '最近一轮暂无最终回复。' :
  source.result === 'unknown' ? '最近一轮结果未知。' : '');

export function CodexChats({ workspaceId, sessionId, query, initial, refresh }) {
  const [data, setData] = React.useState(initial || null);
  const [selected, select] = React.useState(null);
  const [target, setTarget] = React.useState('');
  const [draft, setDraft] = React.useState(initial?.message || '');
  const [choices, setChoices] = React.useState(initial?.kind === 'choose' ? initial.rows : null);
  const [response, setResponse] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [control] = React.useState(() => ({ active: true, writing: false, read: null }));
  React.useEffect(() => {
    control.active = true;
    if (!initial) read('list');
    return () => { control.active = false; control.read?.abort(); };
  }, [refresh, query]);
  async function read(action, threadId) {
    control.read?.abort();
    const abort = new AbortController();
    control.read = abort;
    try {
      const result = await query({ action, workspaceId, sessionId, ...(threadId ? { threadId } : {}) }, abort.signal);
      if (!abort.signal.aborted) setData(result);
    } catch {
      if (!abort.signal.aborted) setData({ kind: 'unavailable' });
    }
  }
  async function send(source) {
    if (!draft.trim() || control.writing) return;
    const rows = data?.rows || [];
    const named = target.trim();
    if (!source) {
      const matches = named ? rows.filter((item) => item.threadId === named || item.title === named) : rows;
      if (matches.length > 1 || !named && (matches.length !== 1 || data.partial)) {
        setChoices(matches); setResponse(null); return;
      }
    }
    control.writing = true;
    setBusy(true); setResponse(null); setCopied(false);
    try {
      const result = await query({ workspaceId, sessionId, action: 'send', message: draft,
        ...(source ? { threadId: source.threadId } : named ? { target: named } : { threadId: rows[0].threadId }) });
      if (!control.active) return;
      if (result.kind === 'choose') { setChoices(result.rows); return; }
      setResponse(result);
      if (result.kind === 'sent' || result.kind === 'unknown') {
        select(result.source); setChoices(null); setDraft('');
      }
    } catch {
      if (control.active) { setResponse({ kind: 'unknown', source }); setDraft(''); setChoices(null); }
    } finally {
      control.writing = false;
      if (control.active) setBusy(false);
    }
  }
  const rows = data?.rows || [];
  return h('section', { className: 'pg-codex-chats', 'aria-label': '工作区 Codex 对话' },
    h('h3', null, '工作区 Codex 对话'),
    !data ? h('p', { role: 'status' }, '正在查找本工作区对话…') :
      data.kind === 'unavailable' ? h('p', { role: 'status' }, reasons[data.code] || '无法读取本机 Codex 对话。') :
      rows.length === 0 ? h('p', null, '本工作区暂无可见的 Codex 对话。') : null,
    rows.map((source) => h('div', { key: source.threadId },
      h('button', { type: 'button', className: 'pg-controller-row', disabled: busy,
        onClick: () => { select(source); setChoices(null); setResponse(null); } },
        h('strong', null, source.title), h('span', null, source.threadId)),
      verdict(source) ? h('p', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, verdict(source)) : null)),
    data?.partial ? h('p', null, '仅显示最近的部分对话。可通过完整会话编号指定目标。') : null,
    rows.length > 0 && data.kind !== 'summary' ? h('button', { type: 'button', className: 'pg-controller-action',
      disabled: busy, onClick: () => read('summary') }, '汇总最近结果') : null,
    rows.length || selected ? h('div', null,
      selected ? h('p', null, `回复 ${label(selected)} `, h('button', { type: 'button', disabled: busy,
        onClick: () => { select(null); setChoices(null); } }, '更换目标')) :
      h('label', null, '目标会话', h('input', { value: target, disabled: busy, placeholder: '完整编号或标题',
        onChange: (event) => { setTarget(event.target.value); setChoices(null); } })),
      h('label', null, '追问内容', h('textarea', { value: draft, disabled: busy, maxLength: 8000,
        onChange: (event) => setDraft(event.target.value) })),
      choices ? h('div', null, h('p', null, '选择接收这条追问的原会话。'), choices.map((source) =>
        h('button', { key: source.threadId, type: 'button', disabled: busy || !draft.trim(), className: 'pg-controller-row',
          onClick: () => send(source) }, `发送给 ${label(source)}`))) :
      h('button', { type: 'button', className: 'pg-controller-action', disabled: busy || !draft.trim(), onClick: () => send(selected) },
        busy ? '等待原会话回复…' : '发送追问')) : null,
    response ? h('div', { role: 'status' },
      response.source ? h('strong', null, label(response.source)) : null,
      h('p', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } },
        response.kind === 'sent' ? response.text || `该轮状态为 ${response.turnStatus}，暂无最终回复。` :
        response.kind === 'unknown' && response.code === 'interaction_required' ? '该轮需要权限或用户输入，请在原 Codex 会话查看。' :
        response.kind === 'unknown' ? '发送结果待核实。请先在原 Codex 会话查看该轮，再决定是否重新发送。' :
        reasons[response.code] || '无法连接可接收追问的本机 Codex 服务。请在原会话继续。'),
      response.kind === 'unavailable' && draft ? h('button', { type: 'button', onClick: async () => {
        try { await navigator.clipboard.writeText(draft); setCopied(true); } catch { setCopied(false); }
      } }, copied ? '已复制' : '复制追问') : null) : null);
}
