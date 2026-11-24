import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlaygroundClient } from '../lib/api.js';
import { registerReadOnlyTools } from '../lib/host/tools.js';

const SLIDES = ['slide-5', 'slide-4', 'slide-3', 'slide-2', 'slide-1'];
const WEEKLY = {
  periods: [
    {
      slug: '4', labelZh: '第四期', startAt: '2020-01-01T00:00:00+08:00', endAt: '2030-01-01T00:00:00+08:00',
      challengeIds: [...SLIDES, 'graphic-2', 'graphic-1'],
      groups: [
        { key: 'slides', labelZh: '学术PPT', challengeIds: [...SLIDES] },
        { key: 'graphics', labelZh: '科研绘图', challengeIds: ['graphic-2', 'graphic-1'] },
      ],
    },
    {
      slug: '1', labelZh: '第一期', startAt: '2020-01-01T00:00:00+08:00', endAt: '2020-02-01T00:00:00+08:00',
      challengeIds: ['old-1'],
    },
  ],
};
const exec = { signal: new AbortController().signal };

// 追光者计划·招募赛 as its own tag lists it: challenges for two of its jobs, and one with no job tag.
const LIGHT_CHASING_ROWS = [
  { id: 'lc-mat-2', tags: ['追光者计划·招募赛', '岗位·材料科研 Agent 全栈开发实习生'] },
  { id: 'lc-ops-1', tags: ['追光者计划·招募赛', '岗位·运营实习生'] },
  { id: 'lc-mat-1', tags: ['追光者计划·招募赛', '岗位·材料科研 Agent 全栈开发实习生'] },
  { id: 'lc-plain', tags: ['追光者计划·招募赛'] },
];
// The job chips of that contest in the website's own order, counted from LIGHT_CHASING_ROWS. A job the
// contest has no challenge for keeps its chip and counts 0.
const LIGHT_CHASING_JOBS = [
  { key: 'mat', labelZh: '材料科研 Agent 全栈开发实习生', count: 2 },
  { key: 'drug', labelZh: 'AI for Science药物研发研究员/实习生', count: 0 },
  { key: 'sde', labelZh: '科研 Agent 全栈开发工程师／实习生', count: 0 },
  { key: 'fde', labelZh: 'FDE 前线部署工程师／实习生', count: 0 },
  { key: 'lab', labelZh: 'AI4S 智能大装置工程开发实习生', count: 0 },
  { key: 'spectra', labelZh: '创新算法研究员/实习生(解谱方向)', count: 0 },
  { key: 'lkm', labelZh: '创新算法研究员／实习生(LKM 方向)', count: 0 },
  { key: 'product', labelZh: '产品实习生', count: 0 },
  { key: 'ops', labelZh: '运营实习生', count: 1 },
];
// Scoring rounds as the API client returns them, in the platform's own order and with an empty round the
// season announced.
const S4_ROUNDS = { currentSeq: 2, rounds: [
  { seq: 1, challengeCount: 2, challengeIds: ['k4-1', 'k4-2'] },
  { seq: 2, challengeCount: 1, challengeIds: ['k4-3'] },
  { seq: 3, challengeCount: 0, challengeIds: [] },
] };
const S2_TRACKS = { rows: [
  { id: 'p2-paper-1', track: 'paper', trackZh: '论文复现' },
  { id: 'p2-fox-1', track: 'fox', trackZh: '科学狐狸' },
  { id: 'p2-paper-2', track: 'paper', trackZh: '论文复现' },
] };

function register(client) {
  const tools = [];
  registerReadOnlyTools({ tools: { register: (tool) => tools.push(tool) } }, client, {
    history() { throw new Error('history'); },
  });
  const find = (name) => tools.find((tool) => tool.name === name);
  return {
    challenges: find('playground_list_challenges'),
    competitions: find('playground_list_competitions'),
    detail: find('playground_get_competition'),
  };
}

