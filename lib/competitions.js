/**
 * Built-in table of the competitions in the Playground website's "赛事" menu.
 *
 * The website keeps this list in its front-end code. The plugin reads the published schedules for
 * the Bohrium weekly contest, the Scientific Facilities Challenge, and the PKU Zone. Each entry names how
 * its challenges are selected: a `tag` (`/challenges?tag=`), a `season` (`/challenges?season=`), fixed
 * `challengeIds` read one by one, or `periods`, each with its own fixed ids. Status is not stored; it is
 * computed from `startAt`/`endAt` by competitionStatus(). `rounds` is display text only.
 *
 * 玻尔AI产品周赛 is listed the way the website lists it (`/competition/bohr-product?period=<slug>`,
 * `/challenges?contest=bohr-product&period=<slug>`): only the fixed ids of each period, in the website's
 * order, and "all periods" is their de-duplicated concatenation in period order. It is not
 * read by tag: on 2026-11-04 the anonymous API listed 19 challenges under tag product-arena, 9 of them in no
 * period (challenge-9313ad0a 写作19｜思维导图, 写作17, 写作15, 写作14, 写作12, 写作10, 写作01, 阅读02, 写作05),
 * and ai-github-98fdb6f0 of period 1 does not carry the tag. Those 9 stay findable in the full catalog.
 * Period 1 ends at `24:00` as the website writes it; Date.parse reads that as 00:00 of the next day.
 * A published period can carry the website's own groups (`groups: [{ key, labelZh?, challengeIds }]`, in its
 * order): the weekly contest's tracks with the shared bonus challenge last, Scientific Facilities' research
 * directions, or a PKU unit's own groups. Each group's ids are a subset of the period's ids.
 * A competition without periods can be grouped too. It names a `groupSource` that lib/challenge-groups.js
 * reads from the platform, so its groups and their counts follow the platform instead of this plugin's
 * release. The groups themselves are never stored here; `groupTags` and `groupOrder` only name which keys
 * the website shows and in which order, so a membership or count change needs no release.
 *
 * Verified against the anonymous public API on 2026-11-02:
 *   tag 追光者计划·招募赛          27 challenges.
 *   season s1 / s2 / s3 / s4      40 / 37 / 32 / 60 challenges.
 *   /hackathon/seasons            slugs s1..s4 (s1-s3 ended, s4 active until 2027-01-31).
 * 玻尔AI产品周赛 has no end date on purpose: the website computes its status the same way, so it stays 进行中
 * between periods and after the last published period ends.
 *
 * Dates are shown as written: the date digits are taken from the ISO string without converting time zones,
 * the way the website prints them. A time of day is shown only for strings written with `+08:00` (the
 * website's own competition entries); other strings, such as the API's `+00:00` season times, get the date
 * only, as on the website. Status still compares real instants.
 */

export const COMPETITION_STATUSES = Object.freeze(['live', 'upcoming', 'ended']);
export const COMPETITION_STATUS_TEXT = Object.freeze({ live: '进行中', upcoming: '即将开始', ended: '已结束' });
export const BOHR_PRODUCT_ID = 'bohr-product';
export const BOHR_PRODUCT_PAGE = `competition/${BOHR_PRODUCT_ID}`;
export const SCIENTIFIC_FACILITIES_ID = 'scientific-facilities';
const SCIENTIFIC_FACILITIES_PAGE = 'competition/ScientificFacilities';
export const PKU_ID = 'pku';
const PKU_PAGE = `competition/${PKU_ID}`;
export const PUBLISHED_SCHEDULE_IDS = Object.freeze([BOHR_PRODUCT_ID, SCIENTIFIC_FACILITIES_ID, PKU_ID]);
export const BOHR_PERIOD_SLUG = /^[1-9][0-9]{0,39}$/;
export const PKU_UNIT_SLUG = /^[a-z][a-z0-9-]{0,39}$/;
export const GROUP_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

