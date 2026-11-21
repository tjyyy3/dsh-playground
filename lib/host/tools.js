import { isAbsolute } from 'node:path';
import { ATTEMPT_SORTS, COMPETITION_STATUSES, DECLARABLE_OUTCOMES } from '../api.js';
import { formatAttempt, formatAttemptList, formatChallenge, formatCompetition, formatCompetitions, formatList, formatMyAttempts } from '../format.js';
import { errorValue, presentationMeta, renderResult, renderText, taskStatus, toToolValue } from './views.js';

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const CARD_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    titleZh: { type: 'string' },
    discipline: { type: 'string' },
    difficulty: { type: 'number' },
    attempts: { type: 'integer' },
    origin: { type: 'string' },
    status: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    hasContent: { type: 'boolean' },
  },
  required: ['id', 'title'],
};

const RESOURCE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    kind: { type: 'string' },
    description: { type: 'string' },
    role: { type: 'string' },
    source: { type: 'string' },
  },
};

const ERROR_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    status: { type: 'integer' },
  },
  required: ['code', 'message'],
};

const SCORING_STATE_SCHEMA = {
  type: 'object',
  properties: {
    state: { type: 'string' },
    scoreIsFinal: { type: 'boolean' },
    displayScore: { type: 'number' },
    provisionalScore: { type: 'number' },
    actionNeeded: { type: 'boolean' },
    workerStatus: { type: 'string' },
    zeroReason: { type: 'string' },
    overrideInEffect: { type: 'boolean' },
  },
};

const ATTEMPT_PROPERTIES = {
  id: { type: 'integer' },
  challengeId: { type: 'string' },
  challengeTitle: { type: 'string' },
  authorId: { type: 'string' },
  authorName: { type: 'string' },
  type: { type: 'string' },
  method: { type: 'string' },
  detail: { type: 'string' },
  status: { type: 'string' },
  outcome: { type: 'string' },
  score: { type: 'number' },
  bundleStatus: { type: 'string' },
  modelTag: { type: 'string' },
  harness: { type: 'string' },
  createdAt: { type: 'string' },
  updatedAt: { type: 'string' },
  traceCount: { type: 'integer' },
  scoringState: SCORING_STATE_SCHEMA,
};

const VIOLATION_SCHEMA = {
  type: 'object',
  properties: {
    rule: { type: 'string' },
    message: { type: 'string' },
    fix: { type: 'string' },
    docs: { type: 'string' },
  },
};

const LIST_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    total: { type: 'integer' },
    page: { type: 'integer' },
    perPage: { type: 'integer' },
    pages: { type: 'integer' },
    hasMore: { type: 'boolean' },
    items: { type: 'array', items: CARD_SCHEMA },
    error: ERROR_SCHEMA,
  },
  required: ['ok'],
};

const DETAIL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    ...CARD_SCHEMA.properties,
    content: { type: 'string' },
    contentGated: { type: 'boolean' },
    maxContentChars: { type: 'integer' },
    resources: { type: 'array', items: RESOURCE_SCHEMA },
    reviewStatus: { type: 'string' },
    submittedBy: { type: 'string' },
    armiId: { type: 'string' },
    error: ERROR_SCHEMA,
  },
  required: ['ok'],
};

const LIST_ATTEMPTS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    challengeId: { type: 'string' },
    total: { type: 'integer' },
    totalNonDraft: { type: 'integer' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
    sort: { type: 'string' },
    items: { type: 'array', items: { type: 'object', properties: ATTEMPT_PROPERTIES } },
    error: ERROR_SCHEMA,
  },
  required: ['ok'],
};

const GET_ATTEMPT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    ...ATTEMPT_PROPERTIES,
    scorecard: { type: 'string' },
    scorecardTruncated: { type: 'boolean' },
    error: ERROR_SCHEMA,
  },
  required: ['ok'],
};