function toolsFor({ schedules = {}, listChallenges, listCompetitions, getChallenge, taggedTags, seasonRounds, seasonTracks } = {}) {
  const called = [];
  const note = (name, fn) => async (...args) => { called.push(name); return fn(...args); };
  const client = {
    baseUrl: 'https://play.example.test/api',
    listCompetitions: note('listCompetitions', listCompetitions ?? (async () => ({ items: [] }))),
    getCompetitionSchedules: note('getCompetitionSchedules', async () => schedules),
    listChallenges: note('listChallenges', listChallenges ?? (async () => { throw new Error('platform list'); })),
    getChallenge: note('getChallenge', getChallenge ?? (async (id) => ({ id, title: `题目 ${id}` }))),
    // The three official groupings of the contests the website groups without periods. The job grouping is
    // read inside the contest's own tag, never by a job tag alone, so a challenge of another contest with
    // the same job tag cannot reach a group.
    listTaggedChallengeTags: note('listTaggedChallengeTags', taggedTags ?? (async (tag) => {
      assert.equal(tag, '追光者计划·招募赛', 'a job group is read inside its own contest');
      return { rows: LIGHT_CHASING_ROWS };
    })),
    getSeasonRounds: note('getSeasonRounds', seasonRounds ?? (async () => S4_ROUNDS)),
    listSeasonTracks: note('listSeasonTracks', seasonTracks ?? (async () => S2_TRACKS)),
    startTask: note('startTask', async () => { throw new Error('created a session'); }),
    bind: note('bind', async () => { throw new Error('bound a conversation'); }),
    dispatch: note('dispatch', async () => { throw new Error('dispatched work'); }),
    submit: note('submit', async () => { throw new Error('submitted'); }),
  };
  return { called, ...register(client) };
}

const writes = (called) => called.filter((name) => ['startTask', 'bind', 'dispatch', 'submit'].includes(name));
const text = (tool, value) => tool.output.render({}, value)[0].text;
const contest = (table, id) => table.contests.find((item) => item.id === id);

// Platform seasons as /api/hackathon/seasons answers them, read through the real API client.
const SEASONS = [
  { id: 41, slug: 's4', status: 'active', nameZh: '赛季四', seasonLabelZh: '第四季', visibility: 'public', completionThreshold: 3, challengeIds: ['c'] },
  { id: 72, slug: 'winter', status: 'draft', nameZh: 'Winter', seasonLabelZh: '冬季', visibility: 'public', completionThreshold: 4, challengeIds: ['w'] },
  { id: 83, slug: 'archive', status: 'archived', nameZh: 'Archive', visibility: 'public' },
];

