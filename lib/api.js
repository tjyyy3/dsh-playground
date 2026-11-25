/**
 * Client for the Playground competition API.
 *
 * Read endpoints (no token required for public challenges):
 *   GET /challenges                        list challenges
 *   GET /challenges/facets                 challenge counts per discipline
 *   GET /challenges/{id}                   one challenge with markdown content
 *   GET /challenges/{id}/attempts          submissions for one challenge
 *   GET /attempts/{id}                     one submission with score and scorecard
 *
 * Uses the Harness runtime's global fetch.
 */

export const DEFAULT_BASE_URL = 'https://play.bohrium.com';
export const DEFAULT_TIMEOUT_MS = 20000;
export const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const ATTEMPT_SORTS = ['score', 'newest', 'id', 'id_desc', 'updated'];
export const DECLARABLE_OUTCOMES = ['success', 'partial', 'failed', 'stuck'];
export const COMPETITION_STATUSES = ['draft', 'active', 'ended', 'archived'];
// The most rows one challenge list page returns, on the platform list and on a built-in contest list alike.
export const CHALLENGE_PAGE_SIZE_MAX = 50;
// Pages of CHALLENGE_PAGE_SIZE_MAX that one grouping read of /challenges takes before it reports the
// filter incompletely read.
const CHALLENGE_LIST_MAX_PAGES = 6;
// `origin` values of /challenges that select something, and its two sorts (any other sort is a 400).
export const CHALLENGE_ORIGINS = ['community', 'benchmark', 'hackathon', 'arena'];
export const CHALLENGE_SORTS = ['newest', 'attempts'];

export class PlaygroundApiError extends Error {
  constructor(message, { code = 'request_failed', status, url, cause } = {}) {
    super(message);
    this.name = 'PlaygroundApiError';
    this.code = code;
    this.status = status;
    this.url = url;
    if (cause !== undefined) this.cause = cause;
  }
}

