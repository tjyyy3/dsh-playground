import { z } from 'zod';
import { CHALLENGE_ORIGINS, CHALLENGE_SORTS } from './api.js';
import { BOHR_PERIOD_SLUG, COMPETITION_IDS, findCompetition, GROUP_KEY, GROUPED_COMPETITION_IDS, PKU_ID, PKU_UNIT_SLUG } from './competitions.js';
import { queryReleases } from './releases.js';

const inputSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('auth') }),
  z.strictObject({ action: z.literal('catalog'), search: z.string().max(500).optional(),
    // `competition` is one id of the built-in table (lib/competitions.js) and wins over `season`, which stays
    // for the seasons the API lists but the table does not hold. Any other id is rejected.
    competition: z.enum(COMPETITION_IDS).optional(),
    // The catalog checks membership against the same period snapshot it uses to select challenges.
    period: z.string().min(1).max(40).optional(),
    // One official group key of the chosen period, checked like `period`, or of a competition the website
    // groups without periods.
    group: z.string().regex(GROUP_KEY).optional(),
    page_signature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    refresh: z.boolean().optional(),
    season: z.string().max(200).optional(), per_page: z.number().int().min(1).max(100).optional(),
    // Catalog paging and filters, mapped to the list API's page, origin, disc and sort. `discipline` is one
    // exact discipline key. There is no status filter: the API ignores `status`, so 只看开放 filters loaded
    // cards in the Client.
    page: z.number().int().min(1).max(100000).optional(),
    origin: z.enum(CHALLENGE_ORIGINS).optional(),
    discipline: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(CHALLENGE_SORTS).optional() }).superRefine((input, issues) => {
    if (input.group !== undefined && input.period === undefined && !GROUPED_COMPETITION_IDS.includes(input.competition)) {
      issues.addIssue({ code: 'custom', path: ['group'], message: 'group needs a period' });
    }
    if (input.period === undefined) return;
    const competition = findCompetition(input.competition);
    if (!competition?.periods) {
      issues.addIssue({ code: 'custom', path: ['period'],
        message: input.competition === undefined ? 'period needs a competition'
          : 'the chosen competition has no periods' });
    } else if (!(competition.id === PKU_ID ? PKU_UNIT_SLUG : BOHR_PERIOD_SLUG).test(input.period)) {
      issues.addIssue({ code: 'custom', path: ['period'], message: 'invalid competition period slug' });
    }
  }),
  // Read one submission by id; the workbench refreshes unscored submissions with it.
  z.strictObject({ action: z.literal('attempt'), attemptId: z.number().int().positive() }),
  // The current account's submissions for one challenge; the task drawer's submission history reads it.
  z.strictObject({ action: z.literal('my_attempts'), challengeId: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(100).optional(), cursor: z.string().min(1).max(1000).optional() }),
  // One challenge's statement, resources and facts; the catalog's challenge detail drawer reads it.
  z.strictObject({ action: z.literal('challenge'), challengeId: z.string().trim().min(1).max(200) }),
  z.strictObject({ action: z.literal('releases'), check: z.boolean() }),
]);
// The password never crosses this call: the Client stores it in the DSH credential channel first.
const loginSchema = z.strictObject({ email: z.string().trim().min(1).max(320) });
const workspaceId = z.string().min(1).max(200);
const inspectControllerSchema = z.strictObject({ workspaceId });
const promoteControllerSchema = z.strictObject({ sessionId: workspaceId, workspaceId });
const controllerTasksSchema = z.strictObject({ sessionId: workspaceId, workspaceId });
const codexChatInput = z.discriminatedUnion('action', [
  z.strictObject({ workspaceId, sessionId: workspaceId, action: z.literal('list') }),
  z.strictObject({ workspaceId, sessionId: workspaceId, action: z.literal('summary'), threadId: z.uuid().optional() }),
  z.strictObject({ workspaceId, sessionId: workspaceId, action: z.literal('send'), message: z.string().max(8000).refine((text) => text.trim().length > 0),
    threadId: z.uuid().optional(), target: z.string().trim().min(1).max(150).optional() })
    .refine((value) => !(value.target && value.threadId)),
]);
const openControllerSchema = z.strictObject({ workspaceId, createIfMissing: z.boolean() });
const dispatchChallengeSchema = z.strictObject({ workspaceId, sessionId: workspaceId,
  challengeId: z.string().trim().min(1).max(200), requestId: z.uuid() });
const materialAccessSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('status'), sessionId: workspaceId }),
  z.strictObject({ action: z.literal('revoke'), sessionId: workspaceId }),
  z.strictObject({ action: z.literal('authorize'), sessionId: workspaceId, requestId: z.uuid(),
    scope: z.enum(['operation', 'task']), recursive: z.boolean().optional() }),
]);
const submissionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('request'), sessionId: workspaceId,
    outputs_path: z.string().optional(), bundle_path: z.string().optional(), trace_path: z.string().optional(),
    manifest_path: z.string().optional(), material_request_id: z.uuid().optional() }),
  z.strictObject({ action: z.enum(['confirm_quota', 'cancel']), sessionId: workspaceId, requestId: z.uuid() }),
  z.strictObject({ action: z.literal('status'), sessionId: workspaceId }),
]);

function browserInvocation(ctx) {
  try {
    const browser = ctx.get?.('connection')?.browserPeer;
    return Boolean(browser && ctx.invocation?.peer === browser && !browser.signal?.aborted);
  } catch { return false; }
}

// API normalizers use undefined for absent optional fields; the wire is JSON-only.
const wire = (value) => JSON.parse(JSON.stringify(value));