test('the default competition list keeps the platform season rows that playground_get_competition reads', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init.method} ${url.pathname}`);
    if (url.pathname === '/api/hackathon/seasons') return Response.json(SEASONS);
    return Response.json(SEASONS.find((season) => season.id === Number(url.pathname.split('/').at(-1))));
  };
  const { competitions, detail } = register(createPlaygroundClient({ baseUrl: 'https://play.example.test', fetchImpl }));
  assert.deepEqual(competitions.parameters.properties.status.enum, ['draft', 'active', 'ended', 'archived']);
  const listed = await competitions.execute({}, exec);
  assert.deepEqual(listed.items, [
    { id: 41, slug: 's4', name: '赛季四', nameZh: '赛季四', seasonLabel: '第四季', status: 'active', visibility: 'public', completionThreshold: 3, challengeIds: ['c'] },
    { id: 72, slug: 'winter', name: 'Winter', nameZh: 'Winter', seasonLabel: '冬季', status: 'draft', visibility: 'public', completionThreshold: 4, challengeIds: ['w'] },
    { id: 83, slug: 'archive', name: 'Archive', nameZh: 'Archive', status: 'archived', visibility: 'public' },
  ]);
  assert.equal(listed.total, 3);
  assert.deepEqual(await competitions.execute({ view: 'seasons' }, exec), listed);
  for (const [status, ids] of [['active', [41]], ['draft', [72]], ['archived', [83]]]) {
    const filtered = await competitions.execute({ status }, exec);
    assert.deepEqual(filtered.items.map((item) => item.id), ids, status);
  }
  const rendered = text(competitions, listed);
  assert.match(rendered, /^Found \*\*3\*\* competition\(s\)\n\n\| id \| competition \| season \| status \| starts \| ends \|/);
  assert.match(rendered, /\n\| 41 \| 赛季四 \| 第四季 \| active \|/);

  const season = await detail.execute({ competition_id: listed.items.find((item) => item.slug === 's4').id }, exec);
  assert.equal(season.ok, true, JSON.stringify(season.error));
  assert.deepEqual([season.id, season.slug, season.challengeIds], [41, 's4', ['c']]);
  assert.ok(requests.every((request) => request.startsWith('GET ')), requests.join('\n'));
  assert.equal(requests.at(-1), 'GET /api/hackathon/seasons/41');
});

test('view contests gives the contest id, period slug, and group key that playground_list_challenges lists', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-23T12:00:00+08:00'));
  const { competitions, challenges, called } = toolsFor({ schedules: { 'bohr-product': WEEKLY } });
  const table = await competitions.execute({ view: 'contests' }, exec);
  const weekly = table.contests.find((item) => item.nameZh === '玻尔AI产品周赛');
  const period = weekly.periods.find((item) => item.labelZh === '第四期');
  const group = period.groups.find((item) => item.labelZh === '学术PPT');
  const listed = await challenges.execute({ competition: weekly.id, period: period.slug, group: group.key, per_page: 50 }, exec);
  assert.equal(listed.ok, true, JSON.stringify(listed.error));
  assert.deepEqual(listed.items.map((item) => item.id), SLIDES);
  assert.equal(JSON.stringify(table).includes('slide-5'), false, 'the contest table carries no challenge ids');
  const refused = await competitions.execute({ view: 'contests', status: 'active' }, exec);
  assert.equal(refused.error.code, 'invalid_argument');
  assert.deepEqual(writes(called), []);
});

test('the contests view lists official periods and groups, and a contest without groups has none', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-23T12:00:00+08:00'));
  const { competitions, challenges, called } = toolsFor({ schedules: { 'bohr-product': WEEKLY } });
  const table = await competitions.execute({ view: 'contests' }, exec);
  const bohr = contest(table, 'bohr-product');
  assert.deepEqual(bohr.periods.map((period) => [period.slug, period.labelZh, period.count, period.groupedCount]), [['4', '第四期', 7, 7], ['1', '第一期', 1, undefined]]);
  assert.deepEqual(bohr.periods[0].groups, [
    { key: 'slides', labelZh: '学术PPT', count: 5 },
    { key: 'graphics', labelZh: '科研绘图', count: 2 },
  ]);
  assert.equal(Object.hasOwn(bohr.periods[1], 'groups'), false);
  // A contest the website groups without periods carries its own counted groups, read from the platform.
  assert.deepEqual(contest(table, 'light-chasing').groups, LIGHT_CHASING_JOBS);
  assert.deepEqual(contest(table, 'knight-s4').groups, [
    { key: 'r1', labelZh: '第 1 轮', count: 2 },
    { key: 'r2', labelZh: '第 2 轮', count: 1 },
  ]);
  assert.deepEqual(contest(table, 'paper2arm-s2').groups, [
    { key: 'paper', labelZh: '论文复现', count: 2 },
    { key: 'fox', labelZh: '科学狐狸', count: 1 },
  ]);
  // A contest the website does not group has no groups, and neither has one grouped inside its periods.
  for (const id of ['agent', 'paper2arm-s3', 'bohr-product']) {
    assert.equal(Object.hasOwn(contest(table, id), 'groups'), false, id);
  }
  const rendered = text(competitions, table);
  assert.match(rendered, /\n- `bohr-product` 玻尔AI产品周赛 · live/);
  assert.match(rendered, /\n {2}- period `4` 第四期 · live · 7 in this period, 7 of them in groups\n {4}- group `slides` 学术PPT · 5\n/);
  assert.match(rendered, /\n {2}- period `1` 第一期 · ended · 1 in this period\n/);
  assert.match(rendered, /\n {2}- group `mat` 材料科研 Agent 全栈开发实习生 · 2\n {2}- group `drug` AI for Science药物研发研究员\/实习生 · 0\n/);
  assert.match(rendered, /\n {2}- group `ops` 运营实习生 · 1\n/);
  assert.match(rendered, /\n {2}- group `r1` 第 1 轮 · 2\n {2}- group `r2` 第 2 轮 · 1\n/);
  assert.doesNotMatch(rendered, /could not be read|could not be refreshed/);
  const first = await challenges.execute({ competition: 'bohr-product', period: '4', per_page: 2 }, exec);
  assert.deepEqual(first.competition.periods, bohr.periods, 'the first page and the contests view give the same answer');
  assert.deepEqual(writes(called), []);
  assert.deepEqual(called.filter((name) => !['listCompetitions', 'getCompetitionSchedules', 'getChallenge',
    'listTaggedChallengeTags', 'getSeasonRounds', 'listSeasonTracks'].includes(name)), []);
});

test('a contest grouped without periods pages one group, read inside that contest', async () => {
  const reads = [];
  const { challenges, called } = toolsFor({ taggedTags: async (tag) => {
    reads.push(tag);
    return { rows: LIGHT_CHASING_ROWS };
  } });
  const job = await challenges.execute({ competition: 'light-chasing', group: 'mat' }, exec);
  assert.equal(job.ok, true, JSON.stringify(job.error));
  assert.deepEqual(job.items.map((item) => item.id), ['lc-mat-2', 'lc-mat-1']);
  assert.deepEqual([job.total, job.hasMore], [2, false]);
  // The group holds the ids the contest's own tag read returned, so the challenge of the contest without a
  // job tag stays out of every group and no challenge is read by a job tag alone.
  assert.equal(JSON.stringify(job.items).includes('lc-plain'), false);
  assert.equal(called.includes('listChallenges'), false, 'a group list does not use the platform list');
  assert.deepEqual(job.competition.groups, LIGHT_CHASING_JOBS, 'the first page carries the groups the workbench shows as chips');
  // One cached grouping serves the pages that follow, so a later page selects the same challenges.
  const round = await challenges.execute({ competition: 'knight-s4', group: 'r1', per_page: 1, page: 2 }, exec);
  assert.deepEqual(round.items.map((item) => item.id), ['k4-2']);
  assert.deepEqual([round.total, round.hasMore], [2, false]);
  const second = await challenges.execute({ competition: 'light-chasing', group: 'ops' }, exec);
  assert.deepEqual(second.items.map((item) => item.id), ['lc-ops-1']);
  // A job the contest has no challenge for is a real choice that lists nothing, not an unknown group.
  const vacant = await challenges.execute({ competition: 'light-chasing', group: 'drug' }, exec);
  assert.deepEqual([vacant.ok, vacant.items, vacant.total, vacant.hasMore], [true, [], 0, false]);
  assert.deepEqual(reads, ['追光者计划·招募赛'], 'the cached grouping is not read again within its TTL');
  assert.deepEqual(writes(called), []);
});

test('a contest grouping that cannot be read lists the contest ungrouped and says so', async () => {
  const { competitions, challenges } = toolsFor({ taggedTags: async () => { throw new Error('HTTP 503'); } });
  const table = await competitions.execute({ view: 'contests' }, exec);
  const lightChasing = contest(table, 'light-chasing');
  assert.equal(Object.hasOwn(lightChasing, 'groups'), false);
  assert.equal(lightChasing.groupsStale, true);
  assert.equal(contest(table, 'knight-s4').groupsStale, undefined, 'one failed grouping does not mark another');
  const rendered = text(competitions, table);
  const start = rendered.indexOf('- `light-chasing`');
  const block = rendered.slice(start, rendered.indexOf('\n- `', start + 1));
  assert.match(block, /The official groups of this contest could not be refreshed, so this list may be out of date or incomplete\./);
  // A grouping that could not be read may still hold the group, so the failure carries no reason: the
  // workbench keeps the choice and offers 重试 instead of silently widening the list.
  const failed = await challenges.execute({ competition: 'light-chasing', group: 'mat' }, exec);
  assert.deepEqual([failed.ok, failed.error.code, failed.error.reason], [false, 'invalid_argument', undefined]);
  assert.match(failed.error.message, /官方分类暂未同步/);
});