const COMPETITION_PROPERTIES = {
  id: { type: 'integer' },
  slug: { type: 'string' },
  name: { type: 'string' },
  nameZh: { type: 'string' },
  seasonLabel: { type: 'string' },
  status: { type: 'string' },
  startAt: { type: 'string' },
  endAt: { type: 'string' },
  visibility: { type: 'string' },
  completionThreshold: { type: 'number' },
  challengeIds: { type: 'array', items: { type: 'string' } },
};

function createCompetitionListTool(client) {
  return {
    name: 'playground_list_competitions',
    description: 'List visible Playground competitions and seasons, their lifecycle status and deadlines. Use this when the user asks which competitions are available. Follow up with playground_get_competition to find its challenge ids.',
    parameters: { type: 'object', properties: {
      status: { type: 'string', enum: COMPETITION_STATUSES, description: 'Optional lifecycle filter.' },
    } },
    output: {
      schema: { type: 'object', properties: {
        ok: { type: 'boolean' }, baseUrl: { type: 'string' }, total: { type: 'integer' },
        items: { type: 'array', items: { type: 'object', properties: COMPETITION_PROPERTIES } },
        error: ERROR_SCHEMA,
      }, required: ['ok'] },
      render: (_args, value) => renderResult(value, formatCompetitions),
    },
    async execute(args, exec) {
      try {
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...await client.listCompetitions(args, { signal: exec.signal }) });
      } catch (error) { return errorValue(error); }
    },
  };
}

function createCompetitionDetailTool(client) {
  return {
    name: 'playground_get_competition',
    description: 'Read a Playground competition by numeric id: status, dates, completion threshold and challenge ids. Use its slug as the season filter of playground_list_challenges.',
    parameters: { type: 'object', properties: {
      competition_id: { type: 'integer', description: 'Competition id returned by playground_list_competitions.' },
    }, required: ['competition_id'] },
    output: {
      schema: { type: 'object', properties: {
        ok: { type: 'boolean' }, baseUrl: { type: 'string' }, ...COMPETITION_PROPERTIES, error: ERROR_SCHEMA,
      }, required: ['ok'] },
      render: (_args, value) => renderResult(value, formatCompetition),
    },
    async execute(args, exec) {
      try {
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...await client.getCompetition(args.competition_id, { signal: exec.signal }) });
      } catch (error) { return errorValue(error); }
    },
  };
}

function createMyAttemptsTool(client, overview) {
  return {
    name: 'playground_list_my_attempts',
    description: 'List only the authenticated Playground user\'s own submissions across challenges, newest first. Use this for "my submissions" rather than a public challenge submission list. Requires a Playground token. Cursor pagination must keep the same challenge_id and status filters. Read one submission with playground_get_attempt for full metrics.',
    parameters: { type: 'object', properties: {
      challenge_id: { type: 'string', description: 'Optional exact challenge id filter.' },
      status: { type: 'string', description: 'Optional exact submission status filter, for example submitted.' },
      limit: { type: 'integer', description: 'Rows to return, 1-100; defaults to 20.' },
      cursor: { type: 'string', description: 'Opaque nextCursor from a previous page; preserve the same filters.' },
    } },
    output: {
      schema: { type: 'object', properties: {
        ok: { type: 'boolean' }, baseUrl: { type: 'string' }, limit: { type: 'integer' },
        nextCursor: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        items: { type: 'array', items: { type: 'object', properties: ATTEMPT_PROPERTIES } },
        error: ERROR_SCHEMA,
      }, required: ['ok'] },
      render: (_args, value) => renderResult(value, formatMyAttempts),
    },
    async execute(args, exec) {
      try {
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...await overview.history({
          challengeId: args.challenge_id, status: args.status, limit: args.limit ?? 20, cursor: args.cursor,
        }, { signal: exec.signal }) });
      } catch (error) { return errorValue(error); }
    },
  };
}

