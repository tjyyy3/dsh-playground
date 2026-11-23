import { PUBLISHED_SCHEDULE_IDS, competitionList, competitionSelection, findCompetition } from './competitions.js';
import { challengeWebBase, publicChallengeUrl, publicPageUrl } from './links.js';
import { compact, fail } from './workflow-result.js';

// Statement characters (code points) the challenge detail drawer receives; longer statements are cut and flagged.
export const CHALLENGE_CONTENT_MAX = 50000;

// Page size of the Host-side paging of fixed-id competition lists.
const CATALOG_PAGE_SIZE = 12;
// Discipline facets (/challenges/facets) for the catalog's 学科 filter. One read is shared by all callers and
// kept for FACETS_TTL_MS; a failed read is remembered for FACETS_FAILED_TTL_MS, during which first pages do
// not read or wait again. A first-page catalog read waits at most FACETS_WAIT_MS after its own reads for an
// unfinished facets read, then answers without it (a later read picks it up).
const FACETS_TTL_MS = 10 * 60 * 1000;
const FACETS_FAILED_TTL_MS = 60 * 1000;
const FACETS_WAIT_MS = 1000;
const FACETS_FALLBACK_TOP = 10;
const FACETS_FORMAL_MAX = 30;
const FACETS_OTHER_KEYS = 200;

/**
 * The 学科 filter's choices from a facets read. `top` is the platform's curated broad fields
 * (`formalDisciplines`, at most FACETS_FORMAL_MAX) by count, ties by key; when that set is missing or empty,
 * it is the FACETS_FALLBACK_TOP largest keys of `disciplines`. Every other `disciplines` key goes to 其他.
 * The list API matches `disc` exactly and has no "not one of these" form, so 其他 cannot be one query: the
 * Client turns it into a free-text discipline field, suggesting `otherKeys` (the first FACETS_OTHER_KEYS of
 * the rest by count). `otherCount` sums the rest; challenges without a discipline are in neither.
 */