test('paging a group returns exactly that group in official order', async () => {
  const { challenges, called } = toolsFor({ schedules: { 'bohr-product': WEEKLY } });
  const seen = [];
  const pages = [];
  for (let page = 1, hasMore = true; hasMore; page += 1) {
    const result = await challenges.execute({ competition: 'bohr-product', period: '4', group: 'slides', per_page: 2, page }, exec);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    seen.push(...result.items.map((item) => item.id));
    assert.ok(result.items.every((item) => item.title === `题目 ${item.id}`));
    pages.push([result.page, result.total, result.hasMore]);
    if (page === 1) assert.match(text(challenges, result), /- group `slides` 学术PPT · 5/);
    hasMore = result.hasMore;
    assert.ok(page < 5, 'paging did not end');
  }
  assert.deepEqual(seen, SLIDES);
  assert.deepEqual(pages, [[1, 5, true], [2, 5, true], [3, 5, false]]);
  const withSeason = await challenges.execute({
    competition: 'bohr-product', period: '4', group: 'slides', season: 's4', per_page: 50,
  }, exec);
  assert.deepEqual(withSeason.items.map((item) => item.id), SLIDES);
  assert.equal(called.includes('listChallenges'), false, 'a group list does not use the platform list');
  assert.deepEqual(writes(called), []);
});

