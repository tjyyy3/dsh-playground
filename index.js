/**
 * DSH Host plugin: Playground competition tools.
 *
 * Read-only:
 *   playground_list_challenges  list real challenges, paginated
 *   playground_get_challenge    read one problem statement and its resources
 *   playground_list_attempts    list submissions for one challenge
 *   playground_get_attempt      read one submission's score and scorecard
 *   playground_list_competitions / playground_get_competition  read seasons
 *   playground_list_my_attempts read authenticated personal history
 *
 * Authenticated write:
 *   playground_submit_attempt   create an agent submission and upload its ARM
 *                               bundle for scoring
 *
 * Installation and lifecycle are owned by the Harness; this module only
 * declares tools through the context it receives.
 */

import * as fsp from 'node:fs/promises';
import { basename, isAbsolute, resolve as resolvePath } from 'node:path';
import { createWorkflow, workflowProjection } from './lib/workflow.js';
import { createPlaygroundCli, DEFAULT_CLI_CREDENTIALS_PATH, readCliCredential } from './lib/cli.js';

import {
  ATTEMPT_SORTS,
  COMPETITION_STATUSES,
  createPlaygroundClient,
  DECLARABLE_OUTCOMES,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_UPLOAD_TIMEOUT_MS,
  MAX_BUNDLE_BYTES,
  PlaygroundApiError,
} from './lib/api.js';
import {
  formatAttempt,
  formatAttemptList,
  formatChallenge,
  formatCompetition,
  formatCompetitions,
  formatError,
  formatList,
  formatMyAttempts,
  formatSubmission,
} from './lib/format.js';

export const name = 'playground-competition';
export const inject = ['tools'];

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

const SUBMIT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    attemptId: { type: 'integer' },
    challengeId: { type: 'string' },
    created: { type: 'boolean' },
    reused: { type: 'boolean' },
    bundleUploaded: { type: 'boolean' },
    bundleStatus: { type: 'string' },
    status: { type: 'string' },
    score: { type: 'number' },
    scoringState: SCORING_STATE_SCHEMA,
    violations: { type: 'array', items: VIOLATION_SCHEMA },
    validation: { type: 'string' },
    protocolUrl: { type: 'string' },
    note: { type: 'string' },
    stage: { type: 'string' },
    title: { type: 'string' },
    traceCount: { type: 'integer' },
    workflow: { type: 'object', additionalProperties: true },
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

