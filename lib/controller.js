import { stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { z } from 'zod';

const key = 'playgroundController';
export const controllerCommand = 'playground-controller';
const markerSchema = z.strictObject({ workspaceId: z.string().min(1), sessionId: z.string().min(1) });
const stateSchema = markerSchema.nullable();
const projectionStateSchema = z.object({ sessionId: z.string(), inheritedEventCount: z.number(), marker: stateSchema });
const welcomePrompt = '请确认你是当前工作区的 Playground 主控。只回复“主控已就绪。请告诉我你想完成什么。”请勿调用工具、查看文件、派发任务或提交。';

export const controllerProjection = {
  key, stateVersion: 2, stateSchema: projectionStateSchema,
  init: (header, inheritedEventCount) => ({ sessionId: header.id, inheritedEventCount, marker: null }),
  apply(state, event) {
    if (state.marker || event.seq < state.inheritedEventCount || event.type !== 'command/done' || event.data.kind !== 'success' || !event.data.text?.startsWith('{"playgroundController":')) return state;
    try {
      const marker = markerSchema.safeParse(JSON.parse(event.data.text).playgroundController);
      return marker.success && marker.data.sessionId === state.sessionId ? { ...state, marker: marker.data } : state;
    } catch { return state; }
  },
  wire: { viewSchema: stateSchema, view: (state) => state.marker },
};

const noticeSchema = z.object({ childId: z.string(), text: z.string() });
export const controllerNoticesProjection = {
  key: 'playgroundControllerNotices', stateVersion: 1,
  stateSchema: z.object({ inheritedEventCount: z.number(), notices: z.array(noticeSchema) }),
  init: (_header, inheritedEventCount) => ({ inheritedEventCount, notices: [] }),
  apply(state, event) {
    if (event.seq < state.inheritedEventCount || event.type !== 'agent/inbox/spliced') return state;
    const notices = event.data.inserted.flatMap((message) => {
      if (message.source?.kind !== 'subagent-settled' || typeof message.source.senderSessionId !== 'string') return [];
      const text = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').slice(0, 12000);
      return [{ childId: message.source.senderSessionId, text }];
    });
    return notices.length ? { ...state, notices: [...state.notices, ...notices].slice(-100) } : state;
  },
  wire: { viewSchema: z.array(noticeSchema), view: (state) => state.notices },
};

const hasTaskEvidence = (state) => Boolean(state && Object.values(state).some((value) =>
  value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0)));

const blocked = (code, reason, sessionIds = []) => ({ kind: 'blocked', code, reason, sessionIds });