function createListTool(client) {
  return {
    name: 'playground_list_challenges',
    description: 'List real competition challenges from the Playground platform. Supports title search, discipline/origin/season filters, and pagination. Returns a table of challenge ids, titles, disciplines, difficulty, and attempt counts; use playground_get_challenge with an id to read the full problem.',
    parameters: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Free-text search over English and Chinese challenge titles.',
        },
        discipline: {
          type: 'string',
          description: 'Discipline key filter (for example hep, cond-mat). Discover keys from the returned rows.',
        },
        origin: {
          type: 'string',
          enum: ['community', 'hackathon', 'benchmark', 'arena'],
          description: 'Challenge origin filter.',
        },
        season: {
          type: 'string',
          description: 'Hackathon season slug filter.',
        },
        sort: {
          type: 'string',
          enum: ['newest', 'attempts'],
          description: 'Sort order. Defaults to newest.',
        },
        page: {
          type: 'integer',
          description: '1-based page number. Defaults to 1.',
        },
        per_page: {
          type: 'integer',
          description: 'Rows per page, 1-50. Defaults to 10.',
        },
      },
    },
    output: {
      schema: LIST_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value, formatList),
    },
    async execute(args, exec) {
      try {
        const result = await client.listChallenges({
          search: args.search,
          discipline: args.discipline,
          origin: args.origin,
          season: args.season,
          sort: args.sort,
          page: args.page,
          perPage: args.per_page,
        }, { signal: exec.signal });
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...result });
      } catch (error) {
        return errorValue(error);
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'List Playground challenges',
      kind: 'read',
      ...(args?.search ? { rawInput: args.search } : {}),
    }),
  };
}

function createDetailTool(client) {
  return {
    name: 'playground_get_challenge',
    description: 'Read one challenge from the Playground platform by id: title, metadata, bundled resources, and the full markdown problem statement (bounded by max_content_chars). Use playground_list_challenges first to obtain an id.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Exact challenge id returned by playground_list_challenges.',
        },
        max_content_chars: {
          type: 'integer',
          description: 'Maximum problem-statement characters to return, 1000-50000. Defaults to 12000.',
        },
      },
      required: ['id'],
    },
    output: {
      schema: DETAIL_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value, (detail) => formatChallenge(
        { ...detail, resources: detail.resources ?? [] },
        { maxContentChars: detail.maxContentChars },
      )),
    },
    async execute(args, exec) {
      try {
        const requested = Number(args.max_content_chars);
        const maxContentChars = Number.isFinite(requested)
          ? Math.max(1000, Math.min(50000, Math.floor(requested)))
          : 12000;
        const detail = await client.getChallenge(args.id, { signal: exec.signal });
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...detail, maxContentChars });
      } catch (error) {
        return errorValue(error);
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Read Playground challenge',
      kind: 'read',
      ...(args?.id ? { rawInput: args.id } : {}),
    }),
  };
}

function createListAttemptsTool(client) {
  return {
    name: 'playground_list_attempts',
    description: 'List submissions for one Playground challenge, best score first by default. Returns submission ids, authors, status, score, scoring state, and bundle status. Public submissions are visible without a token; live competitions may hide other contestants\' submissions. Use playground_get_attempt with an id to read one submission\'s full result.',
    parameters: {
      type: 'object',
      properties: {
        challenge_id: {
          type: 'string',
          description: 'Challenge id from playground_list_challenges.',
        },
        page: {
          type: 'integer',
          description: '1-based page number. Defaults to 1.',
        },
        limit: {
          type: 'integer',
          description: 'Rows per page, 1-100. Defaults to 20.',
        },
        sort: {
          type: 'string',
          enum: ATTEMPT_SORTS,
          description: 'score is best-first, newest is latest first. Defaults to score.',
        },
        outcome: {
          type: 'string',
          enum: DECLARABLE_OUTCOMES,
          description: 'Only submissions that declared this outcome.',
        },
      },
      required: ['challenge_id'],
    },
    output: {
      schema: LIST_ATTEMPTS_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value, formatAttemptList),
    },
    async execute(args, exec) {
      try {
        const challengeId = cleanString(args.challenge_id);
        const result = await client.listAttempts(challengeId, {
          page: args.page,
          limit: args.limit,
          sort: args.sort,
          outcome: args.outcome,
        }, { signal: exec.signal });
        return toToolValue({ ok: true, baseUrl: client.baseUrl, challengeId, ...result });
      } catch (error) {
        return errorValue(error);
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'List Playground submissions',
      kind: 'read',
      ...(args?.challenge_id ? { rawInput: args.challenge_id } : {}),
    }),
  };
}