export async function readBoundedResponse(response, {
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES, url, onTooLarge,
} = {}) {
  if (response.body === undefined) {
    throw new PlaygroundApiError('fetchImpl returned a non-conforming response without a body property', {
      code: 'invalid_response', status: response.status, url,
    });
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  try {
    const decoder = new TextDecoder();
    const parts = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maxResponseBytes) {
        const error = new PlaygroundApiError('the platform response is too large to read completely', {
          code: 'response_too_large', status: response.status, url,
        });
        onTooLarge?.(error);
        await reader.cancel().catch(() => {});
        throw error;
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    reader.releaseLock();
  }
}

/**
 * Accept either the site root (`https://play.bohrium.com`) or an `/api`
 * endpoint and return the API root without a trailing slash.
 */
export function normalizeApiBase(input) {
  const raw = String(input ?? DEFAULT_BASE_URL).trim();
  if (raw.length === 0) throw new PlaygroundApiError('baseUrl must not be empty', { code: 'invalid_config' });
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new PlaygroundApiError('baseUrl is not a valid absolute URL', { code: 'invalid_config' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PlaygroundApiError('baseUrl must use http or https', { code: 'invalid_config' });
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new PlaygroundApiError('baseUrl must use HTTPS unless the host is localhost, 127.0.0.1, or [::1]', { code: 'invalid_config' });
  }
  if (url.username || url.password) {
    throw new PlaygroundApiError('baseUrl must not contain a username or password', { code: 'invalid_config' });
  }
  let path = url.pathname.replace(/\/+$/, '');
  if (!/\/api$/i.test(path)) path += '/api';
  url.pathname = path;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

function positiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new PlaygroundApiError(`expected an integer >= ${min}, received ${String(value)}`, { code: 'invalid_argument' });
  }
  return Math.min(parsed, max);
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanOrUndefined(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function compactObject(value) {
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null || entry === '') continue;
    out[key] = entry;
  }
  return out;
}

/** Bounded JSON text for payloads whose shape belongs to the platform. */
function jsonText(value, max) {
  if (value === undefined || value === null) return undefined;
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    return undefined;
  }
  if (typeof text !== 'string' || text.length === 0) return undefined;
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

function normalizeCard(raw) {
  if (raw === null || typeof raw !== 'object') {
    throw new PlaygroundApiError('challenge list contained a non-object item', { code: 'invalid_response' });
  }
  const title = cleanString(raw.title) || cleanString(raw.title_zh) || cleanString(raw.id);
  return compactObject({
    id: cleanString(raw.id),
    title,
    titleZh: cleanString(raw.title_zh) && cleanString(raw.title_zh) !== title ? cleanString(raw.title_zh) : undefined,
    discipline: cleanString(raw.disc) || undefined,
    difficulty: finiteNumber(raw.difficulty),
    attempts: finiteNumber(raw.attempts),
    origin: cleanString(raw.origin) || undefined,
    status: cleanString(raw.status) || undefined,
    tags: Array.isArray(raw.tags) && raw.tags.length > 0
      ? raw.tags.map((tag) => (typeof tag === 'string' ? tag : tag?.name)).filter(Boolean)
      : undefined,
    hasContent: raw.hasContent === true ? true : undefined,
  });
}

function normalizeResource(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  return compactObject({
    name: cleanString(raw.name) || cleanString(raw.dataset_id) || undefined,
    kind: cleanString(raw.kind) || cleanString(raw.type) || undefined,
    description: cleanString(raw.description) || undefined,
    role: cleanString(raw.role) || undefined,
    source: cleanString(raw.source) || undefined,
  });
}

function normalizeChallengeDetail(raw) {
  const card = normalizeCard(raw);
  const content = typeof raw.content === 'string' ? raw.content : '';
  const resources = Array.isArray(raw.resources)
    ? raw.resources.map(normalizeResource).filter((entry) => entry && (entry.name || entry.description))
    : [];
  return {
    ...card,
    content,
    contentGated: raw.contentGated === true,
    resources,
    reviewStatus: cleanString(raw.reviewStatus) || undefined,
    submittedBy: cleanString(raw.submittedBy) || undefined,
    armiId: cleanString(raw.armiId) || undefined,
    // The website's "用智能体打开" inputs (#67): the challenge's own agent prompt and its season.
    agentPrompt: typeof raw.agentPrompt === 'string' && raw.agentPrompt.trim() ? raw.agentPrompt : undefined,
    hackathonSeasonId: Number.isInteger(raw.hackathonSeasonId) && raw.hackathonSeasonId > 0 ? raw.hackathonSeasonId : undefined,
  };
}

function normalizeScoringState(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return compactObject({
    state: cleanString(raw.state) || 'unknown',
    scoreIsFinal: booleanOrUndefined(raw.scoreIsFinal),
    displayScore: finiteNumber(raw.displayScore),
    provisionalScore: finiteNumber(raw.provisionalScore),
    actionNeeded: booleanOrUndefined(raw.actionNeeded),
    workerStatus: cleanString(raw.workerStatus) || undefined,
    zeroReason: cleanString(raw.zeroReason) || undefined,
    overrideInEffect: raw.overrideInEffect === true ? true : undefined,
  });
}

// Platform states that mean scoring is complete. A record that only carries the snake_case
// `scoring_state` string (e.g. `/api/me/attempts`) has no `scoreIsFinal` flag, so the state decides:
// only these states make the score final. Every other state, including queued and evaluating with a
// 0 or reference score, stays non-final. `late_scored` is a final score marked as after the deadline.
const FINAL_SCORING_STATES = new Set(['final', 'late_scored']);

function snakeCaseScoringState(raw) {
  // An object under the snake_case key carries the same members as `scoringState`; the caller
  // normalises it the same way.
  if (raw.scoring_state !== null && typeof raw.scoring_state === 'object' && !Array.isArray(raw.scoring_state)) return raw.scoring_state;
  if (typeof raw.scoring_state !== 'string') return undefined;
  const state = cleanString(raw.scoring_state);
  // Only a real number counts: `finiteNumber` also coerces `true` and blank strings.
  const score = typeof raw.score === 'number' ? finiteNumber(raw.score) : undefined;
  const scoreIsFinal = FINAL_SCORING_STATES.has(state) && score !== undefined;
  return { state, scoreIsFinal, displayScore: scoreIsFinal ? score : undefined };
}

/**
 * The owner-only queue facts of an unsettled submission (`scoringQueue`, null for other accounts and
 * once settled): its stage (`awaiting_receipt` before the Worker receives the bundle), the time the
 * Worker received it, and the platform's "not received" threshold. Only these fields are kept.
 */
function normalizeScoringQueue(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const queue = compactObject({
    stage: cleanString(raw.stage) || undefined,
    workerReceivedAt: cleanString(raw.workerReceivedAt) || undefined,
    submittedAt: cleanString(raw.submittedAt) || undefined,
    notReceivedAfterMinutes: finiteNumber(raw.notReceivedAfterMinutes),
    queuePosition: finiteNumber(raw.queuePosition),
    waitingSeconds: finiteNumber(raw.waitingSeconds),
  });
  return Object.keys(queue).length ? queue : undefined;
}

// The marker the platform writes into `changelog` and `execLog` when it closes a submission whose bundle
// never reached the Worker: "[未评测 · 未收到提交包] … / [Not evaluated - bundle missing] …".
const BUNDLE_MISSING_MARK = /\[Not evaluated\s*-\s*bundle missing\]|\[未评测\s*·\s*未收到提交包\]/i;

// Whether the platform closed the submission as "bundle missing": a failed execution or scoring state
// with the platform's marker. Only the flag is kept, never the platform's text.
function bundleNotReceived(raw, normalized) {
  const failed = normalized.execStatus === 'failed' || normalized.scoringState?.state === 'failed';
  return failed && [raw.changelog, raw.execLog, raw.exec_log].some((text) => typeof text === 'string' && BUNDLE_MISSING_MARK.test(text.slice(0, 2000)));
}

export function normalizeAttempt(raw, { detailed = true } = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlaygroundApiError('attempt response is not an object', { code: 'invalid_response' });
  }
  const id = Number(raw.id);
  const result = compactObject({
    id: Number.isInteger(id) && id > 0 ? id : undefined,
    challengeId: cleanString(raw.challengeId) || cleanString(raw.challenge_id) || undefined,
    challengeTitle: cleanString(raw.challenge_title) || undefined,
    authorId: cleanString(raw.authorId) || undefined,
    authorName: cleanString(raw.author_name) || cleanString(raw.authorName) || undefined,
    type: cleanString(raw.type) || undefined,
    method: cleanString(raw.method) || undefined,
    detail: cleanString(raw.detail) || undefined,
    status: cleanString(raw.status) || undefined,
    outcome: cleanString(raw.outcome) || undefined,
    score: finiteNumber(raw.score),
    bundleStatus: cleanString(raw.bundleStatus) || undefined,
    modelTag: cleanString(raw.modelTag) || undefined,
    harness: cleanString(raw.harness) || undefined,
    createdAt: cleanString(raw.createdAt) || cleanString(raw.created_at) || undefined,
    updatedAt: cleanString(raw.updatedAt) || cleanString(raw.updated_at) || undefined,
    traceCount: finiteNumber(raw.traceCount),
    scoringState: normalizeScoringState(raw.scoringState ?? snakeCaseScoringState(raw)),
    execStatus: cleanString(raw.execStatus) || cleanString(raw.exec_status) || undefined,
    scoringQueue: normalizeScoringQueue(raw.scoringQueue ?? raw.scoring_queue),
    authorIsAgent: booleanOf(firstDefined(raw.authorIsAgent, raw.author_is_agent)),
    countsTowardQuota: booleanOf(firstDefined(raw.countsTowardQuota, raw.counts_toward_quota)),
  });
  if (bundleNotReceived(raw, result)) result.bundleNotReceived = true;
  if (detailed) {
    const scorecard = jsonText(raw.scorecard, 6000);
    if (scorecard !== undefined) {
      result.scorecard = scorecard.text;
      if (scorecard.truncated) result.scorecardTruncated = true;
    }
  }
  return result;
}

