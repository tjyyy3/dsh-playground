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
 * Write endpoints (token required; both are multipart):
 *   POST /challenges/{id}/attempts         create an agent submission
 *   POST /attempts/{id}/bundle             attach an ARM zip bundle, then score
 *
 * No dependency beyond the global fetch, FormData, and Blob available in the
 * Harness runtime.
 */

export const DEFAULT_BASE_URL = 'https://play.bohrium.com';
export const DEFAULT_TIMEOUT_MS = 20000;
export const DEFAULT_UPLOAD_TIMEOUT_MS = 180000;
export const MAX_BUNDLE_BYTES = 200 * 1024 * 1024;
export const ATTEMPT_SORTS = ['score', 'newest', 'id', 'id_desc', 'updated'];
export const DECLARABLE_OUTCOMES = ['success', 'partial', 'failed', 'stuck'];
export const COMPETITION_STATUSES = ['draft', 'active', 'ended', 'archived'];
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
    throw new PlaygroundApiError(`baseUrl is not a valid absolute URL: ${raw}`, { code: 'invalid_config' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PlaygroundApiError(`baseUrl must use http or https: ${raw}`, { code: 'invalid_config' });
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
  });
  if (detailed) {
    const scorecard = jsonText(raw.scorecard, 6000);
    if (scorecard !== undefined) {
      result.scorecard = scorecard.text;
      if (scorecard.truncated) result.scorecardTruncated = true;
    }
  }
  return result;
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

function normalizeCurrentUser(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlaygroundApiError('current user response is not an object', { code: 'invalid_response' });
  }
  const id = Number(raw.id);
  const name = cleanString(raw.name);
  const email = cleanString(raw.email);
  if ((!Number.isInteger(id) || id <= 0) && name.length === 0 && email.length === 0) {
    throw new PlaygroundApiError('current user response has no identity', { code: 'invalid_response' });
  }
  return compactObject({
    id: Number.isInteger(id) && id > 0 ? id : undefined,
    name: name || undefined,
    email: email || undefined,
    role: cleanString(raw.role) || undefined,
    userType: cleanString(raw.userType) || undefined,
    affiliation: cleanString(raw.affiliation) || undefined,
  });
}

function normalizeViolations(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (typeof entry === 'string') return { message: entry };
    if (entry === null || typeof entry !== 'object') return undefined;
    const fix = typeof entry.fix === 'string' ? entry.fix : jsonText(entry.fix, 500)?.text;
    return compactObject({
      rule: cleanString(entry.rule) || undefined,
      message: cleanString(entry.message) || undefined,
      fix,
      docs: cleanString(entry.docs) || undefined,
    });
  }).filter((entry) => entry && (entry.message !== undefined || entry.rule !== undefined));
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
 */