function createGetAttemptTool(client) {
  return {
    name: 'playground_get_attempt',
    description: 'Read one Playground submission by id: status, score and whether it is final, scoring state (queued, evaluating, final, failed, and so on), bundle status, and the ARM scorecard when present. Use playground_list_attempts to obtain an id, or track an ID returned by an official submission tool.',
    parameters: {
      type: 'object',
      properties: {
        attempt_id: {
          type: 'integer',
          description: 'Numeric submission id.',
        },
      },
      required: ['attempt_id'],
    },
    output: {
      schema: GET_ATTEMPT_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value, formatAttempt),
    },
    async execute(args, exec) {
      try {
        const attempt = await client.getAttempt(args.attempt_id, { signal: exec.signal });
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...attempt });
      } catch (error) {
        return errorValue(error);
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Read Playground submission',
      kind: 'read',
      ...(args?.attempt_id ? { rawInput: `#${args.attempt_id}` } : {}),
    }),
  };
}

/**
 * Mount the tools in the scope that loaded this plugin.
 * @param ctx Cordis context carrying the `tools` registry.
 * @param config Optional patch config: { baseUrl?, token?, timeoutMs? }.
 */
export function registerReadOnlyTools(ctx, client, overview) {
  [
    createListTool(client), createDetailTool(client), createListAttemptsTool(client),
    createGetAttemptTool(client),
    createCompetitionListTool(client), createCompetitionDetailTool(client), createMyAttemptsTool(client, overview),
  ].forEach((tool) => {
    tool.output.presentationMeta = presentationMeta;
    ctx.tools.register(tool);
  });
}