/**
 * One entry of `GET /agent/register`: `{ agentUser: { id, name, agentFramework, operatorConfirmed }, persona }`.
 * Exported for tests; entries without an id are dropped by the caller.
 */
export function normalizeAgentAccount(raw) {
  const user = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw.agentUser !== null && typeof raw.agentUser === 'object' ? raw.agentUser : raw) : {};
  const id = cleanString(typeof user.id === 'number' ? String(user.id) : user.id);
  return compactObject({
    id: id && id.length <= 200 ? id : undefined,
    name: cleanString(user.name) || undefined,
    framework: cleanString(firstDefined(user.agentFramework, user.agent_framework)) || undefined,
    confirmed: booleanOf(firstDefined(user.operatorConfirmed, user.operator_confirmed)) === true,
  });
}

function normalizeCompetition(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)
    || !Number.isInteger(raw.id) || raw.id <= 0 || !cleanString(raw.slug)) {
    throw new PlaygroundApiError('competition response must contain an integer id and slug', { code: 'invalid_response' });
  }
  return compactObject({
    id: raw.id,
    slug: raw.slug,
    name: cleanString(raw.nameEn) || cleanString(raw.nameZh) || raw.slug,
    nameZh: cleanString(raw.nameZh) || undefined,
    seasonLabel: cleanString(raw.seasonLabelZh) || cleanString(raw.seasonLabelEn) || undefined,
    status: cleanString(raw.status) || undefined,
    startAt: cleanString(raw.startAt) || undefined,
    endAt: cleanString(raw.endAt) || undefined,
    visibility: cleanString(raw.visibility) || undefined,
    completionThreshold: finiteNumber(raw.completionThreshold),
    challengeIds: Array.isArray(raw.challengeIds)
      ? raw.challengeIds.filter((id) => typeof id === 'string' && id.length > 0)
      : undefined,
  });
}

const SEASON_SLUG = /^[A-Za-z0-9_-]{1,40}$/;

function seasonSlug(value) {
  const slug = cleanString(value);
  if (!SEASON_SLUG.test(slug)) throw new PlaygroundApiError('season slug must be a plain word', { code: 'invalid_argument' });
  return slug;
}