test('a page with unread challenges says it is incomplete, and the next-page hint keeps per_page', async () => {
  const { challenges } = toolsFor({
    schedules: { 'bohr-product': WEEKLY },
    getChallenge: async (id) => { if (id === 'slide-5') throw new Error('HTTP 503'); return { id, title: `题目 ${id}` }; },
  });
  const args = { competition: 'bohr-product', period: '4', group: 'slides' };
  const partial = await challenges.execute({ ...args, per_page: 10 }, exec);
  assert.deepEqual([partial.missing, partial.hasMore, partial.items.length], [1, false, 4]);
  const partialText = text(challenges, partial);
  assert.match(partialText, /1 challenge\(s\) of this selection could not be read and are left out, so this page is incomplete/);
  assert.match(partialText, /Read again from page 1 with the same arguments before you say that the list is complete/);
  assert.doesNotMatch(partialText, /lists every matching challenge/);
  const first = await challenges.execute({ ...args, per_page: 2 }, exec);
  assert.match(text(challenges, first), /call again with the same arguments, `page` 2, and the same `per_page` 2\./);
  assert.doesNotMatch(text(challenges, first), /larger `per_page`/);

  const complete = toolsFor({ schedules: { 'bohr-product': WEEKLY } });
  const whole = await complete.challenges.execute({ ...args, per_page: 10 }, exec);
  assert.match(text(complete.challenges, whole), /This page lists every matching challenge in official order\./);
});

for (const change of ['detail recovers', 'official list grows']) {
  test(`fixed-id continuation restarts when ${change} and returns every id once`, async () => {
    const period = { ...WEEKLY.periods[0], challengeIds: ['A', 'B', 'C', 'D'], groups: [] };
    let unread = change === 'detail recovers' ? 'A' : undefined;
    const { challenges } = toolsFor({ schedules: { 'bohr-product': { periods: [period] } },
      getChallenge: async (id) => {
        if (id === unread) throw new Error('HTTP 503');
        return { id, title: id };
      } });
    const read = (args = {}) => challenges.execute({ competition: 'bohr-product', period: '4', per_page: 2, ...args }, exec);
    const first = await read();
    assert.deepEqual(first.items.map(({ id }) => id), unread ? ['B', 'C'] : ['A', 'B']);
    assert.equal(first.missing, unread ? 1 : undefined);
    assert.match(first.pageSignature, /^[a-f0-9]{64}$/);
    assert.ok(text(challenges, first).includes(first.pageSignature));
    if (unread) unread = undefined;
    else period.challengeIds.unshift('X');
    const changed = await read({ page: 2, page_signature: first.pageSignature });
    assert.equal(changed.error.code, 'catalog_changed');
    assert.equal(changed.items, undefined);
    assert.match(text(challenges, changed), /从第一页重新读取/);

    let result = await read();
    const seen = result.items.map(({ id }) => id);
    while (result.hasMore) {
      assert.ok(result.page < 4);
      result = await read({ page: result.page + 1, page_signature: result.pageSignature });
      assert.equal(result.ok, true);
      seen.push(...result.items.map(({ id }) => id));
    }
    assert.deepEqual(seen, change === 'detail recovers' ? ['A', 'B', 'C', 'D'] : ['X', 'A', 'B', 'C', 'D']);
  });
}

test('a sorted filtered continuation detects reordering with unchanged totals', async () => {
  let promoted = false;
  const { challenges } = toolsFor({ schedules: { 'bohr-product': WEEKLY },
    getChallenge: async (id) => ({ id, title: id, attempts: promoted && id === 'slide-1' ? 2 : 1 }) });
  const args = { competition: 'bohr-product', period: '4', search: 'slide', sort: 'attempts', per_page: 2 };
  const first = await challenges.execute(args, exec);
  const next = { ...args, page: 2, page_signature: first.pageSignature };
  assert.deepEqual((await challenges.execute(next, exec)).items.map(({ id }) => id), SLIDES.slice(2, 4));
  promoted = true;
  assert.equal((await challenges.execute(next, exec)).error.code, 'catalog_changed');
});

