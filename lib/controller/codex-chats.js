import { realpath } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { withCodex } from './codex-rpc.js';

const interactive = ['appServer', 'cli', 'vscode'];
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const samePath = (a, b) => isAbsolute(b) && relative(a, b) === '';
const unavailable = (code = 'codex_unavailable') => ({ kind: 'unavailable', code });

function visible(thread, paths, excluded) {
  return typeof thread?.cwd === 'string' && paths.some((path) => samePath(path, thread.cwd)) &&
    uuid.test(thread.id) && interactive.includes(thread.source) && !thread.parentThreadId &&
    !thread.ephemeral && thread.originator !== 'deepseek-harness' && !excluded.has(thread.id);
}
function row(thread) {
  return { threadId: thread.id, title: (thread.name?.trim() || thread.preview?.trim() || '未命名 Codex 对话').slice(0, 150),
    status: thread.status?.type ?? 'unknown' };
}
function finalText(items) {
  const message = items?.findLast((item) => item.type === 'agentMessage' &&
    (item.phase == null || item.phase === 'final_answer') && typeof item.text === 'string' && item.text.trim());
  return message?.text.trim().slice(0, 4000);
}

async function recent(rpc, source) {
  try {
    const page = await rpc.call('thread/turns/list', { threadId: source.threadId, sortDirection: 'desc', itemsView: 'full', limit: 1 });
    const turn = page.data?.[0];
    if (!Array.isArray(page.data)) return { ...source, result: 'unknown' };
    if (!turn) return { ...source, result: 'empty' };
    const text = turn.status === 'completed' && finalText(turn.items);
    return { ...source, turnId: turn.id, turnStatus: turn.status, result: text ? 'reply' : turn.status === 'completed' ? 'empty' : 'unknown',
      ...(text ? { text } : {}) };
  } catch { return { ...source, result: 'unknown' }; }
}

async function sendTurn(rpc, source, message, checkScope) {
  const { threadId } = source;
  const resumed = await rpc.call('thread/resume', { threadId, excludeTurns: true });
  if (!checkScope.thread(resumed.thread) || resumed.thread.id !== threadId) return unavailable('target_changed');
  if (resumed.thread.status?.type !== 'idle') return unavailable('thread_busy');
  await checkScope.current();
  const outcomes = new Map();
  const replies = new Map();
  const completion = Promise.withResolvers();
  let turnId;
  rpc.listen(({ method, params }) => {
    if (params?.threadId !== threadId) return;
    if (method === 'item/completed') {
      const text = finalText([params.item]);
      if (text) replies.set(params.turnId, text);
    }
    if (method === 'turn/completed') {
      outcomes.set(params.turn.id, params.turn);
      if (params.turn.id === turnId) completion.resolve(params.turn);
    }
  });
  try {
    const result = await rpc.call('turn/start', { threadId, input: [{ type: 'text', text: message, text_elements: [] }] });
    turnId = result.turn?.id;
    if (!turnId) return { kind: 'unknown', source };
    const turn = outcomes.get(turnId) || await rpc.wait(completion.promise);
    const text = turn.status === 'completed' && (finalText(turn.items) || replies.get(turnId));
    return { kind: 'sent', source, turnId, turnStatus: turn.status, ...(text ? { text } : {}) };
  } catch (error) {
    return { kind: 'unknown', source, ...(turnId ? { turnId } : {}), code: error.message };
  }
}

export function createCodexChats({ ctx, inspect, markerOf, getService, connect = withCodex }) {
  const sending = new Set();
  return async function codexChats(input, signal = new AbortController().signal) {
    const { workspaceId, sessionId, action, threadId, target, message } = input;
    async function current() {
      signal.throwIfAborted();
      const state = await inspect({ workspaceId }, signal);
      const agent = ctx.agents.get(sessionId);
      const cwd = agent && ctx.workingDirectory.get(agent.session);
      const workspace = cwd && await ctx.workspaceRegistry.resolveByPath(cwd);
      if (state.kind !== 'existing' || state.archived || state.sessionId !== sessionId ||
          !agent || markerOf(agent)?.workspaceId !== workspaceId || workspace?.id !== workspaceId ||
          !workspace.sessionIds.includes(sessionId) || !isAbsolute(workspace.path)) throw new Error('controller_changed');
      return workspace;
    }
    let attempted;
    try {
      const workspace = await current();
      const paths = [...new Set([workspace.path, await realpath(workspace.path)])];
      const service = getService('subagents');
      const children = service?.listChildren ? await service.listChildren(sessionId, signal) : [];
      const excluded = new Set([...workspace.sessionIds, ...children.map((child) => child.id)]);
      const allowed = (thread) => visible(thread, paths, excluded);
      const byId = threadId || (uuid.test(target || '') ? target : undefined);
      return await connect(async (rpc) => {
        const rows = [];
        let cursor;
        const cursors = new Set();
        do {
          const page = await rpc.call('thread/list', { cwd: paths.length === 1 ? paths[0] : paths, archived: false,
            currentAccountOnly: true, useStateDbOnly: true, sourceKinds: interactive, sortKey: 'updated_at',
            limit: 50, ...(cursor ? { cursor } : {}), ...(byId ? { includedThreadIds: [byId] } : {}) });
          if (!Array.isArray(page?.data)) return unavailable('codex_protocol');
          rows.push(...page.data.filter((item) => allowed(item) && (!byId || item.id === byId)).map(row));
          cursor = page.nextCursor;
          if (!cursor || cursors.has(cursor)) break;
          cursors.add(cursor);
        } while (cursors.size < 10);
        const all = [...new Map(rows.map((item) => [item.threadId, item])).values()];
        if (action === 'list') return { kind: 'ready', rows: all, partial: Boolean(cursor) };
        const matches = !byId && target ? all.filter((item) => item.title === target) : all;
        if (action === 'summary') {
          if ((byId || target) && !matches.length) return unavailable('target_missing');
          const sources = [];
          for (const item of matches.slice(0, 20)) sources.push(await recent(rpc, item));
          return { kind: 'summary', rows: sources, partial: Boolean(cursor) || matches.length > sources.length };
        }
        if (!matches.length) return !byId && all.length > 0 && action === 'choose' ? { kind: 'choose', rows: all } : unavailable('target_missing');
        if (matches.length !== 1 || !byId && cursor || !byId && !target) return { kind: 'choose', rows: matches };
        const [source] = matches;
        if (action !== 'send') return { kind: 'choose', rows: matches };
        if (source.status === 'active' || sending.has(source.threadId)) return unavailable('thread_busy');
        const metadata = await rpc.call('thread/read', { threadId: source.threadId, includeTurns: false });
        if (!allowed(metadata.thread) || metadata.thread.id !== source.threadId) return unavailable('target_changed');
        if (metadata.thread.status?.type === 'notLoaded') return unavailable('thread_not_attached');
        if (metadata.thread.status?.type !== 'idle') return unavailable('thread_busy');
        if (sending.has(source.threadId)) return unavailable('thread_busy');
        sending.add(source.threadId);
        try {
          return await sendTurn(rpc, source, message, { thread: allowed, current: async () => {
            const latest = await current();
            if (!samePath(workspace.path, latest.path)) throw new Error('controller_changed');
            attempted = source;
          } });
        } finally { sending.delete(source.threadId); }
      }, { live: action === 'send', signal });
    } catch (error) {
      if (attempted) return { kind: 'unknown', source: attempted, code: error.message };
      signal.throwIfAborted();
      return unavailable(['controller_changed', 'codex_incompatible', 'interaction_required'].includes(error.message) ? error.message : 'codex_unavailable');
    }
  };
}
