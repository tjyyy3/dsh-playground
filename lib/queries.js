import { z } from 'zod';
import { CHALLENGE_ORIGINS, CHALLENGE_SORTS } from './api.js';
import { COMPETITION_IDS, competitionPeriodSlugs } from './competitions.js';

const inputSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('auth') }),
  z.strictObject({ action: z.literal('catalog'), search: z.string().max(500).optional(),
    // `competition` is one id of the built-in table (lib/competitions.js) and wins over `season`, which stays
    // for the seasons the API lists but the table does not hold. Any other id is rejected.
    competition: z.enum(COMPETITION_IDS).optional(),
    // `period` is one slug of that competition's periods, exactly as listed; it is rejected without a
    // competition and for a competition that has no periods.
    period: z.string().min(1).max(40).optional(),
    season: z.string().max(200).optional(), per_page: z.number().int().min(1).max(100).optional(),
    // Catalog paging and filters, mapped to the list API's page, origin, disc and sort. `discipline` is one
    // exact discipline key. There is no status filter: the API ignores `status`, so 只看开放 filters loaded
    // cards in the Client.
    page: z.number().int().min(1).max(100000).optional(),
    origin: z.enum(CHALLENGE_ORIGINS).optional(),
    discipline: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(CHALLENGE_SORTS).optional() }).superRefine((input, issues) => {
    if (input.period === undefined) return;
    const slugs = competitionPeriodSlugs(input.competition);
    if (!slugs.includes(input.period)) {
      issues.addIssue({ code: 'custom', path: ['period'],
        message: input.competition === undefined ? 'period needs a competition'
          : slugs.length ? `period must be one of ${slugs.join(', ')}` : 'the chosen competition has no periods' });
    }
  }),
  // Read one submission by id; the workbench refreshes unscored submissions with it.
  z.strictObject({ action: z.literal('attempt'), attemptId: z.number().int().positive() }),
  // The current account's submissions for one challenge; the task drawer's submission history reads it.
  z.strictObject({ action: z.literal('my_attempts'), challengeId: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(100).optional(), cursor: z.string().min(1).max(1000).optional() }),
  // One challenge's statement, resources and facts; the catalog's challenge detail drawer reads it.
  z.strictObject({ action: z.literal('challenge'), challengeId: z.string().trim().min(1).max(200) }),
]);
// The password never crosses this call: the Client stores it in the DSH credential channel first.
const loginSchema = z.strictObject({ email: z.string().trim().min(1).max(320) });
const workspaceId = z.string().min(1).max(200);
const inspectControllerSchema = z.strictObject({ workspaceId });
const promoteControllerSchema = z.strictObject({ sessionId: workspaceId, workspaceId });
const controllerTasksSchema = z.strictObject({ sessionId: workspaceId, workspaceId });
const openControllerSchema = z.strictObject({ workspaceId, createIfMissing: z.boolean() });
const dispatchChallengeSchema = z.strictObject({ workspaceId, sessionId: workspaceId,
  challengeId: z.string().trim().min(1).max(200), requestId: z.uuid() });
const materialAccessSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('status'), sessionId: workspaceId }),
  z.strictObject({ action: z.literal('revoke'), sessionId: workspaceId }),
  z.strictObject({ action: z.literal('authorize'), sessionId: workspaceId, requestId: z.uuid(),
    scope: z.enum(['operation', 'task']), recursive: z.boolean().optional() }),
]);

// API normalizers use undefined for absent optional fields; the wire is JSON-only.
const wire = (value) => JSON.parse(JSON.stringify(value));

function invocation(method, typeSymbol, schema, description) {
  return {
    id: `@playground/dsh-playground#playgroundQueries/${method}`, service: 'playgroundQueries',
    namespace: 'playgroundQueries', method, invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json',
      codec: { mode: 'strict', typeSymbol: `@playground/dsh-playground#${typeSymbol}`, create: () => schema } }],
    cancellation: { parameter: 'signal' },
    result: { mode: 'strict', typeSymbol: `@playground/dsh-playground#${typeSymbol}Result`, create: () => z.json() },
    description,
  };
}

/** Workbench calls that do not require a current conversation. */
export function registerWorkbenchQueries(ctx, workflow, controller) {
  const service = {
    [Symbol.for('cordis.tracker')]: { associate: 'playgroundQueries', property: 'ctx' },
    ctx,
    async query(input, signal) {
      if (input.action === 'auth') return wire(await workflow.auth({ signal }));
      if (input.action === 'attempt') return wire(await workflow.attempt(input.attemptId, { signal }));
      if (input.action === 'my_attempts') return wire(await workflow.myAttempts(input, { signal }));
      if (input.action === 'challenge') return wire(await workflow.challenge(input.challengeId, { signal }));
      return wire(await workflow.catalog(input, { signal }));
    },
    async login(input, signal) {
      return wire(await workflow.login(input.email, { signal }));
    },
    inspectController: (input, signal) => controller.inspect(input, signal),
    openController: (input, signal) => controller.open(input, signal),
    promoteController: (input, signal) => controller.promote(input, signal),
    controllerTasks: (input, signal) => controller.tasks(input, signal),
    dispatchChallenge: (input, signal) => controller.dispatch(input, signal),
    async materials(input, signal) {
      // Commands label every invocation "user". The Gateway instead supplies the admitted Peer.
      let browser;
      let peer;
      try { browser = this.ctx.get?.('connection')?.browserPeer; peer = this.ctx.invocation?.peer; } catch {}
      if (!browser || peer !== browser || browser.signal?.aborted) {
        return { ok: false, error: { code: 'user_action_required', message: '无法确认工作台用户操作，材料权限未修改。请在支持此权限功能的 DSH Playground 工作台中授权。' } };
      }
      const agent = this.ctx.agents.get(input.sessionId);
      if (!agent) return { ok: false, error: { code: 'session_unavailable', message: '请先打开该任务对话，再管理材料权限。' } };
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
    package: '@playground/dsh-playground', face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: [
      invocation('query', 'QueryInput', inputSchema, 'Read Playground authentication, the challenge catalog, one submission by id, one challenge\'s detail, or the current account\'s submissions for one challenge.'),
      invocation('login', 'LoginInput', loginSchema, 'Log in through the installed Playground CLI with the password from the DSH credential store.'),
      invocation('inspectController', 'InspectControllerInput', inspectControllerSchema, 'Find the registered workspace’s Playground controller conversation.'),
      invocation('promoteController', 'PromoteControllerInput', promoteControllerSchema, 'Promote the current conversation after explicit user action.'),
      invocation('controllerTasks', 'ControllerTasksInput', controllerTasksSchema, 'Read verified controller child tasks.'),
      invocation('openController', 'OpenControllerInput', openControllerSchema, 'Open the workspace’s controller. Create or initialize it after an explicit confirmation.'),
      invocation('dispatchChallenge', 'DispatchChallengeInput', dispatchChallengeSchema, 'Hand one challenge to the selected workspace’s initialized controller conversation.'),
      invocation('materials', 'MaterialAccessInput', materialAccessSchema, 'Manage external challenge material access from the authenticated browser workbench only.'),
    ],
  });
}