test('a grouped count counts each challenge once, and every page of a period carries the period counts', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-23T12:00:00+08:00'));
  const { competitions, challenges } = toolsFor({ schedules: { 'bohr-product': { periods: [{
    slug: '4', labelZh: '第四期', startAt: '2020-01-01T00:00:00+08:00', endAt: '2030-01-01T00:00:00+08:00',
    challengeIds: ['a', 'b', 'loose'],
    groups: [{ key: 'one', labelZh: '一', challengeIds: ['a', 'b'] }, { key: 'two', labelZh: '二', challengeIds: ['b'] }],
  }] } } });
  const table = await competitions.execute({ view: 'contests' }, exec);
  const period = contest(table, 'bohr-product').periods[0];
  assert.deepEqual([period.count, period.groupedCount, period.groups.map((group) => group.count)], [3, 2, [2, 1]]);
  assert.match(text(competitions, table), /period `4` 第四期 · live · 3 in this period, 2 of them in groups/);
  for (const page of [1, 2]) {
    const result = await challenges.execute({ competition: 'bohr-product', period: '4', group: 'one', per_page: 1, page }, exec);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.period, { slug: '4', count: 3, groupedCount: 2 }, `page ${page}`);
    assert.match(text(challenges, result), /Selected period `4` · 3 in this period, 2 of them in groups/, `page ${page}`);
  }
  const wholePeriod = await challenges.execute({ competition: 'bohr-product', period: '4', per_page: 50 }, exec);
  assert.deepEqual(wholePeriod.items.map((item) => item.id), ['a', 'b', 'loose']);
  assert.equal(JSON.stringify(table).includes('loose'), false);
});

test('illegal contest arguments fail with a reason instead of an empty list', async () => {
  const { challenges, called } = toolsFor({ schedules: { 'bohr-product': WEEKLY } });
  for (const [args, reason] of [
    [{ competition: 'missing', period: '4', group: 'slides' }, 'unknown_competition'],
    [{ period: '4' }, 'period_needs_competition'],
    [{ competition: 'agent', period: '1' }, 'competition_has_no_periods'],
    [{ group: 'slides' }, 'group_needs_period'],
    [{ competition: 'agent', group: 'slides' }, 'competition_has_no_groups'],
    [{ competition: 'bohr-product', period: '9' }, 'period_not_available'],
    [{ competition: 'bohr-product', period: '4', group: 'missing' }, 'group_not_available'],
    [{ competition: 'light-chasing', group: 'missing' }, 'group_not_available'],
  ]) {
    const result = await challenges.execute(args, exec);
    assert.equal(result.ok, false, JSON.stringify(args));
    assert.equal(result.error.code, 'invalid_argument');
    assert.equal(result.error.reason, reason, JSON.stringify(result.error));
    assert.equal(result.items, undefined);
    assert.match(text(challenges, result), new RegExp(`reason: \`${reason}\``));
  }
  const unknown = await challenges.execute({ competition: 'missing' }, exec);
  assert.match(unknown.error.message, /playground_list_competitions with view contests/);
  assert.equal(called.includes('getChallenge'), false);
  assert.deepEqual(writes(called), []);
});

test('a scientific-facilities period returns no challenges before its official start', async (t) => {
  const start = '2026-11-20T20:00:00+08:00';
  let now = Date.parse(start) - 1;
  t.mock.method(Date, 'now', () => now);
  const secret = 'facility-secret';
  const { challenges, called } = toolsFor({ schedules: { 'scientific-facilities': { periods: [{
    slug: '2', labelZh: '第二期', startAt: start, challengeIds: [secret],
    groups: [{ key: 'imaging', labelZh: '成像与结构重建', challengeIds: [secret] }],
  }] } } });
  const args = { competition: 'scientific-facilities', period: '2', group: 'imaging' };
  const closed = await challenges.execute(args, exec);
  assert.equal(closed.ok, true);
  assert.equal(closed.total, 0);
  assert.deepEqual(closed.items, []);
  assert.deepEqual(closed.competition.periods[0].groups, [{ key: 'imaging', labelZh: '成像与结构重建', count: 0 }]);
  assert.deepEqual(closed.period, { slug: '2', count: 0, groupedCount: 0 });
  assert.match(text(challenges, closed), /0 in this period, 0 of them in groups/);
  assert.match(text(challenges, closed), /No challenge is open for this selection\./);
  assert.equal(JSON.stringify(closed).includes(secret), false);
  assert.equal(called.includes('getChallenge'), false);
  now = Date.parse(start);
  const open = await challenges.execute(args, exec);
  assert.deepEqual(open.items.map((item) => item.id), [secret]);
  assert.equal(open.competition.periods[0].count, 1);
  assert.deepEqual(writes(called), []);
});

