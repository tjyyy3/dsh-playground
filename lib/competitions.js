/**
 * Built-in table of the competitions in the Playground website's "赛事" menu.
 *
 * The website keeps this list in its front-end code, not behind an API, and the plugin does not scrape it.
 * A competition added to the website therefore appears here only with a plugin release. Each entry names how
 * its challenges are selected: a `tag` (`/challenges?tag=`), a `season` (`/challenges?season=`), fixed
 * `challengeIds` read one by one, or `periods`, each with its own fixed ids. Status is not stored; it is
 * computed from `startAt`/`endAt` by competitionStatus(). `rounds` is display text only.
 *
 * 玻尔产品周赛 is listed the way the website lists it (`/competition/bohr-product?period=<slug>`,
 * `/challenges?contest=bohr-product&period=<slug>`): only the fixed ids of each period, in the website's
 * order, and "all periods" is their de-duplicated concatenation in period order (13 challenges). It is not
 * read by tag: on 2026-11-04 the anonymous API listed 19 challenges under tag product-arena, 9 of them in no
 * period (challenge-9313ad0a 写作19｜思维导图, 写作17, 写作15, 写作14, 写作12, 写作10, 写作01, 阅读02, 写作05),
 * and ai-github-98fdb6f0 of period 1 does not carry the tag. Those 9 stay findable in the full catalog.
 * Period 1 ends at `24:00` as the website writes it; Date.parse reads that as 00:00 of the next day.
 *
 * Verified against the anonymous public API on 2026-11-02:
 *   tag 追光者计划·招募赛          27 challenges.
 *   season s1 / s2 / s3 / s4      40 / 37 / 32 / 60 challenges.
 *   /hackathon/seasons            slugs s1..s4 (s1-s3 ended, s4 active until 2027-01-31).
 *   Fixed ids                     all 12 answer 200 from /challenges/<id>: llm-challenge-arena-v1,
 *                                 llm-challenge-arena-v2 (second round, status closed; both come from the
 *                                 website's arena list), optimize-the-complete-dpa4c-nano-lammps-md-step-ac-6a1e56aa
 *                                 (DPA deploy, also in the PKU zone), biomaster-harness-optimization-4f6eec24,
 *                                 harness-45c4688b, agent-optimization-v1, scimaster-harness-arena-0ece77a4,
 *                                 abacus-fractional-charge-nao-basis-a8033ccd,
 *                                 flowforge-periodic-regular-tetrahedra-packing-f45cec7b, skill-13890f6a,
 *                                 ai-github-98fdb6f0, ai-635bc8b5.
 * Verified on 2026-11-04: all 13 ids of 玻尔产品周赛's periods answer 200 from /challenges/<id>, the three of
 * period 1 above and the ten of period 2: product-arena-08-3027d350, product-arena-01-5a9928c1,
 * product-arena-06-6d8cf72b, product-arena-09-0e8befd4, product-arena-10-760d1a0b, product-arena-02-7051d92d,
 * product-arena-03-429cc14d, product-arena-04-4b82ad21, product-arena-05-64faa4a2, product-arena-07-865de7e4.
 * The PKU zone's "optics" direction has no challenge id; the website sends it to the challenges page.
 * 玻尔产品周赛 has no end date on purpose: the website computes its status the same way, so it stays 进行中
 * after the second period ends (11.11 16:00) until the entry gets an `endAt`.
 *
 * Dates are shown as written: the date digits are taken from the ISO string without converting time zones,
 * the way the website prints them. A time of day is shown only for strings written with `+08:00` (the
 * website's own competition entries); other strings, such as the API's `+00:00` season times, get the date
 * only, as on the website. Status still compares real instants.
 */

export const COMPETITION_STATUSES = Object.freeze(['live', 'upcoming', 'ended']);
export const COMPETITION_STATUS_TEXT = Object.freeze({ live: '进行中', upcoming: '即将开始', ended: '已结束' });

const entry = (value) => Object.freeze({ ...value, select: Object.freeze({ ...value.select }),
  ...(value.periods ? { periods: Object.freeze(value.periods.map((period) => Object.freeze({ ...period, challengeIds: Object.freeze([...period.challengeIds]) }))) } : {}) });