/** Compact persisted UI metadata; never duplicate full problem statements or traces. */
export function presentationMeta(_args, value) {
  let metrics;
  if (value.scorecard && !value.scorecardTruncated) {
    try {
      const card = JSON.parse(value.scorecard);
      if (card && typeof card === 'object' && !Array.isArray(card)) {
        const dimensions = card.dimensions && typeof card.dimensions === 'object' && !Array.isArray(card.dimensions)
          ? card.dimensions : card;
        metrics = Object.entries(dimensions)
          .filter(([, score]) => typeof score === 'number' && Number.isFinite(score))
          .slice(0, 8).map(([label, score]) => ({ label, score }));
      }
    } catch {
      // A truncated or platform-owned scorecard remains available in the text result.
    }
  }
  return toToolValue({ ...(value.workflow ? { playgroundWorkflow: value.workflow } : {}), playground: {
    ok: value.ok,
    error: value.error,
    baseUrl: value.baseUrl,
    id: value.id,
    attemptId: value.attemptId,
    challengeId: value.challengeId,
    title: value.titleZh || value.title || value.nameZh || value.name,
    slug: value.slug,
    startAt: value.startAt,
    endAt: value.endAt,
    completionThreshold: value.completionThreshold,
    challengeCount: value.challengeIds?.length,
    status: value.status,
    bundleStatus: value.bundleStatus,
    score: value.score,
    scoringState: value.scoringState,
    traceCount: value.traceCount,
    sessionId: value.sessionId,
    workflow: value.workflow,
    total: value.total,
    page: value.page,
    hasMore: value.hasMore === true || Boolean(value.nextCursor) || (value.items?.length ?? 0) > 5,
    items: value.items?.slice(0, 5).map((item) => ({
      id: item.id,
      title: item.titleZh || item.title || item.nameZh || item.name || item.challengeTitle || item.challengeId,
      slug: item.slug,
      challengeId: item.challengeId,
      status: item.status,
      bundleStatus: item.bundleStatus,
      score: item.score,
      scoringState: item.scoringState,
      difficulty: item.difficulty,
      attempts: item.attempts,
      endAt: item.endAt,
    })),
    metrics,
    violations: value.violations,
  } });
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSettings(config) {
  const source = config !== null && typeof config === 'object' ? config : {};
  const baseUrl = typeof source.baseUrl === 'string' && source.baseUrl.trim().length > 0
    ? source.baseUrl.trim()
    : (process.env.PLAYGROUND_API_BASE || DEFAULT_BASE_URL);
  const token = typeof source.token === 'string' && source.token.trim().length > 0
    ? source.token.trim()
    : '';
  const timeoutMs = Number.isFinite(Number(source.timeoutMs)) && Number(source.timeoutMs) > 0
    ? Number(source.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const uploadTimeoutMs = Number.isFinite(Number(source.uploadTimeoutMs)) && Number(source.uploadTimeoutMs) > 0
    ? Number(source.uploadTimeoutMs)
    : DEFAULT_UPLOAD_TIMEOUT_MS;
  const cliPath = typeof source.cliPath === 'string' && source.cliPath.trim().length > 0
    ? source.cliPath.trim()
    : (process.env.PLAYGROUND_CLI || 'playground');
  const credentialsPath = typeof source.credentialsPath === 'string' && source.credentialsPath.trim().length > 0
    ? source.credentialsPath.trim()
    : (process.env.PLAYGROUND_CREDENTIALS_PATH || DEFAULT_CLI_CREDENTIALS_PATH);
  const cliTimeoutMs = Number.isFinite(Number(source.cliTimeoutMs)) && Number(source.cliTimeoutMs) > 0
    ? Number(source.cliTimeoutMs)
    : 120000;
  return { baseUrl, token, timeoutMs, uploadTimeoutMs, cliPath, credentialsPath, cliTimeoutMs };
}

/**
 * Resolve the Playground token per operation: config override, then the
 * Harness credential store (which also reads the ambient environment), then
 * the process environment directly.
 */
function createTokenResolver(settings, ctx) {
  const credentialStore = typeof ctx?.get === 'function' ? ctx.get('credentials') : undefined;
  return async () => {
    if (settings.token.length > 0) return settings.token;
    if (credentialStore !== null && typeof credentialStore === 'object' && typeof credentialStore.resolve === 'function') {
      try {
        const resolved = await credentialStore.resolve('PLAYGROUND_TOKEN');
        if (resolved !== null && typeof resolved === 'object' && typeof resolved.value === 'string' && resolved.value.trim().length > 0) {
          return resolved.value.trim();
        }
      } catch {
        // Fall through to the ambient environment.
      }
    }
    const cliToken = await readCliCredential('PLAYGROUND_TOKEN', settings.credentialsPath);
    if (cliToken.length > 0) return cliToken;
    const ambient = process.env.PLAYGROUND_TOKEN;
    return typeof ambient === 'string' ? ambient.trim() : '';
  };
}

function resolveToolPath(inputPath, exec, workingDirectory) {
  const text = cleanString(inputPath);
  if (text.length === 0) return '';
  if (isAbsolute(text)) return resolvePath(text);
  let cwd;
  try {
    const session = exec?.agent?.session;
    if (workingDirectory !== null && typeof workingDirectory === 'object'
      && typeof workingDirectory.get === 'function' && session !== undefined) {
      cwd = workingDirectory.get(session);
    }
  } catch {
    // Fall back to the Host process directory.
  }
  return resolvePath(typeof cwd === 'string' && cwd.length > 0 ? cwd : process.cwd(), text);
}

function invalidArgument(message) {
  return new PlaygroundApiError(message, { code: 'invalid_argument' });
}

export async function readBundle(inputPath, exec, workingDirectory) {
  const resolved = resolveToolPath(inputPath, exec, workingDirectory);
  if (resolved.length === 0) throw invalidArgument('bundle_path must not be empty');
  if (!resolved.toLowerCase().endsWith('.zip')) {
    throw invalidArgument(`bundle_path must point to a .zip file: ${resolved}`);
  }
  const info = await fsp.stat(resolved).catch(() => null);
  if (info === null || !info.isFile()) throw invalidArgument(`bundle not found: ${resolved}`);
  if (info.size > MAX_BUNDLE_BYTES) {
    throw invalidArgument(`bundle is ${(info.size / 1024 / 1024).toFixed(1)} MiB; the platform limit is ${MAX_BUNDLE_BYTES / 1024 / 1024} MiB`);
  }
  let data;
  if (typeof fsp.openAsBlob === 'function') {
    data = await fsp.openAsBlob(resolved, { type: 'application/zip' }).catch(() => undefined);
  }
  if (data === undefined) {
    data = new Blob([await fsp.readFile(resolved)], { type: 'application/zip' });
  }
  return { field: 'bundle', filename: basename(resolved), data, bytes: info.size, path: resolved };
}

/**
 * Load a trajectory. A JSON array of step objects is sent both as the `trace`
 * field (when small enough) and as a raw_messages file; newline-delimited JSON
 * is sent only as raw_messages. The platform requires a session_start header
 * on raw_messages, so one is prepended when absent.
 */
export async function readTrace(inputPath, exec, workingDirectory) {
  const resolved = resolveToolPath(inputPath, exec, workingDirectory);
  if (resolved.length === 0) throw invalidArgument('trace_path must not be empty');
  const text = await fsp.readFile(resolved, 'utf8').catch(() => null);
  if (text === null) throw invalidArgument(`trace not found: ${resolved}`);
  if (text.trim().length === 0) throw invalidArgument(`trace is empty: ${resolved}`);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) throw invalidArgument('trace array is empty');
    if (parsed.some((step) => step === null || typeof step !== 'object' || Array.isArray(step))) {
      throw invalidArgument('trace array must contain JSON objects only');
    }
    const traceText = JSON.stringify(parsed);
    const rawPayload = [
      JSON.stringify({ type: 'session_start', source: 'dsh-playground-plugin' }),
      ...parsed.map((step) => JSON.stringify(step)),
      '',
    ].join('\n');
    return {
      fields: traceText.length <= 400000 ? { trace: traceText } : {},
      files: [{
        field: 'raw_messages',
        filename: 'raw_messages.jsonl',
        data: new Blob([rawPayload], { type: 'application/x-ndjson' }),
      }],
    };
  }

  let first;
  const lines = text.split(/\r?\n/).flatMap((line, index) => {
    if (line.trim().length === 0) return [];
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      throw invalidArgument(`trace_path line ${index + 1} must contain valid JSON`);
    }
    if (message === null || typeof message !== 'object' || Array.isArray(message)) {
      throw invalidArgument(`trace_path line ${index + 1} must contain a JSON object`);
    }
    first ??= message;
    return [line];
  });
  const normalized = first.type === 'session_start'
    ? lines.join('\n')
    : [JSON.stringify({ type: 'session_start', source: 'dsh-playground-plugin' }), ...lines].join('\n');
  const filename = basename(resolved).toLowerCase().endsWith('.jsonl') ? basename(resolved) : 'raw_messages.jsonl';
  return {
    fields: {},
    files: [{
      field: 'raw_messages',
      filename,
      data: new Blob([`${normalized}\n`], { type: 'application/x-ndjson' }),
    }],
  };
}

