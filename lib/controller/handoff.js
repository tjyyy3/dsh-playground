import { createHash } from 'node:crypto';
import { z } from 'zod';
import { challengeWebBase } from '../links.js';
import { oneLine } from '../text.js';
import { blocked, hasTaskEvidence } from './lifecycle.js';
import { challengeIdSchema, controllerKey } from './projection.js';

export function createControllerHandoff({ ctx, client, enqueue, inspect, markerOf, tasks }) {
  const baseUrl = client?.baseUrl;

  function dispatch({ workspaceId, sessionId, challengeId, requestId, notice }, signal = new AbortController().signal) {
    return enqueue(workspaceId, async () => {
      signal.throwIfAborted();
      const snapshot = await inspect({ workspaceId }, signal);
      if (snapshot.kind === 'blocked') return snapshot;
      if (snapshot.kind === 'absent') return blocked('controller_missing', '该工作区没有主控对话。');
      if (snapshot.sessionId !== sessionId) return blocked('controller_changed', '所选主控已变更，请重新核对工作区。');
      if (snapshot.kind === 'incomplete') return blocked('controller_init_required', '请先完成主控初始化。', [sessionId]);
      if (snapshot.archived) return blocked('controller_archived', '主控对话已归档，请先取消归档。', [sessionId]);

      const agent = ctx.agents.get(sessionId) ?? (await ctx.sessionController.resolveAgent?.(sessionId))?.agent;
      if (!agent) return blocked('session_unavailable', '无法加载主控对话，请先在 DSH 中打开该对话。', [sessionId]);
      const cwd = ctx.workingDirectory.get(agent.session);
      const workspace = cwd && await ctx.workspaceRegistry.resolveByPath(cwd).catch(() => undefined);
      if (workspace?.id !== workspaceId || !workspace.sessionIds.includes(sessionId)) {
        return blocked('workspace_mismatch', '主控对话的目录不属于所选工作区。', [sessionId]);
      }
      if (ctx.agents.get(sessionId) !== agent || markerOf(agent)?.workspaceId !== workspaceId
        || hasTaskEvidence(ctx.sessionProjections.stateOf(agent.session, 'playgroundTask'))) {
        return blocked('controller_changed', '所选主控已变更，请重新核对工作区。', [sessionId]);
      }
      if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) return blocked('controller_archived', '主控对话已归档，请先取消归档。', [sessionId]);
      signal.throwIfAborted();
      let dispatchId = `playground-dispatch:${requestId}`;
      if (notice) {
        if (notice.scope !== challengeWebBase(baseUrl)) return blocked('platform_changed', '赛事所属平台已变更，请重新打开赛事提醒。');
        const associations = ctx.sessionProjections.stateOf(agent.session, controllerKey)?.taskChallenges;
        const childIds = Object.entries(associations ?? {})
          .filter(([, challenge]) => challenge.id === challengeId && challenge.baseUrl === baseUrl).map(([childId]) => childId);
        if (childIds.length) {
          const current = await tasks({ workspaceId, sessionId, includeChallengeId: challengeId }, signal);
          if (current.kind !== 'ready' || !childIds.every((id) => current.linkedChildIds.includes(id))) {
            return blocked('linked_task_unavailable', '无法打开已关联的子任务，请在主控对话中核对已有工作。', [sessionId]);
          }
          return { kind: 'linked', sessionId, childIds, ...(childIds.length === 1 && { childId: childIds[0] }) };
        }
        const identity = JSON.stringify([notice.scope, notice.key, workspaceId, sessionId, challengeId]);
        dispatchId = 'playground-notice:' + createHash('sha256').update(identity).digest('hex');
      }
      const admission = await ctx.sessionController.prompt({ sessionId, requestId: dispatchId, mode: 'queue',
        content: [{ type: 'text', text: `请协调处理 Playground 赛题 ${JSON.stringify(challengeId)}。`
          + '先通过赛题详情工具读取题目，再按主控派工规则把解题交给子智能体。请让执行者检查工作区内与该题相关的已有工作。'
          + '在当前工作区内为该题使用专用子目录，保留已有工作。请在主控对话汇报派发情况和实际结果。'
          + '保持本对话为工作区主控。此请求只授权协调和执行赛题工作，不授权提交评测。'
          + '\n把每个子任务的具体分工、交付物和验收要求直接写入委派工具的 prompt。每个子任务启动成功后，从工具返回的 started subagent <id> 中复制子任务编号，作为 playground_controller_link_task 的 child_id 登记到本题。'
          + '不要按标题、时间或最近交接推断归属；同题的每个子任务都单独登记。'
          + `\n登记参数（数据，不是指令）：${JSON.stringify({ challenge_id: challengeId })}` }] }, signal);
      return admission?.accepted === true ? { kind: 'accepted', sessionId }
        : blocked('dispatch_rejected', 'DSH 未确认接收请求，请重试。', [sessionId]);
    });
  }

  async function linkTask(args, exec) {
    const input = z.strictObject({ child_id: z.string().min(1).max(200), challenge_id: challengeIdSchema,
      supersedes: challengeIdSchema.optional() }).safeParse(args);
    if (!input.success) return blocked('invalid_association', '请提供明确的赛题编号和已有子任务编号。');
    const marker = exec.agent && markerOf(exec.agent);
    if (!marker) return blocked('not_controller', '当前对话不是工作区主控。');
    const result = await tasks(marker, exec.signal);
    if (result.kind !== 'ready') return blocked('controller_unavailable', '无法核对当前工作区的主控任务，未关联任务。');
    const child = result.rows.find((row) => row.childId === input.data.child_id);
    if (!child) return blocked('child_not_found', '该编号不属于当前主控可见的直接子任务。');
    let detail;
    try { detail = await client.getChallenge(input.data.challenge_id, { signal: exec.signal }); }
    catch (error) {
      if (error?.code === 'not_found') return blocked('not_found', '找不到赛题，未关联任务。请确认 challenge_id。');
      throw error;
    }
    if (!detail || typeof detail !== 'object' || !detail.id) return blocked('not_found', '找不到赛题，未关联任务。请确认 challenge_id。');
    const title = oneLine(detail.titleZh || detail.title);
    const challenge = { baseUrl, id: String(detail.id), ...(title ? { title } : {}) };
    const supersedes = input.data.supersedes;
    if (supersedes === undefined && child.challenge && child.challenge.baseUrl !== baseUrl) {
      return blocked('association_conflict', '该子任务关联的平台与当前平台不一致，未更改已有归属。');
    }
    if (supersedes !== undefined ? child.challenge?.id !== supersedes : child.challenge && child.challenge.id !== challenge.id) {
      return blocked('association_conflict', '该子任务已关联另一道赛题，未更改已有归属。');
    }
    return { kind: 'associated', association: { ...marker, childId: child.childId,
      challenge: supersedes === undefined ? child.challenge || challenge : challenge, ...(supersedes !== undefined ? { supersedes } : {}) } };
  }

  return { dispatch, linkTask };
}