export const COMPETITIONS = Object.freeze([
  entry({
    id: 'bohr-product', nameZh: '玻尔产品周赛', nameEn: 'Bohrium Product Weekly Contest',
    startAt: '2026-10-21T16:00:00+08:00',
    rounds: '第一期 10.21 16:00 — 11.03 24:00 · 第二期 11.04 16:00 — 11.11 16:00',
    // Period 1 in track order (Skill, GitHub, 小红书); period 2 in the website's order.
    periods: [
      { slug: '1', labelZh: '第一期', startAt: '2026-10-21T16:00:00+08:00', endAt: '2026-11-03T24:00:00+08:00',
        challengeIds: ['skill-13890f6a', 'ai-github-98fdb6f0', 'ai-635bc8b5'] },
      { slug: '2', labelZh: '第二期', startAt: '2026-11-04T16:00:00+08:00', endAt: '2026-11-11T16:00:00+08:00',
        challengeIds: ['product-arena-08-3027d350', 'product-arena-01-5a9928c1', 'product-arena-06-6d8cf72b',
          'product-arena-09-0e8befd4', 'product-arena-10-760d1a0b', 'product-arena-02-7051d92d', 'product-arena-03-429cc14d',
          'product-arena-04-4b82ad21', 'product-arena-05-64faa4a2', 'product-arena-07-865de7e4'] },
    ],
    pagePath: 'competition/bohr-product',
  }),
  entry({
    id: 'light-chasing', nameZh: '追光者计划·招募赛',
    startAt: '2026-10-10T20:00:00+08:00', endAt: '2026-10-11T20:00:00+08:00',
    select: { tag: '追光者计划·招募赛' },
    pagePath: 'competition/light-chasing',
  }),
  entry({
    id: 'pku', nameZh: '科学骑士大师赛 · 北大专区', nameEn: 'Science Knights Masters · PKU Zone',
    // The website shows 赛程待定: no dates yet.
    select: { challengeIds: [
      'optimize-the-complete-dpa4c-nano-lammps-md-step-ac-6a1e56aa',
      'abacus-fractional-charge-nao-basis-a8033ccd',
      'flowforge-periodic-regular-tetrahedra-packing-f45cec7b',
    ] },
    pagePath: 'competition/pku',
  }),
  entry({
    id: 'llm-deploy', nameZh: '模型部署赛', nameEn: 'Inference Serving Evaluation',
    startAt: '2026-09-18T00:00:00+08:00',
    select: { challengeIds: ['llm-challenge-arena-v1', 'llm-challenge-arena-v2'] },
    pagePath: 'competition/llm-deploy',
  }),
  entry({
    id: 'dpa-deploy', nameZh: 'DPA 部署赛',
    startAt: '2026-09-20T00:00:00+08:00',
    select: { challengeIds: ['optimize-the-complete-dpa4c-nano-lammps-md-step-ac-6a1e56aa'] },
    pagePath: 'competition/dpa-deploy',
  }),
  entry({
    id: 'harness', nameZh: 'Harness 优化赛', nameEn: 'Harness Optimization',
    startAt: '2026-09-24T20:00:00+08:00',
    rounds: '第一季 09.24 20:00 起 · 第二季 10.30 20:00 起',
    select: { challengeIds: ['biomaster-harness-optimization-4f6eec24', 'harness-45c4688b'] },
    pagePath: 'competition/harness',
  }),
  entry({
    id: 'agent', nameZh: 'Agent 赛',
    startAt: '2026-09-30T20:00:00+08:00',
    select: { challengeIds: ['agent-optimization-v1'] },
    pagePath: 'competition/agent',
  }),
  entry({
    id: 'science-reliability', nameZh: '科研 Agent Harness 优化赛', nameEn: 'Research Agent Harness Contest',
    startAt: '2026-10-30T20:00:00+08:00',
    select: { challengeIds: ['scimaster-harness-arena-0ece77a4'] },
    pagePath: 'competition/science-reliability',
  }),
  // Dates of the season entries are the API's own at the time of writing; workflow.catalog() prefers the
  // live /hackathon/seasons values and status for the same slug.
  entry({
    id: 'knight-s4', nameZh: '科学骑士大师赛', nameEn: 'Agentic Science Challenge',
    startAt: '2026-07-27T00:00:00Z', endAt: '2027-01-31T23:59:59Z',
    rounds: '每周计分轮，共 6 轮',
    select: { season: 's4' }, pagePath: 'hackathon-s4',
  }),
  entry({
    id: 'paper2arm-s3', nameZh: 'Paper2Arm 黑客松 · 第三季', nameEn: 'Paper2Arm Hackathon · Season 3',
    startAt: '2026-05-22T05:55:00Z', endAt: '2026-05-22T10:00:00Z',
    select: { season: 's3' }, pagePath: 'hackathon-s3',
  }),
  entry({
    id: 'paper2arm-s2', nameZh: 'Paper2Arm 黑客松 · 第二季', nameEn: 'Paper2Arm Hackathon · Season 2',
    startAt: '2026-04-29T05:00:00Z', endAt: '2026-04-29T10:00:00Z',
    select: { season: 's2' }, pagePath: 'hackathon-s2',
  }),
  entry({
    id: 'paper2arm-s1', nameZh: 'Paper2Arm 黑客松 · 第一季', nameEn: 'Paper2Arm Hackathon · Season 1',
    startAt: '2026-04-17T05:00:00Z', endAt: '2026-04-17T09:00:00Z',
    select: { season: 's1' }, pagePath: 'hackathon-s1',
  }),
]);