export function disciplineFacets(raw) {
  const valid = (source) => Object.entries(source && typeof source === 'object' && !Array.isArray(source) ? source : {})
    .filter(([key, count]) => key.trim().length > 0 && key.length <= 100 && Number.isInteger(count) && count > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const entries = valid(raw && typeof raw === 'object' ? raw.disciplines : undefined);
  const formal = valid(raw && typeof raw === 'object' ? raw.formalDisciplines : undefined).slice(0, FACETS_FORMAL_MAX);
  const top = formal.length ? formal : entries.slice(0, FACETS_FALLBACK_TOP);
  const topKeys = new Set(top.map(([key]) => key));
  const rest = entries.filter(([key]) => !topKeys.has(key));
  return { top: top.map(([key, count]) => ({ key, count })),
    otherCount: rest.reduce((sum, [, count]) => sum + count, 0), otherKeys: rest.slice(0, FACETS_OTHER_KEYS).map(([key]) => key) };
}
const CARD_FIELDS = ['title', 'titleZh', 'discipline', 'difficulty', 'attempts', 'origin', 'status', 'tags', 'hasContent'];
// A challenge read by id, reduced to the fields a catalog card shows.
const challengeCard = (detail, id) => ({ id: detail.id || id,
  ...Object.fromEntries(CARD_FIELDS.filter((key) => detail[key] !== undefined).map((key) => [key, detail[key]])) });
function matchesCatalogFilters(card, { search, discipline, origin }) {
  const needle = typeof search === 'string' ? search.trim().toLowerCase() : '';
  if (needle && ![card.id, card.title, card.titleZh, card.discipline, card.origin, ...(card.tags || [])]
    .some((value) => typeof value === 'string' && value.toLowerCase().includes(needle))) return false;
  return (!discipline || card.discipline === discipline) && (!origin || card.origin === origin);
}

export function createCatalog({ client }) {
  // Challenges of a built-in competition (lib/competitions.js). A tag or a season is one filtered API list.
  // Fixed ids (a competition's own, or those of its periods) are read one by one in parallel and come back
  // in table order; an id that fails is skipped and counted in `missing` (left out when every id was read),
  // so the list can say it is incomplete. A read where every id fails is an error. Fixed lists are filtered
  // and paged here, because the API cannot do it for them: search, origin and discipline apply to the cards
  // on the Host; sort `attempts` orders the list by attempts (most first, stable, unknown last), while the
  // default `newest` keeps the table order (a card read by id has no creation time). Every page re-reads the
  // whole list, then slices `page`; a page past the end is empty with `hasMore: false`, like the API. All
  // reads share an internal AbortController that follows the caller's signal and is aborted when this read
  // ends, so nothing keeps running after a failure or a cancellation.
  async function competitionChallenges(selection, args, exec) {
    const { tag, season, challengeIds } = selection;
    const filters = { search: args.search, discipline: args.discipline, origin: args.origin, sort: args.sort };
    if (!challengeIds) {
      return client.listChallenges({ ...filters, tag, season, page: args.page, perPage: args.per_page }, { signal: exec.signal });
    }
    const internal = new AbortController();
    const stop = () => internal.abort(exec.signal?.reason);
    if (exec.signal?.aborted) stop();
    else exec.signal?.addEventListener?.('abort', stop, { once: true });
    const { signal } = internal;
    const cancelled = () => exec.signal?.reason ?? new Error('catalog read was cancelled');
    const readFixed = async () => {
      const settled = await Promise.allSettled(challengeIds.map((id) => client.getChallenge(id, { signal })));
      const cards = [];
      let error;
      let missing = 0;
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled' && outcome.value && typeof outcome.value === 'object') cards.push(challengeCard(outcome.value, challengeIds[index]));
        else { missing += 1; error ??= outcome.reason ?? new Error(`challenge ${challengeIds[index]} could not be read`); }
      });
      return { cards, error, missing };
    };
    // Settles as soon as the caller cancels, even if a read ignores its signal.
    const abandoned = new Promise((_, reject) => signal.addEventListener('abort', () => reject(cancelled()), { once: true }));
    abandoned.catch(() => {});
    try {
      if (signal.aborted) throw cancelled();
      const fixed = await Promise.race([readFixed(), abandoned]);
      if (exec.signal?.aborted) throw cancelled();
      // A read where nothing answered is an error.
      if (!fixed.cards.length && fixed.error) throw fixed.error;
      const matched = fixed.cards.filter((card) => matchesCatalogFilters(card, filters));
      const attempts = (item) => (Number.isFinite(item.attempts) ? item.attempts : -1);
      const items = args.sort === 'attempts' ? [...matched].sort((a, b) => attempts(b) - attempts(a)) : matched;
      const perPage = Number.isInteger(args.per_page) && args.per_page > 0 ? args.per_page : CATALOG_PAGE_SIZE;
      const pages = Math.max(1, Math.ceil(items.length / perPage));
      const page = Number.isInteger(args.page) && args.page > 0 ? args.page : 1;
      return { total: items.length, page, perPage, pages, hasMore: page < pages, items: items.slice((page - 1) * perPage, page * perPage),
        ...(fixed.missing ? { missing: fixed.missing } : {}) };
    } finally {
      exec.signal?.removeEventListener?.('abort', stop);
      internal.abort();
    }
  }

  // The shared facets read: the cached value while it is fresh, else one read for every caller. It runs
  // without any caller's signal, so one cancelled catalog read cannot cancel it for the others; the API
  // client's own timeout bounds it. It never rejects: a failure gives undefined, and for FACETS_FAILED_TTL_MS
  // after it first pages answer without facets at once instead of reading (and waiting) again.
  let facetsCache;
  let facetsFailedAt;
  let facetsReading;
  function readFacets(refresh) {
    if (!refresh) {
      if (facetsCache && Date.now() - facetsCache.at < FACETS_TTL_MS) return facetsCache.value;
      if (facetsFailedAt !== undefined && Date.now() - facetsFailedAt < FACETS_FAILED_TTL_MS) return undefined;
    }
    if (typeof client.getChallengeFacets !== 'function') return undefined;
    facetsReading ??= Promise.resolve().then(() => client.getChallengeFacets())
      .then((raw) => { const value = disciplineFacets(raw); facetsCache = { value, at: Date.now() }; facetsFailedAt = undefined; return value; },
        () => { facetsFailedAt = Date.now(); return undefined; })
      .finally(() => { facetsReading = undefined; });
    return facetsReading;
  }
  async function settleWithin(value, ms) {
    if (!(value instanceof Promise)) return value;
    let timer;
    const limit = new Promise((done) => { timer = setTimeout(done, ms); });
    try { return await Promise.race([value, limit]); } finally { clearTimeout(timer); }
  }

  async function catalog(args, exec) {
    const competition = findCompetition(args.competition);
    if (args.competition !== undefined && !competition) return fail('未知的比赛。请从比赛选择器中选择。');
    if (args.period !== undefined) {
      if (!competition) return fail('指定 period 时必须选择比赛。');
      if (!competition.periods) return fail('所选比赛没有分期，不能指定 period。');
    }
    // Only a first-page read carries the 学科 choices (`disciplineFacets`); "load more" pages do not. The
    // field is left out when facets are unavailable, so their failure never fails or blanks the catalog.
    // A "load more" page (page > 1) also skips the seasons read and carries no competition fields: the
    // Client keeps the selector of the first page.
    const firstPage = !(Number.isInteger(args.page) && args.page > 1);
    const hasPublishedSchedule = PUBLISHED_SCHEDULE_IDS.includes(competition?.id);
    exec.signal?.throwIfAborted();
    const schedulesRead = firstPage || hasPublishedSchedule ? client.getCompetitionSchedules?.({ revalidate: firstPage }) : undefined;
    const selectedSchedule = hasPublishedSchedule ? (await schedulesRead)?.[competition.id] : undefined;
    exec.signal?.throwIfAborted();
    const now = Date.now();
    const selection = competition && competitionSelection(competition.id, args.period, selectedSchedule?.periods, now);
    if (args.period !== undefined && !selection) {
      const reason = selectedSchedule?.periods && !selectedSchedule.stale ? 'period_not_available' : undefined;
      return fail('未知的分期。请从分期选择器中选择。', 'invalid_argument', reason);
    }
    const facetsRead = firstPage ? readFacets(args.refresh) : undefined;
    // The selector is built in, so a failed seasons read does not blank the catalog: the table is listed
    // without API-only seasons, its season entries keep their own dates, and the result carries
    // `seasonsUnavailable: true` instead of `competitions`. A cancellation still fails the whole read.
    let seasonsUnavailable = false;
    const [competitions, challenges, publishedSchedules] = await Promise.all([
      firstPage ? client.listCompetitions({}, { signal: exec.signal }).catch((error) => {
        if (exec.signal?.aborted) throw error;
        seasonsUnavailable = true;
        return undefined;
      }) : undefined,
      selection ? competitionChallenges(selection, args, exec) : client.listChallenges({
        search: args.search, discipline: args.discipline, origin: args.origin, season: args.season,
        sort: args.sort, page: args.page, perPage: args.per_page,
      }, { signal: exec.signal }),
      schedulesRead,
    ]);
    const facets = firstPage ? await settleWithin(facetsRead, FACETS_WAIT_MS) : undefined;
    // The workbench opens these in the system browser; webBase also serves tasks recorded without webUrl.
    const items = Array.isArray(challenges?.items)
      ? challenges.items.map((item) => (item && typeof item === 'object' && item.id !== undefined && item.id !== null
        ? { ...item, webUrl: publicChallengeUrl(client.baseUrl, item.id) } : item))
      : challenges?.items;
    if (!firstPage) return { ok: true, webBase: challengeWebBase(client.baseUrl), challenges: { ...challenges, items } };
    // Built-in competitions merged with the API seasons they do not represent; status is computed now.
    const competitionTable = competitionList({ seasons: competitions?.items, now, publishedSchedules })
      .map(({ pagePath, ...item }) => (pagePath ? { ...item, webUrl: publicPageUrl(client.baseUrl, pagePath),
        ...(item.periods ? { periods: item.periods.map(({ pagePath: periodPath, ...period }) => ({ ...period,
          webUrl: publicPageUrl(client.baseUrl, periodPath ?? pagePath, periodPath ? undefined : { period: period.slug }),
        })) } : {}) } : item));
    return { ok: true, webBase: challengeWebBase(client.baseUrl), ...(seasonsUnavailable ? { seasonsUnavailable: true } : { competitions }),
      competitionTable, ...(facets ? { disciplineFacets: facets } : {}), challenges: { ...challenges, items } };
  }

  // The catalog's challenge detail drawer. Read-only and session-free: it neither reads nor writes any
  // conversation and runs no command. Only the fields the drawer shows cross the wire.
  async function challenge(challengeId, exec) {
    const detail = await client.getChallenge(challengeId, { signal: exec.signal });
    const text = (value) => (typeof value === 'string' && value ? value : undefined);
    const gated = detail.contentGated === true;
    const chars = gated || typeof detail.content !== 'string' ? [] : Array.from(detail.content);
    const truncated = chars.length > CHALLENGE_CONTENT_MAX;
    return compact({
      ok: true, id: detail.id, title: text(detail.title), titleZh: text(detail.titleZh), discipline: text(detail.discipline),
      origin: text(detail.origin), difficulty: Number.isFinite(detail.difficulty) ? detail.difficulty : undefined,
      status: text(detail.status), attempts: Number.isFinite(detail.attempts) ? detail.attempts : undefined,
      // Deduplicated: the drawer keys its tag list by tag text.
      tags: Array.isArray(detail.tags) ? [...new Set(detail.tags.filter((tag) => typeof tag === 'string' && tag))] : [],
      resources: (Array.isArray(detail.resources) ? detail.resources : []).filter((item) => item && typeof item === 'object').map((item) => ({
        name: text(item.name), kind: text(item.kind), description: text(item.description), role: text(item.role), source: text(item.source),
      })),
      contentGated: gated,
      content: truncated ? chars.slice(0, CHALLENGE_CONTENT_MAX).join('') : chars.join(''),
      truncated,
      // The cap travels with the result, so the drawer's truncation note never hardcodes the number.
      contentLimit: CHALLENGE_CONTENT_MAX,
      webUrl: publicChallengeUrl(client.baseUrl, detail.id || challengeId),
    });
  }

  return { catalog, challenge };
}