function invocation(method, typeSymbol, schema, description) {
  return {
    id: `dsh-playground#playgroundQueries/${method}`, service: 'playgroundQueries',
    namespace: 'playgroundQueries', method, invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json',
      codec: { mode: 'strict', typeSymbol: `dsh-playground#${typeSymbol}`, create: () => schema } }],
    cancellation: { parameter: 'signal' },
    result: { mode: 'strict', typeSymbol: `dsh-playground#${typeSymbol}Result`, create: () => z.json() },
    description,
  };
}

/** Workbench calls that do not require a current conversation. */
export function registerWorkbenchQueries(ctx, workflow, controller, releaseQuery = queryReleases) {
  const service = {
    [Symbol.for('cordis.tracker')]: { associate: 'playgroundQueries', property: 'ctx' },
    ctx,
    async query(input, signal) {
      if (input.action === 'auth') return wire(await workflow.auth({ signal }));
      if (input.action === 'attempt') return wire(await workflow.attempt(input.attemptId, { signal }));
      if (input.action === 'my_attempts') return wire(await workflow.myAttempts(input, { signal }));
      if (input.action === 'challenge') return wire(await workflow.challenge(input.challengeId, { signal }));
      if (input.action === 'releases') {
        if (input.check && !browserInvocation(this.ctx)) return { status: 'unavailable', error: 'user_action_required' };
        return wire(await releaseQuery(input, { signal }));
      }
      return wire(await workflow.catalog(input, { signal }));
    },
    async login(input, signal) {
      return wire(await workflow.login(input.email, { signal }));
    },
    inspectController: (input, signal) => controller.inspect(input, signal),
    openController: (input, signal) => controller.open(input, signal),
    promoteController: (input, signal) => controller.promote(input, signal),
    controllerTasks: (input, signal) => controller.tasks(input, signal),
    async codexChats(input, signal) {
      if (!browserInvocation(this.ctx)) return { kind: 'unavailable', code: 'user_action_required' };
      return wire(await controller.codexChats(input, signal));
    },
    dispatchChallenge: (input, signal) => controller.dispatch(input, signal),
    async submission(input, signal) {
      if (!browserInvocation(this.ctx)) return { ok: false, error: { code: 'user_action_required',
        message: '无法核实工作台用户操作，提交请求保持待处理。请在支持此功能的 DSH 工作台操作。' } };
      const agent = this.ctx.agents.get(input.sessionId) ?? (await this.ctx.sessionController?.resolveAgent?.(input.sessionId))?.agent;
      if (!agent || agent.id !== input.sessionId) return { ok: false, error: { code: 'session_unavailable', message: '无法加载已有任务对话，未派发提交请求。' } };
      return wire(await workflow.requestSubmission(input, { agent, signal }));
    },
    async materials(input, signal) {
      // Commands label every invocation "user". The Gateway instead supplies the admitted Peer.
      if (!browserInvocation(this.ctx)) {
        return { ok: false, error: { code: 'user_action_required', message: '无法确认工作台用户操作，材料权限未修改。请在支持此权限功能的 DSH Playground 工作台中授权。' } };
      }
      const agent = this.ctx.agents.get(input.sessionId) ?? (await this.ctx.sessionController?.resolveAgent?.(input.sessionId))?.agent;
      if (!agent || agent.id !== input.sessionId) return { ok: false, error: { code: 'session_unavailable', message: '无法加载已有任务对话，材料权限未修改。' } };
      const exec = { agent, signal };
      try {
        if (input.action === 'authorize') return wire(await workflow.materialAccess.authorize(input, exec));
        if (input.action === 'revoke') return workflow.materialAccess.revoke(exec);
        return wire(await workflow.materialAccess.status(exec));
      } catch (error) {
        return { ok: false, error: { code: error.code || 'material_access_failed', message: error.message } };
      }
    },
  };
  service.typertRemote = Object.freeze({ service, serviceKey: 'playgroundQueries', namespace: 'playgroundQueries' });
  ctx.provide('playgroundQueries', service);
  ctx.typert.register({
    package: 'dsh-playground', face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: [
      invocation('query', 'QueryInput', inputSchema, 'Read Playground authentication, paginated challenges and statements, submissions, or plugin version and install source. Only a verified browser click may check GitHub releases for the configured channel; this never installs or updates a plugin.'),
      invocation('login', 'LoginInput', loginSchema, 'Log in through the installed Playground CLI with the password from the DSH credential store.'),
      invocation('inspectController', 'InspectControllerInput', inspectControllerSchema, 'Find the registered workspace’s Playground controller conversation.'),
      invocation('promoteController', 'PromoteControllerInput', promoteControllerSchema, 'Promote the current conversation after explicit user action.'),
      invocation('controllerTasks', 'ControllerTasksInput', controllerTasksSchema, 'Read verified controller child tasks.'),
      invocation('codexChats', 'CodexChatInput', codexChatInput, 'Discover local Codex conversations in this controller workspace. A verified browser action can send a follow-up to one exact thread.'),
      invocation('openController', 'OpenControllerInput', openControllerSchema, 'Open the workspace’s controller. Create or initialize it after an explicit confirmation.'),
      invocation('dispatchChallenge', 'DispatchChallengeInput', dispatchChallengeSchema, 'Hand one challenge to the selected workspace’s initialized controller conversation.'),
      invocation('materials', 'MaterialAccessInput', materialAccessSchema, 'Manage external challenge material access from the authenticated browser workbench only.'),
      invocation('submission', 'SubmissionInput', submissionSchema, 'Dispatch one submission request to the existing task Agent. Quota confirmation requires the authenticated browser peer.'),
    ],
  });
}