export const COMPETITION_IDS = Object.freeze(COMPETITIONS.map((item) => item.id));

export function findCompetition(id) {
  return COMPETITIONS.find((item) => item.id === id);
}

/** The period slugs of a table id, in period order; empty for an id without periods or an unknown id. */
export function competitionPeriodSlugs(id) {
  const found = typeof id === 'string' ? findCompetition(id) : undefined;
  return found?.periods ? found.periods.map((period) => period.slug) : [];
}

/**
 * How the Host reads the challenges of a table id: `{ tag?, season?, challengeIds? }`, or undefined for an
 * unknown id. For an entry with periods, `period` names one slug and gives that period's ids; without it,
 * all periods' ids in period order, each once. A `period` that the entry does not have gives undefined.
 */
export function competitionSelection(id, period) {
  const found = typeof id === 'string' ? findCompetition(id) : undefined;
  if (!found) return undefined;
  if (found.periods) {
    const chosen = period === undefined ? found.periods : found.periods.filter((item) => item.slug === period);
    return chosen.length ? { challengeIds: [...new Set(chosen.flatMap((item) => item.challengeIds))] } : undefined;
  }
  if (period !== undefined) return undefined;
  return { ...found.select, ...(found.select.challengeIds ? { challengeIds: [...found.select.challengeIds] } : {}) };
}

const parseTime = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return undefined;
  const time = Date.parse(trimmed);
  return Number.isFinite(time) ? time : undefined;
};

/**
 * `live`, `upcoming` or `ended` for an entry at `now` (milliseconds or a Date). The end wins over the start.
 * An entry with a start and no end stays live once started. An entry without a start is `upcoming`
 * (schedule pending), unless it has an end that has not passed yet, which makes it live.
 */
export function competitionStatus(item, now = Date.now()) {
  const at = now instanceof Date ? now.getTime() : Number(now);
  const start = parseTime(item?.startAt);
  const end = parseTime(item?.endAt);
  if (end !== undefined && at >= end) return 'ended';
  if (start !== undefined) return at >= start ? 'live' : 'upcoming';
  return end !== undefined ? 'live' : 'upcoming';
}

/**
 * The slug a period choice starts on at `now`: the live period, else the most recently started one, else
 * the first. Among several candidates the latest start wins, then the earlier in the list. Undefined
 * without periods.
 */
export function defaultPeriod(periods, now = Date.now()) {
  const list = Array.isArray(periods) ? periods.filter((item) => item && typeof item.slug === 'string') : [];
  if (!list.length) return undefined;
  const at = now instanceof Date ? now.getTime() : Number(now);
  const started = list.map((item) => ({ item, start: parseTime(item.startAt) })).filter(({ start }) => start !== undefined && start <= at);
  const latest = (candidates) => candidates.reduce((best, next) => (next.start > best.start ? next : best)).item.slug;
  const live = started.filter(({ item }) => competitionStatus(item, at) === 'live');
  if (live.length) return latest(live);
  return started.length ? latest(started) : list[0].slug;
}