/**
 * 追光者计划·招募赛 groups its challenges by the job it recruits for. The website keeps one tag per job
 * (role table `b4` of its public bundle, read 2026-11-24) and shows the chips in this order with `岗位·`
 * stripped. The plugin reads the contest's own challenges and groups them by these tags, so each group
 * counts the challenges it holds and follows the platform when the official membership changes. A job tag
 * is matched inside this contest only, so a challenge outside it never joins a group by carrying the same
 * tag. A challenge of the contest with no job tag belongs to no group and stays in 全部.
 * Every job stays in the row even when the contest currently has no challenge for it: the chips are the
 * official job list, and such a job counts 0.
 */
const LIGHT_CHASING_ROLE_TAGS = Object.freeze({
  mat: '岗位·材料科研 Agent 全栈开发实习生',
  drug: '岗位·AI for Science药物研发研究员/实习生',
  sde: '岗位·科研 Agent 全栈开发工程师／实习生',
  fde: '岗位·FDE 前线部署工程师／实习生',
  lab: '岗位·AI4S 智能大装置工程开发实习生',
  spectra: '岗位·创新算法研究员/实习生(解谱方向)',
  lkm: '岗位·创新算法研究员／实习生(LKM 方向)',
  product: '岗位·产品实习生',
  ops: '岗位·运营实习生',
});

const entry = (value) => Object.freeze({ ...value, select: Object.freeze({ ...value.select }),
  ...(value.groupTags ? { groupTags: Object.freeze({ ...value.groupTags }) } : {}),
  ...(value.groupOrder ? { groupOrder: Object.freeze([...value.groupOrder]) } : {}),
  ...(value.periods ? { periods: Object.freeze(value.periods.map((period) => Object.freeze({ ...period, challengeIds: Object.freeze([...period.challengeIds]) }))) } : {}) });