export function createController(ctx, getService = (name) => ctx.get?.(name)) {
  const queue = new Map();
  const pending = new Map();
  const lifecycle = new Map();
  const markerOf = (agent) => {
    const marker = ctx.sessionProjections.stateOf(agent.session, key)?.marker;
    return marker?.sessionId === agent.id ? marker : null;
  };
  const owns = (agent) => Boolean(markerOf(agent) || [...pending.values()].some((item) => item.attached && item.sessionId === agent.id));

  async function inspect({ workspaceId }, signal = new AbortController().signal) {
    const workspace = ctx.workspaceRegistry.list().find((item) => item.id === workspaceId);
    if (!workspace) return blocked('workspace_missing', '所选工作区已移除，请重新选择。');
    if (!(await stat(workspace.path).catch(() => null))?.isDirectory()) {
      return blocked('directory_missing', '所选工作区目录不存在或不可访问，请重新选择。');
    }
    const partial = pending.get(workspaceId);
    const found = [];
    let markedBlank = false;
    for (const sessionId of workspace.sessionIds) {
      signal.throwIfAborted();
      const snapshot = await ctx.sessionController.projections({ sessionId }, signal).catch(() => undefined);
      signal.throwIfAborted();
      if (snapshot === null) return blocked('projection_unavailable', '无法核对该工作区的对话记录，请重试。', [sessionId]);
      if (snapshot?.kind === 'migration-required') {
        return blocked('migration_required', '请先在 DSH 中打开该对话，完成会话迁移后再试。', [sessionId]);
      }
      const marker = stateSchema.safeParse(snapshot?.values?.[key]);
      if (snapshot?.kind !== 'sequenced' || !marker.success) {
        return blocked('projection_unavailable', '无法核对该工作区的对话记录，请重启 DSH 后重试。', [sessionId]);
      }
      // A fork can contain the original command event. Only the original session owns that marker.
      if (marker.data?.sessionId !== sessionId) continue;
      if (!snapshot.values.playgroundTask || marker.data.workspaceId !== workspaceId || hasTaskEvidence(snapshot.values.playgroundTask)) {
        return blocked('controller_conflict', '该对话的主控记录与工作区或赛题任务冲突，无法打开主控。', [sessionId]);
      }
      found.push(sessionId);
      markedBlank = snapshot.values.sessionListMetadata?.blank === true;
    }
    if (found.length > 1 || (partial && found.length && found[0] !== partial.sessionId)) {
      return blocked('controller_conflict', '该工作区有多个主控记录，请先在 DSH 中核对这些对话。', [...new Set([...found, ...(partial ? [partial.sessionId] : [])])]);
    }
    const sessionId = found[0] ?? partial?.sessionId;
    const archived = Boolean(sessionId && ctx.workspaceRegistry.archivedSessionIds.includes(sessionId));
    const codex = getService('subagents')?.getProvider?.('codex') ? 'registered' : 'unavailable';
    if (partial) {
      if (!partial.attached || !workspace.sessionIds.includes(sessionId)) {
        return blocked('controller_attach_failed', '已创建对话，但未能关联到工作区。请在 DSH 中按对话编号找回；不会重复创建。', [sessionId]);
      }
    }
    if (!archived && (partial || markedBlank)) return { kind: 'incomplete', sessionId, codex };
    return sessionId ? { kind: 'existing', sessionId, archived, codex } : { kind: 'absent', codex };
  }

  function enqueue(workspaceId, operation) {
    const current = (queue.get(workspaceId) ?? Promise.resolve()).catch(() => {}).then(operation);
    queue.set(workspaceId, current);
    void current.finally(() => { if (queue.get(workspaceId) === current) queue.delete(workspaceId); }).catch(() => {});
    return current;
  }

  function open({ workspaceId, createIfMissing }, signal) {
    signal?.throwIfAborted();
    return enqueue(workspaceId, () => openOnce(workspaceId, createIfMissing));
  }

  async function promote({ sessionId, workspaceId }, signal = new AbortController().signal) {
    signal.throwIfAborted();
    const agent = ctx.agents.get(sessionId);
    if (!agent) return blocked('session_unavailable', '当前对话不可用，请先打开该对话。', [sessionId]);
    const cwd = ctx.workingDirectory.get(agent.session);
    const workspace = cwd && await ctx.workspaceRegistry.resolveByPath(cwd).catch(() => undefined);
    if (!workspace?.sessionIds.includes(sessionId) || (workspaceId && workspace.id !== workspaceId)) return blocked('workspace_missing', '当前对话不属于所选的已注册工作区。', [sessionId]);
    return enqueue(workspace.id, async () => {
      const snapshot = await inspect({ workspaceId: workspace.id });
      if (snapshot.kind === 'blocked') return snapshot;
      if (snapshot.kind === 'existing') return snapshot.archived
        ? blocked('controller_archived', '主控对话已归档，请先取消归档。', [snapshot.sessionId])
        : { kind: 'opened', sessionId: snapshot.sessionId, created: false };
      if (snapshot.kind === 'incomplete' && !(pending.get(workspace.id)?.promoting && snapshot.sessionId === sessionId)) return blocked('controller_init_required', '现有主控尚未初始化，请先完成初始化。', [snapshot.sessionId]);
      const currentCwd = ctx.workingDirectory.get(agent.session);
      const currentWorkspace = currentCwd && await ctx.workspaceRegistry.resolveByPath(currentCwd).catch(() => undefined);
      if (ctx.agents.get(sessionId) !== agent || currentWorkspace?.id !== workspace.id || !currentWorkspace.sessionIds.includes(sessionId)) return blocked('workspace_missing', '当前对话已离开所选工作区。', [sessionId]);
      if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) return blocked('session_archived', '当前对话已归档，请先取消归档。', [sessionId]);
      const taskState = ctx.sessionProjections.stateOf(agent.session, 'playgroundTask');
      if (!taskState || hasTaskEvidence(taskState)) return blocked('controller_conflict', '该对话已有赛题记录，不能设为主控。', [sessionId]);
      const sessions = getService('sessions');
      if (typeof sessions?.flush !== 'function') return blocked('controller_unavailable', '当前 DSH 无法保存主控记录。', [sessionId]);
      pending.set(workspace.id, { sessionId, attached: true, promoting: true });
      try {
        const outcome = markerOf(agent) ? { result: { kind: 'success' } } : await ctx.commands.execute(agent, `/${controllerCommand}`, [], new AbortController().signal);
        if (outcome?.result.kind !== 'success' || markerOf(agent)?.workspaceId !== workspace.id || !await sessions.flush(agent.session)) return blocked('controller_init_failed', '无法确认保存主控记录，请重试。', [sessionId]);
        // DSH reuses marker-only blank sessions, so explicit promotion initializes an empty conversation.
        if (ctx.sessionProjections.stateOf(agent.session, 'sessionListMetadata')?.blank !== false) {
          const admission = await ctx.sessionController.prompt({ sessionId, requestId: `playground-controller:${sessionId}`, content: [{ type: 'text', text: welcomePrompt }], mode: 'queue' }, new AbortController().signal);
          if (!admission?.accepted || !await sessions.flush(agent.session)) return blocked('controller_init_failed', '主控记录已保存，但未能初始化空对话。', [sessionId]);
        }
        pending.delete(workspace.id);
        const confirmed = await inspect({ workspaceId: workspace.id });
        return confirmed.kind === 'existing' && confirmed.sessionId === sessionId ? { kind: 'opened', sessionId, created: false }
          : blocked('controller_conflict', '无法确认唯一的主控对话，请检查工作区。', [sessionId]);
      } catch { return blocked('controller_init_failed', '无法确认保存主控记录，请重试。', [sessionId]); }
    });
  }

  async function openOnce(workspaceId, createIfMissing) {
    const signal = new AbortController().signal;
    const snapshot = await inspect({ workspaceId }, signal);
    if (snapshot.kind === 'blocked') return snapshot;
    if (snapshot.kind === 'existing') {
      if (snapshot.archived) return blocked('controller_archived', '主控对话已归档。请先在 DSH 中取消归档。', [snapshot.sessionId]);
      return { kind: 'opened', sessionId: snapshot.sessionId, created: false };
    }
    if (!createIfMissing) {
      return snapshot.kind === 'incomplete'
        ? blocked('controller_init_required', '主控对话尚未初始化。请在 Playground 工作台确认初始化。', [snapshot.sessionId])
        : blocked('controller_missing', '未找到主控对话，请重新选择工作区并确认创建。');
    }
    if (pending.get(workspaceId)?.promoting) return blocked('controller_init_required', '请在原对话中重试设为主控。', [snapshot.sessionId]);
    const sessions = getService('sessions');
    if (typeof sessions?.flush !== 'function' || typeof ctx.sessionController.prompt !== 'function') {
      return blocked('controller_unavailable', '当前 DSH 版本无法初始化主控对话，请更新 DSH 后重试。');
    }
    let sessionId = snapshot.sessionId;
    if (!sessionId) {
      try {
        ({ sessionId } = await ctx.sessionController.create({ workspaceId }));
      } catch (error) {
        if (error?.code === 'session/workspace-attach-failed' && typeof error.details?.sessionId === 'string') {
          sessionId = error.details.sessionId;
          pending.set(workspaceId, { sessionId, attached: false });
          return blocked('controller_attach_failed', '已创建对话，但未能关联到工作区。请在 DSH 中按对话编号找回；不会重复创建。', [sessionId]);
        }
        return blocked('controller_create_failed', '无法创建主控对话，请检查 DSH 工作区后重试。');
      }
      pending.set(workspaceId, { sessionId, attached: true });
    }
    const created = pending.has(workspaceId);
    try {
      let agent = ctx.agents.get(sessionId);
      if (created) {
        if (!agent) return blocked('controller_init_failed', '主控对话已创建，但无法加载。请在 DSH 中打开该对话后重试。', [sessionId]);
        if (!markerOf(agent)) {
          const outcome = await ctx.commands.execute(agent, `/${controllerCommand}`, [], signal);
          if (outcome?.result.kind !== 'success' || markerOf(agent)?.workspaceId !== workspaceId) {
            return blocked('controller_init_failed', '主控对话已创建，但未完成初始化。请重试。', [sessionId]);
          }
          const workspace = ctx.workspaceRegistry.list().find((item) => item.id === workspaceId);
          // Pin the title before the first message can trigger DSH's automatic title provider.
          await ctx.sessionController.rename({ sessionId, title: `Playground 主控 · ${workspace?.title || '工作区'}` }).catch(() => {});
        }
        if (!await sessions.flush(agent.session)) {
          return blocked('controller_init_failed', 'DSH 未确认保存主控记录。请重试。', [sessionId]);
        }
      }
      if (!agent || ctx.sessionProjections.stateOf(agent.session, 'sessionListMetadata')?.blank !== false) {
        const admission = await ctx.sessionController.prompt({ sessionId, requestId: `playground-controller:${sessionId}`,
          content: [{ type: 'text', text: welcomePrompt }], mode: 'queue' }, signal).catch(() => undefined);
        if (admission?.accepted !== true) {
          return blocked('controller_init_failed', 'DSH 未确认接收主控的首条消息。请重试。', [sessionId]);
        }
        agent = ctx.agents.get(sessionId);
      }
      if (!agent || ctx.sessionProjections.stateOf(agent.session, 'sessionListMetadata')?.blank !== false || !await sessions.flush(agent.session)) {
        return blocked('controller_init_failed', 'DSH 未确认启动并保存主控对话。请重试。', [sessionId]);
      }
    } catch {
      return blocked('controller_init_failed', '主控对话已创建，但无法保存初始化记录。请重试。', [sessionId]);
    }
    pending.delete(workspaceId);
    return { kind: 'opened', sessionId, created };
  }

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
      const notices = z.array(noticeSchema).safeParse(projections?.values?.playgroundControllerNotices);
      if (projections?.kind !== 'sequenced' || !notices.success) return { kind: 'unavailable' };
      return { kind: 'ready', rows: children.slice(-100).map((child) => {
        const live = lifecycle.get(child.id);
        const notice = notices.data.findLast((item) => item.childId === child.id);
        return { childId: child.id, createdAt: child.createdAt, mode: child.mode, ...(child.label ? { label: child.label } : {}),
          ...(live?.provider ? { provider: live.provider } : {}),
          state: live?.running ? 'running' : notice ? 'settled' : 'unknown',
          ...(notice ? { terminalText: notice.text } : {}),
          ...(live && !live.running ? { liveEnd: { stopReason: live.stopReason, ...(live.lastAssistantMessage ? { lastAssistantMessage: live.lastAssistantMessage } : {}) } } : {}) };
      }) };
    } catch { signal.throwIfAborted(); return { kind: 'unavailable' }; }
  }

  function initialize({ agent }) {
    const workspaceId = [...pending].find(([, item]) => item.attached && item.sessionId === agent.id)?.[0];
    if (!workspaceId || markerOf(agent) || hasTaskEvidence(ctx.sessionProjections.stateOf(agent.session, 'playgroundTask'))) {
      return { kind: 'error', text: '请从 Playground 工作台创建主控对话。' };
    }
    return { kind: 'success', text: JSON.stringify({ playgroundController: { workspaceId, sessionId: agent.id } }) };
  }

  function context(agent) {
    const marker = agent && markerOf(agent);
    if (!marker) return '';
    const cwd = ctx.workingDirectory.get(agent.session);
    const workspace = ctx.workspaceRegistry.list().find((item) => item.id === marker.workspaceId);
    let samePath = false;
    try { samePath = realpathSync(cwd) === realpathSync(workspace.path); } catch {}
    if (!workspace?.sessionIds.includes(agent.id) || !samePath || hasTaskEvidence(ctx.sessionProjections.stateOf(agent.session, 'playgroundTask'))) {
      return 'This Playground controller no longer matches its registered workspace or has conflicting challenge task state. Tell the user to reopen the controller from Playground Workbench. Do not delegate work from this conversation.';
    }
    return `This is the Playground workspace controller. Its working directory is ${JSON.stringify(cwd)}. `
      + 'Understand the user’s goal, break it into concrete work when useful, and agree on or infer a clear acceptance condition. '
      + 'Use the official subagent_codex tool when delegation helps with concrete work within the user’s request. Honor the user’s choice of backend or request to work in this conversation. For Codex, set cwd to this session’s working directory and give a short description and a self-contained prompt with scope and acceptance criteria. No GitHub issue is required. '
      + 'A tool start acknowledgement is only an activation. Wait for the native terminal result or error, then report what Codex actually returned and any checks still needed. '
      + 'If Codex is needed but its tool is absent, tell the user to enable the official Codex subagent in this DSH profile. If the call fails, report the returned diagnostic. Do not silently switch providers or invent a result or execution trace. '
      + 'This conversation coordinates work. Use a separate challenge task conversation for material checks and submissions, with the existing explicit user request and quota rules. Do not delegate Playground submissions or change permissions.';
  }

  return { inspect, open, promote, tasks, observeStart, observeEnd, initialize, owns, context };
}