// The date as written in an ISO string (`2027-01-31T23:59:59+00:00` reads 2027.01.31), without converting
// time zones, as the website does. The written time of day is kept only with a `+08:00` offset
// (`2026-10-10T20:00:00+08:00` reads 2026.10.10 20:00); in any other offset, `Z` and `+00:00` included, the
// written clock time is not Beijing time, so the date stands alone, as the website shows API seasons. A
// parseable string in another format gives its UTC+8 date, also without a time.
const WRITTEN_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;
const BEIJING_OFFSET = /[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\+08:?00$/;
function writtenParts(value) {
  const time = parseTime(value);
  if (time === undefined) return undefined;
  const trimmed = value.trim();
  const written = WRITTEN_TIME.exec(trimmed);
  if (written) {
    const [, year, month, day, hour, minute] = written;
    return { date: `${year}.${month}.${day}`, time: hour !== undefined && BEIJING_OFFSET.test(trimmed) ? `${hour}:${minute}` : undefined };
  }
  return { date: new Date(time + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.'), time: undefined };
}

/** `2026.10.10 — 2026.10.11`, `2026.09.24 起`, a single date, or `日期待定`. */
export function competitionDateText(item) {
  const start = writtenParts(item?.startAt);
  const end = writtenParts(item?.endAt);
  if (start && end) return start.date === end.date ? start.date : `${start.date} — ${end.date}`;
  if (start) return `${start.date} 起`;
  if (end) return `至 ${end.date}`;
  return '日期待定';
}

/**
 * Like competitionDateText with the time of day where it is written in `+08:00`:
 * `2026.10.10 20:00 — 2026.10.11 20:00`. Dates without a time read like competitionDateText.
 */
export function competitionTimeText(item) {
  const start = writtenParts(item?.startAt);
  const end = writtenParts(item?.endAt);
  const at = (parts) => (parts.time ? `${parts.date} ${parts.time}` : parts.date);
  if (start && end) return !start.time && !end.time && start.date === end.date ? start.date : `${at(start)} — ${at(end)}`;
  if (start) return `${at(start)} 起`;
  if (end) return `至 ${at(end)}`;
  return '日期待定';
}

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** Status of an API season: its own `ended`/`active` flag first, then its dates. */
function seasonStatus(season, now) {
  if (season.status === 'ended') return 'ended';
  const byDate = competitionStatus(season, now);
  if (byDate === 'ended') return 'ended';
  if (season.status === 'active') return 'live';
  return parseTime(season.startAt) === undefined && parseTime(season.endAt) === undefined ? 'upcoming' : byDate;
}

function publicItem(source, now, extra) {
  const status = extra.status ?? competitionStatus(source, now);
  const { startAt, endAt } = source;
  // Table periods carry their own status and time; their challenge ids stay on the Host.
  const periods = extra.periods?.map((period) => Object.fromEntries(Object.entries({
    slug: period.slug, labelZh: period.labelZh, status: competitionStatus(period, now), startAt: period.startAt, endAt: period.endAt,
    dateText: competitionDateText(period), timeText: competitionTimeText(period),
  }).filter(([, value]) => value !== undefined)));
  return Object.fromEntries(Object.entries({
    id: extra.id, kind: extra.kind, season: extra.season, nameZh: extra.nameZh, name: extra.name, status,
    startAt, endAt, dateText: competitionDateText(source), timeText: competitionTimeText(source),
    rounds: text(source.rounds), periods, defaultPeriod: periods ? defaultPeriod(extra.periods, now) : undefined, pagePath: extra.pagePath,
  }).filter(([, value]) => value !== undefined));
}

const statusRank = (status) => COMPETITION_STATUSES.indexOf(status);
const SEASON_SLUG = /^[A-Za-z0-9_-]+$/;

/**
 * The competition list the workbench selector shows: the built-in table with status computed at `now`, plus
 * the API seasons the table does not represent (so a season the API adds later does not disappear). For a
 * table entry that selects a season, the API's dates and status for that slug replace the table's. Items are
 * ordered live, upcoming, ended; inside a group the latest start comes first, entries without a start last.
 * An entry with periods also carries `periods` (`slug`, `labelZh`, status and time texts, no challenge ids) and
 * `defaultPeriod` at `now`. Each item has no web address yet: the Host adds `webUrl` from `pagePath`, and
 * for each period `pagePath?period=<slug>`. An API season whose slug is not
 * a plain `[A-Za-z0-9_-]` word gets no `pagePath`, so it cannot add path segments to the site address.
 */
export function competitionList({ seasons = [], now = Date.now() } = {}) {
  const bySlug = new Map((Array.isArray(seasons) ? seasons : []).filter((season) => season && typeof season.slug === 'string')
    .map((season) => [season.slug, season]));
  const represented = new Set(COMPETITIONS.map((item) => item.select.season).filter(Boolean));
  const items = COMPETITIONS.map((item) => {
    const season = item.select.season ? bySlug.get(item.select.season) : undefined;
    const dates = season ? { startAt: text(season.startAt) ?? item.startAt, endAt: text(season.endAt) ?? item.endAt } : {};
    const source = { ...item, ...dates };
    return publicItem(source, now, {
      id: item.id, kind: 'competition', season: item.select.season, nameZh: item.nameZh, name: item.nameEn ?? item.nameZh,
      periods: item.periods, pagePath: item.pagePath, status: season ? seasonStatus({ ...dates, status: season.status }, now) : undefined,
    });
  });
  for (const [slug, season] of bySlug) {
    if (represented.has(slug)) continue;
    const zh = text(season.nameZh) ?? text(season.name) ?? slug;
    const label = text(season.seasonLabel);
    items.push(publicItem(season, now, {
      id: `season:${slug}`, kind: 'season', season: slug, nameZh: label ? `${zh} · ${label}` : zh,
      name: text(season.name) ?? zh, pagePath: SEASON_SLUG.test(slug) ? `hackathon-${slug}` : undefined, status: seasonStatus(season, now),
    }));
  }
  const start = (item) => parseTime(item.startAt);
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => statusRank(a.item.status) - statusRank(b.item.status)
      || (start(b.item) ?? -Infinity) - (start(a.item) ?? -Infinity) || a.index - b.index)
    .map(({ item }) => item);
}
