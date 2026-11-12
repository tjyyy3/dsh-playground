import { stat } from 'node:fs/promises';
import { z } from 'zod';

const key = 'playgroundController';
export const controllerCommand = 'playground-controller';
const markerSchema = z.strictObject({ workspaceId: z.string().min(1), sessionId: z.string().min(1) });
const stateSchema = markerSchema.nullable();
const welcomePrompt = '请确认你是当前工作区的 Playground 主控。只回复“主控已就绪。请告诉我你想完成什么。”请勿调用工具、查看文件、派发任务或提交。';

export const controllerProjection = {
  key, stateVersion: 1, stateSchema,
  init: () => null,
  apply(state, event) {
    if (state || event.type !== 'command/done' || event.data.kind !== 'success' || !event.data.text?.startsWith('{"playgroundController":')) return state;
    try {
      const marker = markerSchema.safeParse(JSON.parse(event.data.text).playgroundController);
      return marker.success ? marker.data : state;
    } catch {
      return state;
    }
  },
  wire: { viewSchema: stateSchema, view: (state) => state },
};

const blocked = (code, reason, sessionIds = []) => ({ kind: 'blocked', code, reason, sessionIds });

export function createController(ctx, getService = (name) => ctx.get?.(name)) {
  const opening = new Map();
  const pending = new Map();
  const markerOf = (agent) => {
    const marker = ctx.sessionProjections.stateOf(agent.session, key);
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
      if (snapshot === null) continue;
      if (snapshot?.kind === 'migration-required') {
        return blocked('migration_required', '请先在 DSH 中打开该对话，完成会话迁移后再试。', [sessionId]);
      }
      const marker = stateSchema.safeParse(snapshot?.values?.[key]);
      if (snapshot?.kind !== 'sequenced' || !marker.success) {
        return blocked('projection_unavailable', '无法核对该工作区的对话记录，请重启 DSH 后重试。', [sessionId]);
      }
      // A fork can contain the original command event. Only the original session owns that marker.
      if (marker.data?.sessionId !== sessionId) continue;
      if (marker.data.workspaceId !== workspaceId || snapshot.values.playgroundTask?.task) {
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

  function open({ workspaceId, createIfMissing }, signal) {
    signal?.throwIfAborted();
    if (!opening.has(workspaceId)) {
      // A client disconnect must not interrupt a shared create after DSH has minted its session.
      const operation = openOnce(workspaceId, createIfMissing).finally(() => opening.delete(workspaceId));
      opening.set(workspaceId, operation);
    }
    return opening.get(workspaceId);
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

  function initialize({ agent }) {
    const workspaceId = [...pending].find(([, item]) => item.attached && item.sessionId === agent.id)?.[0];
    if (!workspaceId || markerOf(agent) || ctx.sessionProjections.stateOf(agent.session, 'playgroundTask')?.task) {
      return { kind: 'error', text: '请从 Playground 工作台创建主控对话。' };
    }
    return { kind: 'success', text: JSON.stringify({ playgroundController: { workspaceId, sessionId: agent.id } }) };
  }

  function context(agent) {
    const marker = agent && markerOf(agent);
    if (!marker) return '';
    const cwd = ctx.workingDirectory.get(agent.session);
    const workspace = ctx.workspaceRegistry.list().find((item) => item.id === marker.workspaceId);
    if (!workspace?.sessionIds.includes(agent.id) || cwd !== workspace.path || ctx.sessionProjections.stateOf(agent.session, 'playgroundTask')?.task) {
      return 'This Playground controller no longer matches its registered workspace or has conflicting challenge task state. Tell the user to reopen the controller from Playground Workbench. Do not delegate work from this conversation.';
    }
    return `This is the Playground workspace controller. Its working directory is ${JSON.stringify(cwd)}. `
      + 'Understand the user’s goal, break it into concrete work when useful, and agree on or infer a clear acceptance condition. '
      + 'Use the official subagent_codex tool when delegation helps with concrete work within the user’s request. Honor the user’s choice of backend or request to work in this conversation. For Codex, set cwd to this session’s working directory and give a short description and a self-contained prompt with scope and acceptance criteria. No GitHub issue is required. '
      + 'A tool start acknowledgement is only an activation. Wait for the native terminal result or error, then report what Codex actually returned and any checks still needed. '
      + 'If Codex is needed but its tool is absent, tell the user to enable the official Codex subagent in this DSH profile. If the call fails, report the returned diagnostic. Do not silently switch providers or invent a result or execution trace. '
      + 'This conversation coordinates work. Use a separate challenge task conversation for material checks and submissions, with the existing explicit user request and quota rules. Do not delegate Playground submissions or change permissions.';
  }

  return { inspect, open, initialize, owns, context };
}