export const COMPETITIONS = Object.freeze([
  entry({
    id: BOHR_PRODUCT_ID, nameZh: '玻尔AI产品周赛', nameEn: 'Bohrium AI Product Weekly Contest',
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
    pagePath: BOHR_PRODUCT_PAGE,
  }),
  entry({
    id: SCIENTIFIC_FACILITIES_ID, nameZh: '大科学装置专项赛', nameEn: 'Scientific Facilities Challenge',
    startAt: '2026-11-13T20:00:00+08:00', openChallengesAtStart: true,
    periods: [
      { slug: '1', labelZh: '第一期', startAt: '2026-11-13T20:00:00+08:00', endAt: '2026-11-14T20:00:00+08:00',
        challengeIds: ['fib-sem-prep-recognition-combo-v4-88ecf3f1', 'fibsem-fa22b3e4', 'predict-crispri-perturbation-effects-in-h1-hesc-fr-c772ce91',
          'predict-a549-drug-identity-at-held-out-dose-from-l-15aa3fab', 'scientific-data-format-parsing-microscopy-and-imag-3b0fc8cf',
          'scientific-data-format-parsing-spectroscopy-diffra-c4ad8468', 'scientific-data-format-parsing-computational-chemi-9843e620'] },
      { slug: '2', labelZh: '第二期', challengeIds: [] },
    ],
    pagePath: SCIENTIFIC_FACILITIES_PAGE,
    periodPagePath: () => `${SCIENTIFIC_FACILITIES_PAGE}/events`,
  }),
  entry({
    id: 'light-chasing', nameZh: '追光者计划·招募赛', nameEn: 'Light Chaser Program · Recruitment Contest',
    startAt: '2026-10-10T20:00:00+08:00', endAt: '2026-10-11T20:00:00+08:00',
    select: { tag: '追光者计划·招募赛' },
    groupSource: 'tagRoles', groupTags: LIGHT_CHASING_ROLE_TAGS,
    pagePath: 'competition/light-chasing',
  }),
  entry({
    id: PKU_ID, nameZh: '科学骑士大师赛 · 北大专区', nameEn: 'Science Knights Masters · PKU Zone',
    startAt: '2026-11-06T20:00:00+08:00', endAt: '2026-11-27T20:00:00+08:00', openChallengesAtStart: true,
    periods: [
      { slug: 'science-1', labelZh: '科学挑战 · 第一期', startAt: '2026-11-06T20:00:00+08:00', endAt: '2026-11-07T20:00:00+08:00',
        challengeIds: ['design-the-best-delta-winglet-insert-for-a-heated-44e4c665', 'multi-sample-cnv-detection-from-binned-read-counts-15924b97',
          'open-resource-higgs-entanglement-reconstruction-an-695e00b1', 'xas-sim2real-bidirectional-52f0be51'] },
      { slug: 'efficiency-1', labelZh: '学术效率 · 第一期', startAt: '2026-11-06T20:00:00+08:00', endAt: '2026-11-13T20:00:00+08:00',
        challengeIds: ['product-arena-08-3027d350', 'product-arena-01-5a9928c1', 'product-arena-06-6d8cf72b',
          'product-arena-09-0e8befd4', 'product-arena-10-760d1a0b'] },
      { slug: 'science-2', labelZh: '科学挑战 · 第二期', startAt: '2026-11-13T20:00:00+08:00', endAt: '2026-11-14T20:00:00+08:00',
        challengeIds: ['denoise-a-frozen-pancreas-indrop1-single-cell-rna-e673f74c', 'muon-edge-reconstruction-sharp-material-boundaries-9839145f',
          'abacus-fractional-charge-nao-basis-a8033ccd'] },
      { slug: 'efficiency-2', labelZh: '学术效率 · 第二期', startAt: '2026-11-13T20:00:00+08:00', endAt: '2026-11-20T20:00:00+08:00',
        challengeIds: ['product-arena-02-7051d92d', 'challenge-96263d10', 'product-arena-03-429cc14d', 'challenge-b810ef56',
          'challenge-8021aacb', 'product-arena-04-4b82ad21', 'product-arena-05-64faa4a2', 'challenge-caca73b2',
          'challenge-2815a418', 'product-arena-07-865de7e4'] },
      { slug: 'science-3', labelZh: '科学挑战 · 第三期', startAt: '2026-11-20T20:00:00+08:00', endAt: '2026-11-21T20:00:00+08:00',
        challengeIds: ['algorithm-design-and-theoretical-limits-of-distrib-d2882bb9', 'decentralized-matrix-optimization-with-muon-update-309e79ca',
          'fixed-penalty-augmented-lagrangian-methods-c44eb91e', 'open-algorithm-design-for-static-decentralized-str-c3c6b225', 'euler-d0107393',
          'challenge-6ecbaf62', 'muon-13-c3f3daef', 'prove-that-a-closed-parameter-cube-of-positive-rad-06d5ed8f',
          'design-and-implement-one-optimizer-for-two-high-di-246d2de0', 'develop-a-high-accuracy-convex-conic-solver-under-6290151b'] },
      { slug: 'efficiency-3', labelZh: '学术效率 · 第三期', startAt: '2026-11-20T20:00:00+08:00', endAt: '2026-11-27T20:00:00+08:00',
        challengeIds: ['graphical-abstract-7030fff2', 'challenge-98e5a474', 'challenge-1bd90d8a', 'challenge-83d4f050',
          'challenge-9034312d', 'ppt-c7b80f0d', 'challenge-20870c35', 'ppt-710fbc72', 'ppt-6ad93034'] },
    ],
    pagePath: PKU_PAGE,
    periodPagePath: (slug) => `${PKU_PAGE}/events/${slug}`,
  }),
  entry({
    id: 'llm-deploy', nameZh: '模型部署赛', nameEn: 'LLM Deployment Arena',
    startAt: '2026-09-18',
    select: { challengeIds: ['llm-challenge-arena-v1', 'llm-challenge-arena-v2'] },
    pagePath: 'competition/llm-deploy',
  }),
  entry({
    id: 'dpa-deploy', nameZh: 'DPA 部署赛', nameEn: 'DPA Deployment Contest',
    startAt: '2026-09-20',
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
    id: 'agent', nameZh: 'Agent 赛', nameEn: 'Agent Arena',
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
    id: 'knight-s4', nameZh: '科学骑士大师赛', nameEn: 'Science Knights Masters',
    startAt: '2026-07-27T00:00:00Z', endAt: '2027-01-31T23:59:59Z',
    select: { season: 's4' }, groupSource: 'seasonRounds', pagePath: 'hackathon-s4',
  }),
  entry({
    id: 'paper2arm-s3', nameZh: 'Paper2Arm 黑客松 · 第三季', nameEn: 'Paper2Arm Hackathon · Season 3',
    startAt: '2026-05-22T05:55:00Z', endAt: '2026-05-22T10:00:00Z',
    select: { season: 's3' }, pagePath: 'hackathon-s3',
  }),
  entry({
    id: 'paper2arm-s2', nameZh: 'Paper2Arm 黑客松 · 第二季', nameEn: 'Paper2Arm Hackathon · Season 2',
    startAt: '2026-04-29T05:00:00Z', endAt: '2026-04-29T10:00:00Z',
    select: { season: 's2' }, groupSource: 'seasonTracks', pagePath: 'hackathon-s2',
    // The track order of the season's own page (论文复现 · 软件构造 · 红蓝对抗 · 科学狐狸, read 2026-11-24).
    // The names come from the platform; only the order is kept here.
    groupOrder: ['paper', 'software', 'red-blue', 'fox'],
  }),
  entry({
    id: 'paper2arm-s1', nameZh: 'Paper2Arm 黑客松 · 第一季', nameEn: 'Paper2Arm Hackathon · Season 1',
    startAt: '2026-04-17T05:00:00Z', endAt: '2026-04-17T09:00:00Z',
    select: { season: 's1' }, pagePath: 'hackathon-s1',
  }),
]);

