import { controllerKey, controllerNoticesKey, controllerNoticesSchema, taskChallengesSchema } from './projection.js';

export function createControllerTasks({ ctx, getService, inspect }) {
  const lifecycle = new Map();
  const categories = new Map();
  const categoryRetry = new Map();

  function observeStart(event) {
    lifecycle.set(event.id, { runId: event.runId, provider: event.provider, running: true });
    if (lifecycle.size > 500) lifecycle.delete(lifecycle.keys().next().value);
  }
  function observeEnd(event) {
    if (lifecycle.has(event.id) && lifecycle.get(event.id).runId !== event.runId) return;
    lifecycle.set(event.id, { runId: event.runId, provider: event.provider, running: false,
      stopReason: event.stopReason, lastAssistantMessage: event.lastAssistantMessage });
    if (lifecycle.size > 500) lifecycle.delete(lifecycle.keys().next().value);
  }
  async function tasks({ workspaceId, sessionId }, signal = new AbortController().signal) {
    const snapshot = await inspect({ workspaceId }, signal);
    if (snapshot.kind !== 'existing' || snapshot.archived || snapshot.sessionId !== sessionId) return { kind: 'unavailable' };
    const agent = ctx.agents.get(sessionId);
    if (agent) {
      const cwd = ctx.workingDirectory.get(agent.session);
      const workspace = cwd && await ctx.workspaceRegistry.resolveByPath(cwd).catch(() => undefined);
      if (workspace?.id !== workspaceId || !workspace.sessionIds.includes(sessionId)) return { kind: 'unavailable' };
    }
    const service = getService('subagents');
    if (typeof service?.listChildren !== 'function') return { kind: 'unavailable' };
    try {
      const [children, projections] = await Promise.all([
        service.listChildren(sessionId, signal), ctx.sessionController.projections({ sessionId }, signal),
      ]);
      const notices = controllerNoticesSchema.safeParse(projections?.values?.[controllerNoticesKey]);
      if (projections?.kind !== 'sequenced' || !notices.success) return { kind: 'unavailable' };
      const owned = children.slice(-100);
      const taskChallenges = taskChallengesSchema.safeParse(projections.values[controllerKey]?.taskChallenges ?? {});
      const query = getService('sessionQuery');
      const unchecked = owned.filter((child) => child.mode !== 'external' && !categories.has(child.id) && (categoryRetry.get(child.id) ?? 0) <= Date.now());
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, unchecked.length) }, async () => {
        while (next < unchecked.length && !signal.aborted && typeof query?.readSession === 'function') {
          const child = unchecked[next++];
          categoryRetry.set(child.id, Date.now() + 30000);
          if (categoryRetry.size > 500) categoryRetry.delete(categoryRetry.keys().next().value);
          const record = await query.readSession(child.id).catch(() => undefined);
          const first = record?.events.find((event) => event.seq >= record.inheritedEventCount && event.type === 'user/message' && event.data.source?.kind === 'user');
          if (!first) continue;
          const text = first.data.content?.[0];
          const category = text?.type === 'text' && /^\[dsh-mnemon:delegated [a-z][a-z0-9-]*\]$/.test(text.text.split(/\r?\n/, 1)[0]) ? 'maintenance' : 'task';
          categoryRetry.delete(child.id);
          categories.set(child.id, category);
          if (categories.size > 500) categories.delete(categories.keys().next().value);
        }
      }));
      signal.throwIfAborted();
      return { kind: 'ready', rows: owned.map((child) => {
        const live = lifecycle.get(child.id);
        const notice = notices.data.findLast((item) => item.childId === child.id);
        const running = live?.running || child.mode !== 'external' && ctx.agents.get(child.id)?.status === 'running';
        return { childId: child.id, createdAt: child.createdAt, mode: child.mode, ...(child.label ? { label: child.label } : {}),
          ...(taskChallenges.success && Object.hasOwn(taskChallenges.data, child.id) ? { challenge: taskChallenges.data[child.id] } : {}),
          ...(live?.provider ? { provider: live.provider } : {}),
          ...(categories.get(child.id) === 'maintenance' ? { category: 'maintenance' } : {}),
          state: running ? 'running' : live && !live.running ? 'ended' : notice ? 'settled' : 'unknown',
          ...(notice ? { terminalText: notice.text, noticeIsHistorical: Boolean(running || !live) } : {}),
          ...(notice?.stopReason !== undefined ? { noticeStopReason: notice.stopReason } : {}),
          ...(live && !live.running ? { liveEnd: { stopReason: live.stopReason, ...(live.lastAssistantMessage ? { lastAssistantMessage: live.lastAssistantMessage } : {}) } } : {}) };
      }) };
    } catch { signal.throwIfAborted(); return { kind: 'unavailable' }; }
  }

  return { tasks, observeStart, observeEnd };
}