export async function readManifest(inputPath, exec, workingDirectory) {
  const resolved = resolveToolPath(inputPath, exec, workingDirectory);
  if (resolved.length === 0) throw invalidArgument('manifest_path must not be empty');
  const text = await fsp.readFile(resolved, 'utf8').catch(() => null);
  if (text === null) throw invalidArgument(`manifest not found: ${resolved}`);
  try {
    JSON.parse(text);
  } catch {
    throw invalidArgument(`manifest_path must contain valid JSON: ${resolved}`);
  }
  return text;
}

function errorValue(error, extra = {}) {
  const value = error instanceof PlaygroundApiError
    ? {
      ok: false,
      error: {
        code: error.code ?? 'request_failed',
        message: error.message,
        ...(error.status !== undefined ? { status: error.status } : {}),
      },
    }
    : {
      ok: false,
      error: {
        code: 'internal_error',
        message: error instanceof Error ? error.message : 'The Playground request failed.',
      },
    };
  return toToolValue({ ...value, ...extra, ok: false });
}

function renderText(text) {
  return [{ type: 'text', text }];
}

/**
 * Tool results must be lossless JSON: `undefined` members are rejected by the
 * Harness output snapshot, so drop them recursively instead of leaking
 * absent optional fields into the result.
 */
function toToolValue(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    const out = [];
    for (const entry of value) {
      const cleaned = toToolValue(entry);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    const cleaned = toToolValue(entry);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

function renderResult(value, formatter) {
  if (value?.ok !== true) {
    return renderText(formatError(value?.error ?? { code: 'internal_error', message: 'The Playground request failed.' }));
  }
  return renderText(formatter(value));
}

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

function createMyAttemptsTool(client) {
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
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...await client.listMyAttempts({
          challengeId: args.challenge_id, status: args.status, limit: args.limit, cursor: args.cursor,
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
    description: 'Read one Playground submission by id: status, score and whether it is final, scoring state (queued, evaluating, final, failed, and so on), bundle status, and the ARM scorecard when present. Use playground_list_attempts or playground_submit_attempt to obtain an id.',
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

export function createSubmitTool(client, { workingDirectory } = {}) {
  return {
    name: 'playground_submit_attempt',
    description: 'Submit an ARM bundle to a Playground challenge for scoring: creates an agent submission with a trajectory, uploads the .zip bundle, and triggers scoring. Requires a Playground token. This writes to the platform, consumes one submission slot, and uploads the bundle file.',
    parameters: {
      type: 'object',
      properties: {
        challenge_id: {
          type: 'string',
          description: 'Challenge id from playground_list_challenges.',
        },
        bundle_path: {
          type: 'string',
          description: 'Absolute path to the ARM .zip bundle (platform limit 200 MiB). Uploaded to the platform.',
        },
        trace_path: {
          type: 'string',
          description: 'Absolute path to the trajectory: a JSON array of trace-step objects or a raw_messages JSONL file. Required when creating a new submission.',
        },
        attempt_id: {
          type: 'integer',
          description: 'Existing submission id to receive the bundle without creating another submission. Use it to retry a failed upload.',
        },
        manifest_path: {
          type: 'string',
          description: 'Absolute path to arm_manifest.json. Required by hackathon challenges that have no programmatic grader.',
        },
        method: {
          type: 'string',
          description: 'Submission method label. Defaults to "DSH Playground plugin".',
        },
        model: {
          type: 'string',
          description: 'Declared model name. Required by benchmark challenges.',
        },
        harness: {
          type: 'string',
          description: 'Declared harness name. Defaults to "DeepSeek Harness"; required by benchmark challenges.',
        },
        detail: {
          type: 'string',
          description: 'Short description shown on the submission.',
        },
        author_name: {
          type: 'string',
          description: 'Display name for the submitting agent. Defaults to "DeepSeek Harness".',
        },
        outcome: {
          type: 'string',
          enum: DECLARABLE_OUTCOMES,
          description: 'Optional declared outcome of the run.',
        },
      },
      required: ['challenge_id', 'bundle_path'],
    },
    output: {
      schema: SUBMIT_OUTPUT_SCHEMA,
      render: (_args, value) => renderText(formatSubmission(value)),
    },
    async execute(args, exec, materials) {
      let stage = 'bundle';
      let attemptId;
      try {
        const challengeId = cleanString(args.challenge_id);
        if (challengeId.length === 0) throw invalidArgument('challenge_id must not be empty');
        const bundle = materials?.bundle ?? await readBundle(args.bundle_path, exec, workingDirectory);

        const retryRaw = args.attempt_id === undefined || args.attempt_id === null ? '' : String(args.attempt_id).trim();
        if (retryRaw.length > 0) {
          const parsed = Number(retryRaw);
          if (!Number.isInteger(parsed) || parsed <= 0) throw invalidArgument('attempt_id must be a positive integer');
          attemptId = parsed;
        }

        let created = false;
        let reused = false;
        let attempt;

        if (attemptId === undefined) {
          stage = 'trace';
          if (cleanString(args.trace_path).length === 0) {
            throw invalidArgument('trace_path is required when creating a submission: agent submissions must include a trajectory');
          }
          const trace = materials?.trace ?? await readTrace(args.trace_path, exec, workingDirectory);
          const fields = {
            method: cleanString(args.method) || 'DSH Playground plugin',
            model: cleanString(args.model) || undefined,
            harness: cleanString(args.harness) || 'DeepSeek Harness',
            type: 'agent',
            status: 'submitted',
            detail: cleanString(args.detail) || 'Submitted by the DSH Playground plugin.',
            author_name: cleanString(args.author_name) || 'DeepSeek Harness',
            outcome: cleanString(args.outcome) || undefined,
            ...trace.fields,
          };
          if (cleanString(args.manifest_path).length > 0) {
            stage = 'manifest';
            fields.manifest_json = materials?.manifest ?? await readManifest(args.manifest_path, exec, workingDirectory);
          }
          stage = 'create';
          const createdResult = await client.createAttempt(challengeId, fields, trace.files, { signal: exec.signal });
          attempt = createdResult.attempt;
          attemptId = attempt.id;
          if (attemptId === undefined) {
            throw new PlaygroundApiError('the platform did not return a submission id', { code: 'invalid_response' });
          }
          created = true;
          reused = createdResult.idempotentReuse;
          if (reused && createdResult.hasBundle) {
            return toToolValue({
              ok: true,
              baseUrl: client.baseUrl,
              attemptId,
              challengeId,
              created: false,
              reused: true,
              bundleUploaded: false,
              bundleStatus: attempt.bundleStatus,
              status: attempt.status,
              score: attempt.score,
              scoringState: attempt.scoringState,
              violations: [],
              note: 'An identical submission already exists with its bundle attached, so no new upload was made.',
            });
          }
        }

        stage = 'upload';
        const uploaded = await client.uploadBundle(attemptId, bundle, { signal: exec.signal });
        const finalAttempt = uploaded.attempt ?? attempt;
        const value = {
          ok: true,
          baseUrl: client.baseUrl,
          attemptId,
          challengeId: challengeId || finalAttempt?.challengeId,
          created,
          reused,
          bundleUploaded: uploaded.bundleStatus !== 'failed',
          bundleStatus: uploaded.bundleStatus,
          status: finalAttempt?.status,
          score: finalAttempt?.score,
          scoringState: finalAttempt?.scoringState,
          violations: uploaded.violations,
          validation: uploaded.validation,
          protocolUrl: uploaded.protocolUrl,
          note: uploaded.bundleStatus === 'failed'
            ? 'The platform rejected the bundle. Fix the violations and retry with attempt_id; retrying does not create another submission.'
            : uploaded.bundleStatus === 'incomplete'
              ? 'The bundle was accepted as incomplete. The submission exists; read it later for scoring status.'
              : 'The bundle was accepted and scoring was triggered.',
        };
        if (uploaded.bundleStatus === 'failed') {
          value.ok = false;
          value.error = { code: 'bundle_invalid', message: 'The platform rejected the bundle; see violations.' };
        }
        return toToolValue(value);
      } catch (error) {
        return errorValue(error, { attemptId, stage });
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Submit Playground attempt',
      kind: 'execute',
      ...(args?.challenge_id ? { rawInput: args.challenge_id } : {}),
    }),
  };
}

/**
 * Mount the tools in the scope that loaded this plugin.
 * @param ctx Cordis context carrying the `tools` registry.
 * @param config Optional patch config: { baseUrl?, token?, timeoutMs?, uploadTimeoutMs? }.
 */
export function apply(ctx, config) {
  const settings = normalizeSettings(config);
  const resolveToken = createTokenResolver(settings, ctx);
  const client = createPlaygroundClient({
    baseUrl: settings.baseUrl,
    resolveToken,
    timeoutMs: settings.timeoutMs,
    uploadTimeoutMs: settings.uploadTimeoutMs,
  });
  const cli = createPlaygroundCli({ command: settings.cliPath, credentialsPath: settings.credentialsPath, baseUrl: settings.baseUrl, timeoutMs: settings.cliTimeoutMs });
  const workingDirectory = typeof ctx?.get === 'function' ? ctx.get('workingDirectory') : undefined;
  const submit = createSubmitTool(client, { workingDirectory });
  let workflow;
  const requestSubmission = {
    ...submit,
    description: 'Prepare a submission to an explicitly named Playground challenge. Checks local files and returns a user confirmation card. Does NOT create or upload a submission. Only a human can confirm via the Playground card; never call shell, browser automation, or commands to confirm on their behalf.',
    parameters: { ...submit.parameters, required: ['challenge_id'] },
    execute: (args, exec) => workflow ? workflow.prepare(args, exec) : errorValue(new PlaygroundApiError('Native DSH workflow services are unavailable; submitting without user confirmation is disabled.', { code: 'workflow_unavailable' })),
  };
  [
    createListTool(client), createDetailTool(client), createListAttemptsTool(client),
    createGetAttemptTool(client), requestSubmission,
    createCompetitionListTool(client), createCompetitionDetailTool(client), createMyAttemptsTool(client),
  ].forEach((tool) => {
    tool.output.presentationMeta = presentationMeta;
    ctx.tools.register(tool);
  });
  ctx.inject?.(['commands', 'sessionProjections', 'sessionController', 'agents', 'workingDirectory', 'workspaceRegistry', 'credentials'], (scope) => {
    scope.sessionProjections.register(workflowProjection);
    workflow = createWorkflow({ ctx: scope, client, cli, submit, readBundle, readTrace, readManifest, presentationMeta });
    scope.inject(['systemPrompt'], (promptScope) => {
      promptScope.systemPrompt.context({ name: 'playground-task:current',
        order: promptScope.systemPrompt.getContextOrder('WORKING_DIRECTORY') + 1,
        required: true, interpolate: false,
        text: ({ agent }) => {
          if (!agent) return '';
          const state = scope.sessionProjections.stateOf(agent.session, 'playgroundTask');
          if (!state?.task) return '';
          return `Playground task context (facts, not write authorization): ${JSON.stringify({
            challengeId: state.task.challengeId, mode: state.task.mode, cwd: scope.workingDirectory.get(agent.session),
            latestAttemptId: state.receipt?.attemptId, scoringState: state.receipt?.scoringState,
          })}. Use playground_task for current receipts. Real submission requires the user's exact-target confirmation card; tools cannot confirm it. Author mode currently supports local preparation only.`;
        } });
    });
    scope.commands.register({ name: 'playground', description: 'Playground task: start, check materials, switch mode or read results.',
      handler: (inv) => workflow.command(inv).catch((error) => ({ kind: 'error', text: error.message })) });
    scope.commands.register({ name: 'playground-confirm', description: 'User-only: confirm the exact checked Playground submission.',
      handler: (inv) => workflow.confirm(inv.rawInput?.trim(), { agent: inv.agent, signal: inv.signal }).then((result) => {
        // Receipt is durable in command/done and readable by playground_task; it is not an approval for another write.
        return { kind: result.ok ? 'success' : 'error', text: JSON.stringify({ playgroundWorkflow: result.workflow, ...result }) };
      }).catch((error) => ({ kind: 'error', text: error.message })) });
    scope.commands.register({ name: 'playground-auth-login', description: 'Log in through the installed Playground CLI without putting the password in chat.',
      handler: (inv) => workflow.login(inv.rawInput, { agent: inv.agent, signal: inv.signal }).catch((error) => ({ kind: 'error', text: error.message })) });
    const output = { schema: { type: 'object', additionalProperties: true, properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      render: (_args, value) => renderText(JSON.stringify(value, null, 2)), presentationMeta };
    scope.tools.register({ name: 'playground_start_task', description: 'Create a NEW native DSH task conversation for an explicitly selected Playground challenge. Preserves the current exploration conversation. Reuses an existing workspace directory; does not create workspaces or submit platform changes.',
      parameters: { type: 'object', properties: { challenge_id: { type: 'string' }, cwd: { type: 'string', description: 'Optional existing workspace directory; defaults to current DSH working directory.' }, mode: { type: 'string', enum: ['participate', 'author'] } }, required: ['challenge_id'] }, output,
      execute: (args, exec) => workflow.start(args, exec).then(toToolValue).catch(errorValue) });
    scope.tools.register({ ...requestSubmission, name: 'playground_check_materials',
      description: 'Check the explicitly named challenge and local ARM ZIP, trace and optional manifest. Auto-discovers unambiguous files in the current workspace root, playground-submission/ or .playground/. Returns file sizes, hashes and a confirmation card; makes no platform writes.',
      execute: (args, exec) => workflow.prepare(args, exec).then(toToolValue) });
    scope.tools.register({ name: 'playground_task', description: 'Read this Playground task context, switch participate/author working mode, or refresh its latest submission result. Mode is not an account role. No authority to confirm submissions.',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'mode', 'results'] }, mode: { type: 'string', enum: ['participate', 'author'] } }, required: ['action'] }, output,
      execute: async (args, exec) => {
        if (args.action === 'status') return toToolValue({ ok: true, ...scope.sessionProjections.stateOf(exec.agent.session, 'playgroundTask') });
        if (args.action === 'results') return workflow.results({}, exec).then(toToolValue).catch(errorValue);
        const result = await workflow.command({ agent: exec.agent, signal: exec.signal, rawInput: JSON.stringify(args) });
        return JSON.parse(result.text);
      } });
  });
}