// The season a challenge row names, as the slug the list filter takes. The platform writes the number
// (`"season": 2` for `s2`), and leaves it out for a challenge that belongs to no season.
function rowSeasonSlug(hackathon) {
  const value = plainObject(hackathon) ? hackathon.season : undefined;
  if (typeof value === 'number') return Number.isInteger(value) ? `s${value}` : undefined;
  const text = cleanString(value).toLowerCase();
  if (!text) return undefined;
  return /^\d+$/.test(text) ? `s${text}` : text;
}

// One scoring round of a hackathon season. A round without a positive `seq` or without a challenge id list
// is dropped: the grouping it would describe cannot be queried.
function normalizeSeasonRound(raw) {
  if (!plainObject(raw) || !Number.isInteger(raw.seq) || raw.seq <= 0 || !Array.isArray(raw.challengeIds)) return undefined;
  const challengeIds = raw.challengeIds.filter((id) => typeof id === 'string' && id.length > 0);
  return compactObject({
    seq: raw.seq,
    phase: cleanString(raw.phase) || undefined,
    startAt: cleanString(raw.startAt) || undefined,
    endAt: cleanString(raw.endAt) || undefined,
    challengeCount: finiteNumber(raw.challengeCount) ?? challengeIds.length,
    challengeIds,
  });
}

const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

// An operator id is a positive integer or a short opaque string.
function operatorIdOf(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  const text = cleanString(value);
  if (!text || text.length > 100) return undefined;
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0 ? Number(text) : text;
}

function booleanOf(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return undefined;
}

/**
 * `GET /auth/me` may answer with the user itself or wrapped as `{ user }` (the CLI accepts both),
 * in camelCase or snake_case. An Agent token's identity also names its operator and framework.
 * Exported for tests.
 */
export function normalizeCurrentUser(body) {
  if (!plainObject(body)) {
    throw new PlaygroundApiError('current user response is not an object', { code: 'invalid_response' });
  }
  // Fields of the wrapped user win; fields only on the envelope (an operator, say) are kept.
  const raw = plainObject(body.user) ? { ...body, ...body.user } : body;
  const operator = plainObject(raw.operator) ? raw.operator : {};
  const id = typeof raw.id === 'string' ? cleanString(raw.id) || undefined : operatorIdOf(raw.id);
  const name = cleanString(raw.name);
  const email = cleanString(raw.email);
  if (id === undefined && name.length === 0 && email.length === 0) {
    throw new PlaygroundApiError('current user response has no identity', { code: 'invalid_response' });
  }
  return compactObject({
    id,
    name: name || undefined,
    email: email || undefined,
    role: cleanString(raw.role) || undefined,
    userType: cleanString(raw.userType) || cleanString(raw.user_type) || undefined,
    affiliation: cleanString(raw.affiliation) || undefined,
    operatorId: operatorIdOf(firstDefined(raw.operatorId, raw.operator_id, operator.id)),
    operatorName: cleanString(firstDefined(raw.operatorName, raw.operator_name, operator.name)) || undefined,
    operatorConfirmed: booleanOf(firstDefined(raw.operatorConfirmed, raw.operator_confirmed, operator.confirmed)),
    agentFramework: cleanString(firstDefined(raw.agentFramework, raw.agent_framework)) || undefined,
  });
}

function extractErrorMessage(text, status) {
  if (typeof text === 'string' && text.length > 0) {
    try {
      const body = JSON.parse(text);
      const candidate = body?.error ?? body?.message ?? body?.detail;
      if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
      if (candidate !== null && typeof candidate === 'object' && typeof candidate.message === 'string') {
        return candidate.message.trim();
      }
      if (Array.isArray(body?.violations) && body.violations.length > 0) {
        return body.violations
          .map((entry) => (typeof entry === 'string' ? entry : entry?.message ?? entry?.code))
          .filter(Boolean)
          .join('; ');
      }
    } catch {
      // Plain-text error body.
    }
    const trimmed = text.trim();
    if (trimmed.length > 0 && trimmed.length <= 500 && !trimmed.startsWith('<')) return trimmed;
  }
  return `HTTP ${status}`;
}

function httpErrorCode(status) {
  if (status === 401) return 'authentication_required';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'http_error';
}

/**
 * Create a client bound to one API root. `fetchImpl` and `resolveToken` are
 * injectable for tests and for the Host credential seam.
 *
 * `resolveToken` is called before every request: the Harness resolves
 * credentials per operation so a changed token reaches the next call without a
 * restart. Its non-empty result wins over the static `token` option.
 * `maxResponseBytes` bounds each decoded response body before JSON parsing.
 * `fetchImpl` must return a Response with a readable `body` stream; a text()-only stub decodes as an empty body.
 *
 * `getCurrentUser` and `getUserSubmissions` also
 * take a `token` option. When it is a string, that request uses exactly it and
 * skips the lookup, so a caller that resolved the token once (`currentToken()`)
 * can keep identity and quota reads on the same token.
 */