export function createPlaygroundClient({
  baseUrl,
  token,
  resolveToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  uploadTimeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
  fetchImpl,
} = {}) {
  const apiBase = normalizeApiBase(baseUrl);
  const staticToken = cleanString(token);
  const fetchFn = fetchImpl ?? globalThis.fetch;
  const defaultTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const defaultUploadTimeoutMs = Number.isFinite(Number(uploadTimeoutMs)) && Number(uploadTimeoutMs) > 0
    ? Number(uploadTimeoutMs)
    : DEFAULT_UPLOAD_TIMEOUT_MS;
  if (typeof fetchFn !== 'function') {
    throw new PlaygroundApiError('this runtime has no fetch implementation', { code: 'unsupported_runtime' });
  }

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
    allowStatuses = [],
  } = {}) {
    const authToken = await currentToken();
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
      });
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) {
        throw new PlaygroundApiError('request was cancelled', { code: 'cancelled', url: url.toString(), cause: error });
      }
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason instanceof PlaygroundApiError) throw reason;
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

    if (!response.ok && !allowStatuses.includes(response.status)) {
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

  return {
    baseUrl: apiBase,

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
        }));
        return { authenticated: true, baseUrl: apiBase, user };
      } catch (error) {
        if (error instanceof PlaygroundApiError
          && (error.code === 'authentication_required' || error.status === 401)) {
          return { authenticated: false, baseUrl: apiBase };
        }
        throw error;
      }
    },

    async getCompetition(competitionId, options = {}) {
      const id = positiveInteger(competitionId, undefined);
      if (id === undefined) throw new PlaygroundApiError('competition_id is required', { code: 'invalid_argument' });
      return normalizeCompetition(await request(`/hackathon/seasons/${id}`, { signal: options.signal }));
    },

    async listMyAttempts(params = {}, options = {}) {
      const limit = positiveInteger(params.limit, 20, { max: 100 });
      const body = await request('/me/attempts', {
        query: compactObject({
          limit,
          cursor: cleanString(params.cursor),
          challenge_id: cleanString(params.challengeId),
          status: cleanString(params.status),
        }),
        requiresAuth: true,
        signal: options.signal,
      });
      if (!Array.isArray(body?.items)
        || !(body.next_cursor === null || typeof body.next_cursor === 'string')) {
        throw new PlaygroundApiError('personal submissions response has invalid items or cursor', { code: 'invalid_response' });
      }
      return {
        items: body.items.map((item) => normalizeAttempt(item, { detailed: false })).filter((attempt) => attempt.id !== undefined),
        nextCursor: body.next_cursor,
        limit,
      };
    },

    async listChallenges(params = {}, options = {}) {
      const page = positiveInteger(params.page, 1);
      const perPage = positiveInteger(params.perPage ?? params.per_page, 10, { min: 1, max: 50 });
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

    /**
     * Create an agent submission. `files` entries are
     * `{ field, filename, data: Blob }`; `fields` become multipart text parts.
     */
    async createAttempt(challengeId, fields = {}, files = [], options = {}) {
      const id = cleanString(challengeId);
      if (id.length === 0) {
        throw new PlaygroundApiError('challenge id must not be empty', { code: 'invalid_argument' });
      }
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        const text = String(value);
        if (text.length === 0) continue;
        form.append(key, text);
      }
      for (const file of files) {
        if (!file || !file.field || !file.filename) continue;
        form.append(file.field, file.data, file.filename);
      }

      const body = await request(`/challenges/${encodeURIComponent(id)}/attempts`, {
        method: 'POST',
        body: form,
        requiresAuth: true,
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? defaultUploadTimeoutMs,
      });
      const attempt = normalizeAttempt(body);
      return {
        attempt,
        idempotentReuse: body?.idempotentReuse === true,
        hasBundle: cleanString(body?.bundlePath).length > 0,
      };
    },

    /**
     * Attach one ARM zip bundle to an existing submission and trigger scoring.
     * A 400 response is meaningful here: the platform reports bundle validation
     * failures as 400 with `bundleStatus`, `validation`, and `violations`.
     */
    async uploadBundle(attemptId, bundle, options = {}) {
      const id = positiveInteger(attemptId, undefined, { min: 1 });
      if (!bundle || !bundle.filename || bundle.data === undefined) {
        throw new PlaygroundApiError('bundle must provide a filename and data', { code: 'invalid_argument' });
      }
      const form = new FormData();
      form.append('bundle', bundle.data, bundle.filename);

      const body = await request(`/attempts/${id}/bundle`, {
        method: 'POST',
        body: form,
        requiresAuth: true,
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? defaultUploadTimeoutMs,
        allowStatuses: [400],
      });
      const bundleStatus = cleanString(body?.bundleStatus);
      if (bundleStatus.length === 0) {
        // A 400 without bundleStatus is an ordinary request failure (missing
        // file, not authorized, unknown attempt), not a validation verdict.
        const message = typeof body?.error === 'string' && body.error.trim().length > 0
          ? body.error.trim()
          : 'the platform rejected the bundle upload';
        throw new PlaygroundApiError(message, { code: 'http_error' });
      }
      return {
        attempt: body?.attempt ? normalizeAttempt(body.attempt) : undefined,
        bundleStatus,
        validation: jsonText(body?.validation, 4000)?.text,
        violations: normalizeViolations(body?.violations),
        protocolUrl: cleanString(body?.protocol_url) || undefined,
      };
    },
  };
}