export const COMPETITION_IDS = Object.freeze(COMPETITIONS.map((item) => item.id));

/**
 * Ids of the competitions without periods that the website still groups. Each names a `groupSource` that
 * lib/challenge-groups.js reads from the platform.
 */
export const GROUPED_COMPETITION_IDS = Object.freeze(COMPETITIONS
  .filter((item) => !item.periods && item.groupSource).map((item) => item.id));

export function findCompetition(id) {
  return COMPETITIONS.find((item) => item.id === id);
}

function withPublishedPeriods(item, periods) {
  if (!periods) return item;
  const sortedDates = (field) => periods.map((period) => period[field]).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  const endAt = item.openChallengesAtStart ? (periods.every((period) => period.endAt) ? sortedDates('endAt').at(-1) : undefined) : item.endAt;
  return { ...item, startAt: sortedDates('startAt')[0], endAt, periods, rounds: undefined };
}

/**
 * How the Host reads the challenges of a table id: `{ tag?, season?, challengeIds? }`, or undefined for an
 * unknown id. For an entry with periods, `period` names one slug and gives that period's ids; without it,
 * all periods' ids in period order, each once. A `period` that the entry does not have gives undefined.
 * One period with official groups also gives `groups` (`{ key, labelZh?, challengeIds }`); all periods give
 * none, because the same key names different groups in different periods. A period whose challenges have not
 * opened gives no ids, and its groups none either.
 */