export function createPlaygroundClient({
  baseUrl,
  token,
  resolveToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  fetchImpl,
} = {}) {
  const apiBase = normalizeApiBase(baseUrl);
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new PlaygroundApiError('maxResponseBytes must be a positive safe integer', { code: 'invalid_config' });
  }
  const staticToken = cleanString(token);
  const fetchFn = fetchImpl ?? globalThis.fetch;
  const defaultTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : DEFAULT_TIMEOUT_MS;

  if (typeof fetchFn !== 'function') {
    throw new PlaygroundApiError('this runtime has no fetch implementation', { code: 'unsupported_runtime' });
  }

  let competitionSchedulesReader;

  async function currentToken() {
    if (typeof resolveToken === 'function') {
      try {
        const value = await resolveToken();
        if (typeof value === 'string' && value.trim().length > 0) return value.trim();
      } catch {
        // Fall back to the static token; a broken credential store must not
        // turn an otherwise public read into a failure.
      }
    }
    return staticToken;
  }

  async function request(pathname, {
    query,
    method = 'GET',
    body,
    signal,
    requiresAuth = false,
    timeoutMs: requestTimeoutMs,
    token: tokenOverride,
  } = {}) {
    const authToken = typeof tokenOverride === 'string' ? tokenOverride.trim() : await currentToken();
    if (requiresAuth && authToken.length === 0) {
      throw new PlaygroundApiError(
        'A Playground token is required for this operation. Set PLAYGROUND_TOKEN in the Harness environment or store a credential with that name.',
        { code: 'authentication_required' },
      );
    }

    const url = new URL(`${apiBase}${pathname.startsWith('/') ? pathname : `/${pathname}`}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    const effectiveTimeout = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
      ? requestTimeoutMs
      : defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new PlaygroundApiError(`request timed out after ${effectiveTimeout} ms`, {
        code: 'timeout',
        url: url.toString(),
      }));
    }, effectiveTimeout);
    if (timer.unref) timer.unref();
    const forwardAbort = () => controller.abort(signal?.reason);
    if (signal !== undefined) {
      if (signal.aborted) forwardAbort();
      else signal.addEventListener('abort', forwardAbort, { once: true });
    }

    const headers = { accept: 'application/json' };
    if (authToken.length > 0) headers.authorization = `Bearer ${authToken}`;
    if (body !== undefined && typeof FormData !== 'undefined' && !(body instanceof FormData)) {
      headers['content-type'] = 'application/json';
    }

    let response;
    let text;
    try {
      response = await fetchFn(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      text = await readBoundedResponse(response, {
        maxResponseBytes, url: url.toString(), onTooLarge: (error) => controller.abort(error),
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new PlaygroundApiError('request was cancelled', { code: 'cancelled', url: url.toString(), cause: error });
      }
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason instanceof PlaygroundApiError) throw reason;
      }
      if (error instanceof PlaygroundApiError && error.code === 'invalid_response') throw error;
      for (let cause = error; cause; cause = cause.cause) {
        if (cause.message === 'unexpected redirect') {
          throw new PlaygroundApiError(
            'The Playground API answered with a redirect, which the plugin does not follow. Configure the final HTTPS API endpoint.',
            { code: 'redirect_refused', url: url.toString(), cause: error },
          );
        }
      }
      throw new PlaygroundApiError(`could not reach ${url.host}: ${error?.message ?? String(error)}`, {
        code: 'network_error',
        url: url.toString(),
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', forwardAbort);
    }

    if (!response.ok) {
      throw new PlaygroundApiError(extractErrorMessage(text, response.status), {
        code: httpErrorCode(response.status),
        status: response.status,
        url: url.toString(),
      });
    }
    if (text.trim().length === 0) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      if (!response.ok) {
        throw new PlaygroundApiError(extractErrorMessage(text, response.status), {
          code: httpErrorCode(response.status),
          status: response.status,
          url: url.toString(),
        });
      }
      throw new PlaygroundApiError('the platform returned a non-JSON response', {
        code: 'invalid_response',
        status: response.status,
        url: url.toString(),
        cause: error,
      });
    }
  }

  /**
   * Every challenge one `/challenges` filter selects, with `row` applied to each item in list order and the
   * items it returns nothing for left out: `{ rows }`.
   *
   * The read is anonymous: an official grouping is public, and a read that carried the signed-in token could
   * answer one account the challenges of another, which the shared grouping cache would then hand to
   * everyone. A filter that holds more than CHALLENGE_LIST_MAX_PAGES pages, and a page that returns nothing
   * while the list still says `has_more`, both fail with `incomplete_list`: the rows describe fewer
   * challenges than the filter does, and a grouping built from them would miscount. The caller keeps the
   * last grouping it read instead of publishing a short one.
   */
  async function collectChallengeRows(query, row, options) {
    const rows = [];
    for (let page = 1; page <= CHALLENGE_LIST_MAX_PAGES; page += 1) {
      const body = await request('/challenges', {
        query: { ...query, page, per_page: CHALLENGE_PAGE_SIZE_MAX }, signal: options.signal, token: '',
      });
      if (!Array.isArray(body?.items)) {
        throw new PlaygroundApiError('challenge list response has no items array', { code: 'invalid_response' });
      }
      for (const item of body.items) {
        const value = plainObject(item) ? row(item) : undefined;
        if (value) rows.push(value);
      }
      if (body.has_more !== true) return { rows };
      if (body.items.length === 0) break;
    }
    throw new PlaygroundApiError('the challenge list filter could not be read completely', { code: 'incomplete_list' });
  }

  return {
    baseUrl: apiBase,

    /** The token the next request would use ('' when there is none). Never logged or returned to tools. */
    currentToken,

    async noticeSeasons({ signal }) {
      const rows = await request('/hackathon/seasons', { token: '', signal });
      if (!Array.isArray(rows) || rows.some((row) => !plainObject(row) || !cleanString(row.slug)
        || (row.rounds != null && (!Array.isArray(row.rounds) || row.rounds.some((round) => !Number.isSafeInteger(round?.seq) || round.seq < 1))))) {
        throw new PlaygroundApiError('Invalid competition notice seasons', { code: 'invalid_response' });
      }
      return rows;
    },
    async noticeHub({ signal }) {
      const rows = await request('/contests', { token: '', signal });
      if (!Array.isArray(rows) || rows.some((row) => !plainObject(row) || !SEASON_SLUG.test(row.slug ?? '') || typeof row.hasPage !== 'boolean')) {
        throw new PlaygroundApiError('Invalid competition hub', { code: 'invalid_response' });
      }
      return rows;
    },
    async getCompetitionSchedules(options) {
      if (!competitionSchedulesReader) {
        const { createCompetitionSchedulesReader } = await import('./competition-schedules.js');
        competitionSchedulesReader ??= createCompetitionSchedulesReader({
          baseUrl: apiBase,
          timeoutMs: defaultTimeoutMs,
          async readText(url, { signal }) {
            const response = await fetchFn(url, { method: 'GET', signal, cache: 'no-cache', credentials: 'omit', redirect: 'error' });
            if (!response.ok) {
              await response.body?.cancel();
              throw new PlaygroundApiError('could not read the public competition page or its script', { status: response.status, url: url.href });
            }
            return readBoundedResponse(response, { maxResponseBytes, url: url.href });
          },
        });
      }
      return competitionSchedulesReader.read(options);
    },

    async listCompetitions(params = {}, options = {}) {
      const status = cleanString(params.status);
      if (status && !COMPETITION_STATUSES.includes(status)) {
        throw new PlaygroundApiError(`unsupported competition status "${status}"`, { code: 'invalid_argument' });
      }
      const body = await request('/hackathon/seasons', { signal: options.signal });
      if (!Array.isArray(body)) {
        throw new PlaygroundApiError('competition list response is not an array', { code: 'invalid_response' });
      }
      const items = body.map(normalizeCompetition).filter((item) => !status || item.status === status);
      return { total: items.length, items };
    },

    async getCurrentUser(options = {}) {
      try {
        const user = normalizeCurrentUser(await request('/auth/me', {
          requiresAuth: true,
          signal: options.signal,
          token: options.token,
        }));
        return { authenticated: true, baseUrl: apiBase, user };
      } catch (error) {
        // `reason` tells a missing token from one the platform refused. Invalid, expired and revoked
        // tokens all answer 401, so they cannot be told apart. Network and other failures still throw.
        if (error instanceof PlaygroundApiError) {
          if (error.status === 401 && error.code === 'authentication_required') return { authenticated: false, baseUrl: apiBase, reason: 'rejected' };
          if (error.status === 403 && error.code === 'forbidden') return { authenticated: false, baseUrl: apiBase, reason: 'forbidden' };
          if (error.code === 'authentication_required') return { authenticated: false, baseUrl: apiBase, reason: 'no_token' };
        }
        throw error;
      }
    },

    async getCompetition(competitionId, options = {}) {
      const id = positiveInteger(competitionId, undefined);
      if (id === undefined) throw new PlaygroundApiError('competition_id is required', { code: 'invalid_argument' });
      return normalizeCompetition(await request(`/hackathon/seasons/${id}`, { signal: options.signal }));
    },

    async getUserSubmissions(options = {}) {
      const rows = await request('/user-submissions', { requiresAuth: true, signal: options.signal, token: options.token });
      if (!Array.isArray(rows)) throw new PlaygroundApiError('user submissions response is not an array', { code: 'invalid_response' });
      return rows;
    },

    /** The Agent accounts registered under the signed-in account: `{ items: [{ id, name, framework, confirmed }] }`. */
    async listMyAgents(options = {}) {
      const body = await request('/agent/register', { requiresAuth: true, signal: options.signal, token: options.token });
      const list = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : undefined;
      if (!list) throw new PlaygroundApiError('agent account list response is not an array', { code: 'invalid_response' });
      return { items: list.map(normalizeAgentAccount).filter((item) => item.id !== undefined) };
    },

    async listChallenges(params = {}, options = {}) {
      const page = positiveInteger(params.page, 1);
      const perPage = positiveInteger(params.perPage ?? params.per_page, 10, { min: 1, max: CHALLENGE_PAGE_SIZE_MAX });
      const sort = cleanString(params.sort) || 'newest';
      if (sort !== 'newest' && sort !== 'attempts') {
        throw new PlaygroundApiError(`unsupported sort "${sort}"; use newest or attempts`, { code: 'invalid_argument' });
      }
      const query = compactObject({
        search: cleanString(params.search),
        disc: cleanString(params.discipline ?? params.disc),
        origin: cleanString(params.origin),
        season: cleanString(params.season),
        tag: cleanString(params.tag),
        sort,
        page,
        per_page: perPage,
      });

      const body = await request('/challenges', { query, signal: options.signal });
      if (!Array.isArray(body?.items)) {
        throw new PlaygroundApiError('challenge list response has no items array', { code: 'invalid_response' });
      }
      const items = body.items.map(normalizeCard).filter((item) => item.id);
      return {
        total: Number.isFinite(Number(body.total)) ? Number(body.total) : items.length,
        page: Number.isFinite(Number(body.page)) ? Number(body.page) : page,
        perPage: Number.isFinite(Number(body.per_page)) ? Number(body.per_page) : perPage,
        pages: Number.isFinite(Number(body.pages)) ? Number(body.pages) : 1,
        hasMore: body.has_more === true,
        items,
      };
    },

    /**
     * The scoring rounds of one hackathon season as the platform numbers them:
     * `{ currentSeq?, rounds: [{ seq, phase?, startAt?, endAt?, challengeCount, challengeIds }] }`.
     *
     * The rounds keep the order the endpoint returns them in, which is the order of their time windows
     * (`s4` answers `seq` 1 to 7 with rising `startAt`, read 2026-11-24); the plugin does not renumber or
     * reorder them by `seq`. Each round's `challengeIds` keep the official order of that round as well.
     * `GET /api/challenges` ignores a round filter (checked 2026-11-24), so a round is read by its own
     * challenge ids. The read is anonymous: the rounds are public, and a shared grouping must not depend on
     * who is signed in.
     */
    async getSeasonRounds(season, options = {}) {
      const slug = seasonSlug(season);
      const body = await request(`/hackathon/seasons/by-slug/${slug}/rounds`, { signal: options.signal, token: '' });
      if (!Array.isArray(body?.rounds)) {
        throw new PlaygroundApiError('season rounds response has no rounds array', { code: 'invalid_response' });
      }
      return compactObject({ currentSeq: finiteNumber(body.currentSeq),
        rounds: body.rounds.map(normalizeSeasonRound).filter(Boolean) });
    },

    /**
     * The hackathon track of every challenge of one season, in list order: `{ rows: [{ id, track, trackZh? }] }`.
     * `GET /api/challenges` ignores a track filter (checked 2026-11-24), so tracks are grouped from this
     * read. A challenge without a track is left out, and a row that names another season fails the read with
     * `invalid_response` instead of grouping that season's challenges under this one.
     */
    async listSeasonTracks(season, options = {}) {
      const slug = seasonSlug(season);
      return collectChallengeRows({ season: slug }, (item) => {
        // An unknown `season` leaves `GET /api/challenges` unfiltered (checked 2026-11-24), so a row of
        // another season means the filter was ignored and these rows describe a season nobody asked for.
        const rowSeason = rowSeasonSlug(item.hackathon);
        if (rowSeason !== undefined && rowSeason !== slug.toLowerCase()) {
          throw new PlaygroundApiError(`the challenge list ignored the season filter "${slug}" and answered ${rowSeason}`, { code: 'invalid_response' });
        }
        const id = cleanString(item.id);
        const track = plainObject(item.hackathon) ? cleanString(item.hackathon.track) : '';
        if (!id || !track) return undefined;
        return compactObject({ id, track, trackZh: cleanString(item.hackathon.trackZh) || undefined });
      }, options);
    },

    /**
     * The tags of every challenge one tag selects, in list order: `{ rows: [{ id, tags }] }`.
     * A contest the website selects by its own tag groups those challenges by the other tags they carry,
     * so the group holds challenge ids of this contest only: a challenge outside it cannot join a group by
     * carrying the same tag. A row that does not carry the requested tag fails the read with
     * `invalid_response`: the filter was ignored, and grouping the answer would mix in other contests.
     */
    async listTaggedChallengeTags(tag, options = {}) {
      const value = cleanString(tag);
      if (!value) throw new PlaygroundApiError('tag must be a non-empty string', { code: 'invalid_argument' });
      return collectChallengeRows({ tag: value }, (item) => {
        const id = cleanString(item.id);
        if (!id) return undefined;
        const tags = Array.isArray(item.tags)
          ? item.tags.map((entry) => (typeof entry === 'string' ? cleanString(entry) : cleanString(entry?.name))).filter(Boolean)
          : [];
        // A row without the requested tag means the filter was ignored, which would let a challenge outside
        // the contest join one of its groups by carrying the same other tag.
        if (!tags.includes(value)) {
          throw new PlaygroundApiError(`the challenge list ignored the tag filter "${value}"`, { code: 'invalid_response' });
        }
        return { id, tags };
      }, options);
    },

    /**
     * Challenge counts per discipline key:
     * `{ total, unclassified, disciplines: { key: count }, formalDisciplines?: { key: count } }`.
     * The platform answers `{ attempts, disciplines, formalDisciplines, subDisciplines, total, unclassified }`.
     * `disciplines` holds every `disc` value the list accepts; `formalDisciplines` is the platform's curated
     * set of broad fields, kept when it is an object. Keys longer than 100 characters and counts that are
     * not positive integers are dropped.
     */
    async getChallengeFacets(options = {}) {
      const body = await request('/challenges/facets', { signal: options.signal });
      const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
      if (!isMap(body) || !isMap(body.disciplines)) {
        throw new PlaygroundApiError('challenge facets response has no disciplines object', { code: 'invalid_response' });
      }
      const counts = (source) => {
        const kept = {};
        for (const [key, count] of Object.entries(source)) {
          const name = key.trim();
          if (name.length === 0 || name.length > 100 || !Number.isInteger(count) || count <= 0) continue;
          kept[name] = count;
        }
        return kept;
      };
      return compactObject({ total: finiteNumber(body.total), unclassified: finiteNumber(body.unclassified), disciplines: counts(body.disciplines),
        formalDisciplines: isMap(body.formalDisciplines) ? counts(body.formalDisciplines) : undefined });
    },

    async getChallenge(id, options = {}) {
      const challengeId = cleanString(id);
      if (challengeId.length === 0) {
        throw new PlaygroundApiError('challenge id must not be empty', { code: 'invalid_argument' });
      }
      const body = await request(`/challenges/${encodeURIComponent(challengeId)}`, { signal: options.signal });
      if (body === null || typeof body !== 'object') {
        throw new PlaygroundApiError('challenge detail response is not an object', { code: 'invalid_response' });
      }
      return normalizeChallengeDetail(body);
    },

    async listAttempts(challengeId, params = {}, options = {}) {
      const id = cleanString(challengeId);
      if (id.length === 0) {
        throw new PlaygroundApiError('challenge id must not be empty', { code: 'invalid_argument' });
      }
      const page = positiveInteger(params.page, 1);
      const limit = positiveInteger(params.limit ?? params.perPage ?? params.per_page, 20, { min: 1, max: 100 });
      const sort = cleanString(params.sort) || 'score';
      if (!ATTEMPT_SORTS.includes(sort)) {
        throw new PlaygroundApiError(`unsupported sort "${sort}"; use ${ATTEMPT_SORTS.join(', ')}`, { code: 'invalid_argument' });
      }
      const outcome = cleanString(params.outcome);
      if (outcome.length > 0 && !DECLARABLE_OUTCOMES.includes(outcome)) {
        throw new PlaygroundApiError(`unsupported outcome "${outcome}"; use ${DECLARABLE_OUTCOMES.join(', ')}`, { code: 'invalid_argument' });
      }

      const body = await request(`/challenges/${encodeURIComponent(id)}/attempts`, {
        query: compactObject({ page, limit, sort, outcome }),
        signal: options.signal,
      });
      if (!Array.isArray(body?.attempts)) {
        throw new PlaygroundApiError('attempt list response has no attempts array', { code: 'invalid_response' });
      }
      const items = body.attempts.map((attempt) => normalizeAttempt(attempt, { detailed: false })).filter((attempt) => attempt.id !== undefined);
      return {
        total: Number.isFinite(Number(body.total)) ? Number(body.total) : items.length,
        totalNonDraft: Number.isFinite(Number(body.totalNonDraft)) ? Number(body.totalNonDraft) : undefined,
        page,
        limit,
        sort,
        items,
      };
    },

    async getAttempt(attemptId, options = {}) {
      const id = positiveInteger(attemptId, undefined, { min: 1 });
      const body = await request(`/attempts/${id}`, { signal: options.signal });
      const attempt = normalizeAttempt(body);
      if (attempt.id === undefined) attempt.id = id;
      return attempt;
    },

  };
}
