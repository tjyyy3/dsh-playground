import { msg } from '../shared/language.js';
import * as React from 'react';
import { h } from '../shared/react.js';

const reasons = () => ({
  controller_changed: msg('主控或工作区已变更，请重新打开。', 'The controller or workspace changed. Reopen it to continue.'),
  target_missing: msg('找不到此对话，请刷新并核对编号。', 'Chat not found. Refresh and check the ID.'),
  target_changed: msg('目标会话已变更，请重新选择。', 'The target chat changed. Select it again.'),
  thread_not_attached: msg('共享 Codex 服务未打开该会话。请在原会话中继续。', 'The shared Codex service has not opened this chat. Continue in the original chat.'),
  thread_busy: msg('该对话正在运行或状态未知，请稍后查看。', 'The chat is running or its status is unknown. Check again later.'),
  codex_incompatible: msg('请使用支持工作区和账号筛选的本机 Codex 版本。', 'Use a local Codex version that supports workspace and account filters.'),
  user_action_required: msg('请从主控工作台发起操作。', 'Start this action from the controller workbench.'),
  interaction_required: msg('此轮需要在原 Codex 对话中处理交互。', 'This turn needs your input in the original Codex chat.'),
});
const label = (source) => `${source.title} · ${source.threadId}`;
const verdict = (source) => source.text || (source.result === 'empty' ? msg('最近一轮暂无最终回复。', 'The latest turn has no final reply yet.') :
  source.result === 'unknown' ? msg('最近一轮结果未知。', 'The outcome of the latest turn is unknown.') : '');

export function ExternalCodexChats({ workspaceId, sessionId, query, refresh }) {
  const [detection, setDetection] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [hasOpened, setHasOpened] = React.useState(false);
  React.useEffect(() => {
    const abort = new AbortController();
    async function detect() {
      try {
        const result = await query({ action: 'detect', workspaceId, sessionId }, abort.signal);
        if (!abort.signal.aborted) setDetection({ query, refresh, available: result?.kind === 'available' });
      } catch {
        if (!abort.signal.aborted) setDetection(null);
      }
    }
    void detect();
    return () => abort.abort();
  }, [workspaceId, sessionId, query, refresh]);
  const available = detection?.available === true && detection.query === query && detection.refresh === refresh;
  if (!available && !hasOpened) return null;
  return h('details', { className: 'pg-controller-external-chats', hidden: !available, open,
    onToggle: (event) => {
      const expanded = event.currentTarget.open;
      setOpen(expanded);
      if (expanded) setHasOpened(true);
    } },
  available ? h('summary', null, msg('外部 Codex 对话', 'External Codex chats')) : null,
  hasOpened ? h(CodexChats, { workspaceId, sessionId, query, showHeading: false, visible: available,
    listRefresh: available && open ? refresh : null }) : null);
}