test('the contests view says when the season list or the official schedule could not be read', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-23T12:00:00+08:00'));
  const fresh = toolsFor({ schedules: { 'bohr-product': WEEKLY } });
  const freshText = text(fresh.competitions, await fresh.competitions.execute({ view: 'contests' }, exec));
  assert.doesNotMatch(freshText, /could not be read|could not be refreshed/);

  const degraded = toolsFor({
    schedules: { 'bohr-product': { ...WEEKLY, stale: true } },
    listCompetitions: async () => { throw new Error('HTTP 503'); },
  });
  const table = await degraded.competitions.execute({ view: 'contests' }, exec);
  assert.deepEqual([table.seasonsUnavailable, contest(table, 'bohr-product').periodsStale], [true, true]);
  const degradedText = text(degraded.competitions, table);
  assert.match(degradedText, /The platform season list could not be read, so seasons that only the platform lists are missing from this table\./);
  const bohrBlock = degradedText.slice(degradedText.indexOf('- `bohr-product`'), degradedText.indexOf('\n- `', degradedText.indexOf('- `bohr-product`') + 1));
  assert.match(bohrBlock, /The official schedule of this contest could not be refreshed, so these periods and groups may be out of date\./);
});

test('a platform-only season row shows the season value to copy, and that value lists the season', async () => {
  const seen = [];
  const { competitions, challenges } = toolsFor({
    listCompetitions: async () => ({ items: [{ slug: 'winter', nameZh: 'Winter', seasonLabel: '冬季', status: 'draft' }] }),
    listChallenges: async (params) => { seen.push(params.season); return { total: 1, page: 1, perPage: 10, pages: 1, hasMore: false, items: [{ id: 'w', title: 'W' }] }; },
  });
  const table = await competitions.execute({ view: 'contests' }, exec);
  assert.equal(contest(table, 'season:winter').kind, 'season');
  const rendered = text(competitions, table);
  assert.match(rendered, /\n- `season=winter` Winter · 冬季 · /);
  assert.doesNotMatch(rendered, /`season:winter`/);
  const copied = rendered.match(/`season=([^`]+)`/)[1];
  const listed = await challenges.execute({ season: copied }, exec);
  assert.deepEqual([listed.ok, seen], [true, ['winter']]);
});

test('an empty contest page tells a filter miss from a selection with nothing open or a page past the end', async () => {
  const { challenges } = toolsFor({ schedules: { 'bohr-product': WEEKLY } });
  const args = { competition: 'bohr-product', period: '4', group: 'slides' };
  const miss = await challenges.execute({ ...args, search: 'absent' }, exec);
  assert.deepEqual([miss.ok, miss.total], [true, 0]);
  assert.match(text(challenges, miss), /No challenge in this selection matched the search or filters\./);
  assert.doesNotMatch(text(challenges, miss), /No challenge is open/);
  const past = await challenges.execute({ ...args, page: 9 }, exec);
  assert.match(text(challenges, past), /Page 9 is past the last page, 1\./);
  assert.doesNotMatch(text(challenges, past), /No challenge is open|matched the search/);
});

test('only a page in the official order claims the official order', async () => {
  const attempts = { 'slide-5': 1, 'slide-4': 2, 'slide-3': 3, 'slide-2': 4, 'slide-1': 5 };
  const { challenges } = toolsFor({
    schedules: { 'bohr-product': WEEKLY },
    getChallenge: async (id) => ({ id, title: id, attempts: attempts[id] }),
    listChallenges: async () => ({ total: 1, page: 1, perPage: 12, pages: 1, hasMore: false, items: [{ id: 'tagged', title: 'Tagged' }] }),
  });
  const args = { competition: 'bohr-product', period: '4', group: 'slides', per_page: 10 };
  const official = await challenges.execute(args, exec);
  assert.equal(official.order, 'official');
  assert.match(text(challenges, official), /in official order/);
  const sorted = await challenges.execute({ ...args, sort: 'attempts' }, exec);
  assert.deepEqual(sorted.items.map((item) => item.id), [...SLIDES].reverse());
  assert.equal(sorted.order, 'attempts');
  assert.match(text(challenges, sorted), /sorted by attempts, most first/);
  assert.doesNotMatch(text(challenges, sorted), /official order/);
  const tagged = await challenges.execute({ competition: 'light-chasing' }, exec);
  assert.equal(tagged.order, 'newest');
  assert.match(text(challenges, tagged), /^Found \*\*1\*\* challenge\(s\) newest first · page 1\/1/);
  assert.doesNotMatch(text(challenges, tagged), /official order|undefined/);
});

test('a contest list refuses per_page above the documented 50', async () => {
  const { challenges, called } = toolsFor({ schedules: { 'bohr-product': WEEKLY } });
  const args = { competition: 'bohr-product', period: '4', group: 'slides' };
  for (const perPage of [51, 0, 1.5]) {
    const refused = await challenges.execute({ ...args, per_page: perPage }, exec);
    assert.deepEqual([refused.ok, refused.error.code], [false, 'invalid_argument'], String(perPage));
    assert.match(refused.error.message, /per_page must be an integer from 1 to 50/);
  }
  assert.equal(called.includes('getChallenge'), false);
  const largest = await challenges.execute({ ...args, per_page: 50 }, exec);
  assert.deepEqual([largest.ok, largest.perPage], [true, 50]);
  assert.match(challenges.description, /per_page is 1 to 50/);
});

test('an announced weekly period counts its challenges before it starts, as the description says', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-23T12:00:00+08:00'));
  const { competitions } = toolsFor({ schedules: { 'bohr-product': { periods: [{
    slug: '5', labelZh: '第五期', startAt: '2027-01-01T00:00:00+08:00', endAt: '2027-01-05T00:00:00+08:00', challengeIds: ['n-1', 'n-2'],
  }] } } });
  const period = contest(await competitions.execute({ view: 'contests' }, exec), 'bohr-product').periods[0];
  assert.deepEqual([period.status, period.count], ['upcoming', 2]);
  assert.match(competitions.description, /A period of 大科学装置专项赛 or 科学骑士大师赛 · 北大专区 counts 0 until its official start\./);
  assert.doesNotMatch(competitions.description, /count is 0 before the official start/);
});

test('the contest tools tell the controller to copy periods and groups instead of guessing a season', () => {
  const { challenges, competitions, detail } = toolsFor();
  assert.match(competitions.description, /玻尔AI产品周赛第四期/);
  assert.match(competitions.description, /Use view contests first when the user names a built-in contest or a period/);
  assert.match(competitions.description, /Do not invent them/);
  assert.match(competitions.description, /season does not select a period/);
  assert.match(competitions.description, /does not open a conversation/);
  assert.deepEqual(competitions.parameters.properties.view.enum, ['seasons', 'contests']);
  assert.match(challenges.description, /call playground_list_competitions with view contests first/);
  assert.match(challenges.description, /does not select a period of 玻尔AI产品周赛/);
  assert.match(challenges.description, /until hasMore is false/);
  assert.match(challenges.description, /does not open a conversation/);
  assert.match(challenges.description, /This tool itself does not recommend challenges\./);
  assert.doesNotMatch(challenges.description, /Do not choose or recommend/);
  assert.match(challenges.parameters.properties.season.description, /does not select a period/);
  assert.ok(challenges.parameters.properties.competition.enum.includes('bohr-product'));
  assert.match(detail.description, /never to select a period/);
  assert.doesNotMatch(detail.description, /Use its slug as the season filter/);
  assert.match(challenges.description, /cannot provide this classification at this moment/);
  assert.doesNotMatch(competitions.description, /官方已撤下/);
  assert.doesNotMatch(challenges.description, /官方已撤下/);
  assert.doesNotMatch(challenges.description, /withdrawn/);
});

test('a platform search stays on the challenge list and does not read the contest table', async () => {
  const seen = [];
  const { challenges, called } = toolsFor({
    listChallenges: async (params) => {
      seen.push(params);
      return { total: 1, page: 1, perPage: 10, pages: 1, hasMore: false, items: [{ id: 'plain', title: 'Plain' }] };
    },
  });
  const result = await challenges.execute({ search: 'demo', season: 's4' }, exec);
  assert.equal(result.ok, true);
  assert.equal(result.items[0].id, 'plain');
  assert.equal(seen[0].season, 's4');
  assert.equal(result.competition, undefined);
  assert.equal(called.includes('getCompetitionSchedules'), false);
  assert.equal(called.includes('getChallenge'), false);
  assert.deepEqual(writes(called), []);
});