export function registerTaskTools(scope, workflow, controller) {
    const output = { schema: { type: 'object', additionalProperties: true, properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      render: (_args, value) => renderText(JSON.stringify(value, null, 2)), presentationMeta };
    scope.tools.register({ name: 'playground_open_controller', description: 'Find the Playground controller for an existing registered DSH workspace and return a button to open its native conversation. Call only when the user asks to open, create, or initialize a workspace controller. Use the absolute directory they named, or the current conversation’s workspace if they asked from it. Set create_if_missing only when they explicitly request creation or initialization. Creation and initialization send one message asking the DSH model to acknowledge its role. Reopening a started controller sends no prompt. If ordinary open reports a missing or uninitialized controller, direct the user to Playground Workbench.',
      parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'Absolute path of the registered workspace.' }, create_if_missing: { type: 'boolean' } }, required: ['cwd'] }, output,
      execute: async (args, exec) => {
        const cwd = cleanString(args.cwd);
        const workspace = cwd && isAbsolute(cwd) ? await scope.workspaceRegistry.resolveByPath(cwd).catch(() => undefined) : undefined;
        if (!workspace) return { ok: false, error: { code: 'workspace_missing', message: '请指定一个已添加的 DSH 工作区，或在 Playground 工作台中选择。' } };
        const result = await controller.open({ workspaceId: workspace.id, createIfMissing: args.create_if_missing === true }, exec.signal);
        return result.kind === 'opened' ? { ok: true, sessionId: result.sessionId, workspaceId: workspace.id, created: result.created }
          : { ok: false, error: { code: result.code, message: result.reason }, sessionIds: result.sessionIds };
      } });
    scope.tools.register({ name: 'playground_set_controller', description: 'Only on the user’s explicit request, make THIS conversation the Playground workspace controller. Preserves the conversation and reuses an existing controller. An empty conversation receives one initialization message. Takes no directory.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }, output,
      execute: async (_args, exec) => {
        const result = await controller.promote({ sessionId: exec.agent.id }, exec.signal);
        return result.kind === 'opened' ? { ok: true, sessionId: result.sessionId, created: false }
          : { ok: false, error: { code: result.code, message: result.reason }, sessionIds: result.sessionIds };
      } });
    scope.tools.register({ name: 'playground_controller_tasks', description: 'Read the current controller conversation’s direct delegated tasks and observed results. When noticeIsHistorical is true, terminalText and noticeStopReason describe a historical notice and do not prove the current run has ended.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }, output,
      execute: async (_args, exec) => {
        const marker = scope.sessionProjections.stateOf(exec.agent.session, 'playgroundController')?.marker;
        if (!marker || marker.sessionId !== exec.agent.id) return { ok: false, error: { code: 'not_controller', message: '当前对话不是工作区主控。' } };
        const result = await controller.tasks({ workspaceId: marker.workspaceId, sessionId: exec.agent.id }, exec.signal);
        return { ok: result.kind === 'ready', ...result };
      } });
    scope.tools.register({ name: 'playground_controller_link_task', description: 'Record an explicit challenge association for an existing direct child of THIS workspace controller after an accepted delegation. Copy base_url and challenge_id from the challenge handoff, and child_id from the delegation result. Never infer a challenge from labels, creation times or the latest handoff. Reads the platform challenge for its canonical id and title. Preserves the first association. Correct it ONLY on the user\'s explicit request, supplying supersedes with the exact currently stored challenge id; a mismatched predecessor is refused. Creates no session, sends no prompt and writes nothing to the platform.',
      parameters: { type: 'object', properties: { child_id: { type: 'string' }, base_url: { type: 'string' }, challenge_id: { type: 'string' }, supersedes: { type: 'string', description: 'Current stored challenge id, only for an explicitly user-requested correction.' } }, required: ['child_id', 'base_url', 'challenge_id'], additionalProperties: false },
      output: { ...output, presentationMeta: (_args, value) => value.ok ? { playgroundControllerAssociation: value.association } : {} },
      execute: (args, exec) => controller.linkTask(args, exec).then((result) => result.kind === 'associated'
        ? { ok: true, association: result.association } : { ok: false, error: { code: result.code, message: result.reason } }).catch(errorValue) });
    scope.tools.register({ name: 'playground_start_task', description: 'Create a NEW native DSH task conversation for an explicitly selected Playground challenge. If this conversation already has a Playground task, continue working here and use playground_task to read its context, receipts or results. Only create another task when the user explicitly requests a new task. From a conversation without a Playground task, when the user explicitly asks to work on, solve or submit a specific Playground challenge in this conversation, call playground_bind_task to bind this conversation instead of creating a new one; before preparing materials for submission in this conversation, bind it: the Playground task list, submission requests and result tracking use task conversations. Reading, browsing, explaining or comparing challenges needs neither tool. Call this tool only when the user explicitly asks for a new or separate task conversation. Use the directory the user names; if they name none, the current conversation\'s workspace is acceptable because the user started the request here. Requires an absolute cwd that is an existing registered DSH workspace; there is no implicit default. Does not create or register directories and does not submit platform changes.',
      parameters: { type: 'object', properties: { challenge_id: { type: 'string' }, cwd: { type: 'string', description: 'Required absolute path of a registered DSH workspace: the directory the user named, otherwise the current conversation\'s workspace.' }, mode: { type: 'string', enum: ['participate', 'author'] } }, required: ['challenge_id', 'cwd'] }, output,
      execute: (args, exec) => workflow.start(args, exec).then(toToolValue).catch(errorValue) });
    scope.tools.register({ name: 'playground_bind_task', description: 'Bind the CURRENT conversation to an explicitly selected Playground challenge, so this conversation becomes its task conversation: it then appears in the Playground task list, and result queries work here. Call it only when the user explicitly asks to work on, solve or submit a specific challenge in this conversation; reading, browsing, explaining or comparing challenges must not bind. A binding cannot be undone, so never call this tool without such a request. Creates no conversation, sends no prompt and writes nothing to the platform, so it needs no confirmation. The workspace is always this conversation\'s own working directory, which must be a registered DSH workspace; the tool takes no directory. If this conversation already has a Playground task, binding the same challenge again changes nothing (receipts and submissions stay), and a different challenge is refused: continue the existing task, or use playground_start_task only when the user explicitly asks for a new task. A conversation without a task keeps its receipts for the bound challenge; if they belong to another challenge, binding is refused. If binding is refused because this conversation has no registered workspace, explain that to the user and wait; do not create a task conversation on your own. After binding, read the statement with playground_get_challenge.',
      parameters: { type: 'object', properties: { challenge_id: { type: 'string' }, mode: { type: 'string', enum: ['participate', 'author'], description: 'Working mode; defaults to participate.' } }, required: ['challenge_id'] }, output,
      execute: (args, exec) => workflow.bind(args, exec).then(toToolValue).catch(errorValue) });
    scope.tools.register({ name: 'playground_task', description: 'Read this task, its current submission policy and results. On an explicit user submission request, the Agent chooses official CLI or API steps from the current challenge requirements. The plugin has no upload tool. Before execution announce submitPolicy.announcement; quota-sensitive workbench requests wait for a verified workbench reply. For a submission requested in the conversation, an explicit additional user answer in that conversation also counts. Model assertions and automatic approval results are not verified user consent. Action materials records only known authorized material paths, without reading content. Action track immediately records a real official attempt ID, including after upload failure, after checking challenge and signed-in or confirmed Agent-account ownership; repeated IDs are idempotent. Action progress reports not_created or unknown without an ID, or updates reported upload progress for a verified attempt_id without duplicating its association. Unknown outcomes must be reconciled using existing attempts before creating another. Mode is not an account role.',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'mode', 'results', 'track', 'materials', 'progress'] }, mode: { type: 'string', enum: ['participate', 'author'] }, attempt_id: { type: 'integer', description: 'For track: the real attempt ID returned by the official CLI or API, including when an upload later fails.' }, outputs_path: { type: 'string' }, bundle_path: { type: 'string' }, trace_path: { type: 'string' }, manifest_path: { type: 'string' }, material_request_id: { type: 'string' }, submission_state: { type: 'string', enum: ['not_created', 'created', 'uploaded', 'upload_failed', 'unknown'] }, message: { type: 'string', description: 'Short actual failure or progress, without credentials or material content.' }, http_status: { type: 'integer' } }, required: ['action'] }, output,
      execute: async (args, exec) => {
        if (args.action === 'status') {
          // #63: the ask-first policy for a new submission now, so a terminal submit needs no material check first.
          const live = await workflow.taskPolicy(exec).catch((error) => { if (exec.signal?.aborted || error?.code === 'cancelled') throw error; return undefined; });
          return toToolValue(taskStatus(scope.sessionProjections.stateOf(exec.agent.session, 'playgroundTask'), live));
        }
        if (args.action === 'results') return workflow.results({}, exec).then(toToolValue).catch(errorValue);
        if (args.action === 'track') return workflow.track(args, exec).then(toToolValue).catch(errorValue);
        if (args.action === 'materials') return workflow.setMaterials(args, exec).then(toToolValue).catch(errorValue);
        if (args.action === 'progress') return workflow.reportSubmission(args, exec).then(toToolValue).catch(errorValue);
        const result = await workflow.command({ agent: exec.agent, signal: exec.signal, rawInput: JSON.stringify(args) });
        return JSON.parse(result.text);
      } });
}