export function CodexChats({ workspaceId, sessionId, query, initial, showHeading = true, visible = true, listRefresh = 0 }) {
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
    return () => { control.active = false; control.read?.abort(); };
  }, [query]);
  React.useEffect(() => {
    if (initial || listRefresh === null) return;
    void read('list');
    const abort = control.read;
    return () => abort.abort();
  }, [query, listRefresh]);
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
    let displayed;
    if (!source) {
      const matches = named ? rows.filter((item) => item.threadId === named || item.title === named) : rows;
      if (matches.length > 1 || !named && (matches.length !== 1 || data.partial)) {
        setChoices(matches); setResponse(null); return;
      }
      [displayed] = matches;
    }
    control.writing = true;
    setBusy(true); setResponse(null); setCopied(false);
    try {
      const result = await query({ workspaceId, sessionId, action: 'send', message: draft,
        ...(source ? { threadId: source.threadId } : named
          ? { target: named, ...(displayed ? { expectedThreadId: displayed.threadId } : {}) }
          : { threadId: displayed.threadId }) });
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
  if (!visible) return null;
  const rows = data?.rows || [];
  const hasFollowUp = rows.length > 0 || selected || (!initial && (target || draft));
  return h('section', { className: 'pg-codex-chats', 'aria-label': msg('工作区 Codex 对话', 'Workspace Codex chats') },
    showHeading ? h('h3', null, msg('工作区 Codex 对话', 'Workspace Codex chats')) : null,
    !data ? h('p', { role: 'status' }, msg('正在查找本工作区对话…', 'Finding chats in this workspace…')) :
      data.kind === 'unavailable' ? h('p', { role: 'status' }, reasons()[data.code] || msg('无法读取本机 Codex 对话。', 'Could not read local Codex chats.')) :
      rows.length === 0 ? h('p', null, msg('本工作区暂无可见的 Codex 对话。', 'No Codex chats are visible in this workspace.')) : null,
    rows.map((source) => h('div', { key: source.threadId },
      h('button', { type: 'button', className: 'pg-controller-row', disabled: busy,
        onClick: () => { select(source); setChoices(null); setResponse(null); } },
        h('strong', null, source.title), h('span', null, source.threadId)),
      verdict(source) ? h('p', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, verdict(source)) : null)),
    data?.partial ? h('p', null, msg('仅显示最近的部分对话。可通过完整会话编号指定目标。', 'Showing recent chats only. Enter the full chat ID to select another.')) : null,
    rows.length > 0 && data.kind !== 'summary' ? h('button', { type: 'button', className: 'pg-controller-action',
      disabled: busy, onClick: () => read('summary') }, msg('汇总最近结果', 'Summarize recent results')) : null,
    hasFollowUp ? h('div', null,
      selected ? h('p', null, msg(`回复 ${label(selected)} `, `Reply to ${label(selected)} `), h('button', { type: 'button', disabled: busy,
        onClick: () => { select(null); setChoices(null); } }, msg('更换目标', 'Change target'))) :
      h('label', null, msg('目标会话', 'Target chat'), h('input', { value: target, disabled: busy, placeholder: msg('完整编号或标题', 'Full ID or title'),
        onChange: (event) => { setTarget(event.target.value); setChoices(null); } })),
      h('label', null, msg('追问内容', 'Follow-up message'), h('textarea', { value: draft, disabled: busy, maxLength: 8000,
        onChange: (event) => setDraft(event.target.value) })),
      choices ? h('div', null, h('p', null, msg('选择接收这条追问的原会话。', 'Choose the original chat to receive this follow-up.')), choices.map((source) =>
        h('button', { key: source.threadId, type: 'button', disabled: busy || !draft.trim(), className: 'pg-controller-row',
          onClick: () => send(source) }, msg(`发送给 ${label(source)}`, `Send to ${label(source)}`)))) :
      h('button', { type: 'button', className: 'pg-controller-action', disabled: busy || !draft.trim(), onClick: () => send(selected) },
        busy ? msg('等待原会话回复…', 'Waiting for a reply from the original chat…') : msg('发送追问', 'Send follow-up'))) : null,
    response ? h('div', { role: 'status' },
      response.source ? h('strong', null, label(response.source)) : null,
      response.kind === 'sent' && response.turnStatus ? h('p', null, msg(`该轮状态：${response.turnStatus}`, `Turn status: ${response.turnStatus}`)) : null,
      h('p', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } },
        response.kind === 'sent' ? response.text || msg('暂无最终回复。', 'No final reply yet.') :
        response.kind === 'unknown' && response.code === 'interaction_required' ? msg('该轮需要权限或用户输入，请在原 Codex 会话查看。', 'This turn needs permission or input. Open the original Codex chat.') :
        response.kind === 'unknown' ? msg('发送结果待核实。请先在原 Codex 会话查看该轮，再决定是否重新发送。', 'Delivery is unconfirmed. Check the turn in the original Codex chat before resending.') :
        reasons()[response.code] || msg('无法连接可接收追问的本机 Codex 服务。请在原会话继续。', 'Could not connect to a local Codex service that accepts follow-ups. Continue in the original chat.')),
      response.kind === 'unavailable' && draft ? h('button', { type: 'button', onClick: async () => {
        try { await navigator.clipboard.writeText(draft); setCopied(true); } catch { setCopied(false); }
      } }, copied ? msg('已复制', 'Copied') : msg('复制追问', 'Copy follow-up')) : null) : null);
}