export function competitionSelection(id, period, publishedPeriods, now = Date.now()) {
  const found = findCompetition(id);
  if (!found) return undefined;
  if (found.periods) {
    const periods = publishedPeriods ?? found.periods;
    const chosen = period === undefined ? periods : periods.filter((item) => item.slug === period);
    if (!chosen.length) return undefined;
    const open = found.openChallengesAtStart ? chosen.filter((item) => parseTime(item.startAt) <= now) : chosen;
    const groups = period === undefined ? undefined : chosen[0].groups;
    return { challengeIds: [...new Set(open.flatMap((item) => item.challengeIds))],
      ...(groups ? { groups: groups.map((group) => ({ ...group, challengeIds: open.length ? [...group.challengeIds] : [] })) } : {}) };
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
  // Table periods carry their own status and time, and their groups the number of ids each selects at `now`;
  // their challenge ids stay on the Host.
  const periods = extra.periods?.map((period) => Object.fromEntries(Object.entries({
    slug: period.slug, labelZh: period.labelZh, labelEn: period.labelEn, status: competitionStatus(period, now), startAt: period.startAt, endAt: period.endAt,
    dateText: competitionDateText(period), timeText: competitionTimeText(period), pagePath: extra.periodPagePath?.(period.slug),
    groups: competitionSelection(extra.id, period.slug, extra.periods, now).groups
      ?.map(({ challengeIds, ...group }) => ({ ...group, count: challengeIds.length })),
  }).filter(([, value]) => value !== undefined)));
  return Object.fromEntries(Object.entries({
    id: extra.id, kind: extra.kind, season: extra.season, nameZh: extra.nameZh, name: extra.name, status,
    startAt, endAt, dateText: competitionDateText(source), timeText: competitionTimeText(source),
    rounds: text(source.rounds), periods, defaultPeriod: periods ? defaultPeriod(extra.periods, now) : undefined,
    periodsStale: extra.periodsStale,
    // The official groups of a competition without periods, as the workbench and the controller see them:
    // the key to query, the website's Chinese name where it is known, and the number of challenges the
    // group holds. The ids a group selects stay on the Host.
    groups: extra.groups?.map(({ key, labelZh, count }) => Object.fromEntries(Object.entries({ key, labelZh, count })
      .filter(([, value]) => value !== undefined))),
    groupsStale: extra.groupsStale, pagePath: extra.pagePath,
  }).filter(([, value]) => value !== undefined));
}

const statusRank = (status) => COMPETITION_STATUSES.indexOf(status);
const SEASON_SLUG = /^[A-Za-z0-9_-]+$/;

/**
 * The competition list the workbench selector shows: the built-in table with status computed at `now`, plus
 * the API seasons the table does not represent (so a season the API adds later does not disappear). For a
 * table entry that selects a season, the API's dates and status for that slug replace the table's. Items are
 * ordered live, upcoming, ended; inside a group the latest start comes first, entries without a start last.
 * An entry with periods also carries `periods` (`slug`, `labelZh`, status and time texts, official `groups` as
 * `{ key, labelZh?, count }`, no challenge ids) and `defaultPeriod` at `now`. An entry the website groups
 * without periods carries its own `groups` (`{ key, labelZh?, count }`) from `challengeGroups` for its id.
 * `groupsStale` says the grouping could not be refreshed.
 * The Host adds `webUrl` using the entry or period's `pagePath`. An API season whose slug is not
 * a plain `[A-Za-z0-9_-]` word gets no `pagePath`, so it cannot add path segments to the site address.
 */
export function competitionList({ seasons = [], now = Date.now(), publishedSchedules, challengeGroups } = {}) {
  const bySlug = new Map((Array.isArray(seasons) ? seasons : []).filter((season) => season && typeof season.slug === 'string')
    .map((season) => [season.slug, season]));
  const represented = new Set(COMPETITIONS.map((item) => item.select.season).filter(Boolean));
  const items = COMPETITIONS.map((item) => {
    const season = item.select.season ? bySlug.get(item.select.season) : undefined;
    const dates = season ? { startAt: text(season.startAt) ?? item.startAt, endAt: text(season.endAt) ?? item.endAt } : {};
    const schedule = publishedSchedules?.[item.id];
    const source = { ...withPublishedPeriods(item, schedule?.periods), ...dates };
    // The grouping read for this competition. A competition with periods groups inside a period instead.
    const grouping = item.periods ? undefined : challengeGroups?.[item.id];
    return publicItem(source, now, {
      id: item.id, kind: 'competition', season: item.select.season, nameZh: item.nameZh, name: item.nameEn ?? item.nameZh,
      periods: source.periods, periodsStale: schedule?.stale ? true : undefined,
      groups: grouping?.groups?.length ? grouping.groups : undefined,
      groupsStale: grouping?.stale ? true : undefined,
      pagePath: item.pagePath, periodPagePath: item.periodPagePath, status: season ? seasonStatus({ ...dates, status: season.status }, now) : undefined,
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
