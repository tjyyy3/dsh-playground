import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCatalog } from '../lib/catalog.js';
import { createCompetitionSchedulesReader } from '../lib/competition-schedules.js';
import { readCompetitionNotices } from '../lib/competition-notices.js';
import { actOnNotices, createNoticeState, enterNotices } from '../src/client/controller/competition-notice-state.js';

const pageUrl = new URL('https://play.example/contests');
const firstEntry = '/assets/index-AbCd1234.js';
const nextEntry = '/assets/weekly-Q7v8X_9z.js';
const page = (entry) => `<!doctype html><head><script crossorigin SRC="${entry}" type=module></script></head>`;
const bohrProduct = 'bohr-product';
const scientificFacilities = 'scientific-facilities';
const pku = 'pku';
const unavailable = { periods: undefined, stale: true };

test('first visit lists confirmed live contests by deadline, ignoring expired status, invalid dates and unzoned windows', () => {
  const now = Date.parse('2026-11-25T10:00:00+08:00');
  const item = (key, fields) => ({ key, source: 'seasons', ...fields });
  const snapshot = { ok: true, scope: 'example', sources: ['seasons', 'hub'], items: [
    item('no-date', { officialStatus: 'active' }),
    item('active-but-ended', { officialStatus: 'open', endAt: '2026-11-25T02:00:00Z' }),
    item('invalid-calendar', { startAt: '2026-02-30T00:00:00Z', endAt: '2027-01-01T00:00:00Z' }),
    item('need-zone', { startAt: '2026-01-01T00:00:00', endAt: '2027-01-01T00:00:00' }),
    item('closed', { officialStatus: 'closed', startAt: '2026-11-20T12:00:00Z', endAt: '2026-12-20T12:00:00Z' }),
    item('today', { startAt: '2026-11-25T02:00:00Z', endAt: '2026-11-25T21:00:00+08:00' }),
    item('today', { source: 'hub', officialStatus: 'active' }),
    item('future', { startAt: '2026-11-26T10:00:00+08:00', endAt: '2026-11-27T10:00:00+08:00' }),
  ] };
  const fresh = createNoticeState();
  assert.equal(enterNotices(fresh, { ...snapshot, ok: false }, now).state, fresh);
  const first = enterNotices(fresh, snapshot, now);
  assert.equal(first.kind, 'overview');
  assert.deepEqual(first.items.map(({ key }) => key), ['today', 'no-date']);
  const confirmed = actOnNotices(first.state, first, 'acknowledge', now);
  assert.deepEqual(enterNotices(createNoticeState(JSON.parse(JSON.stringify(confirmed))), snapshot, now).items, []);
  const empty = enterNotices(fresh, { ...snapshot, items: [] }, now);
  assert.deepEqual(empty.items, []);
  assert.equal(enterNotices(empty.state, snapshot, now).kind, 'new');
});

test('Beijing midnight snooze retains only unexpired entries and does not hide or acknowledge another batch', () => {
  const time = '2026-11-25T23:58:00+08:00';
  const row = (key, endAt) => ({ key, source: 'seasons', officialStatus: 'open', endAt });
  const snapshot = { ok: true, scope: 'example', sources: ['seasons'], items: [
    row('at-midnight', '2026-11-26T00:00:00+08:00'), row('remaining', '2026-11-27T00:00:00+08:00'),
  ] };
  const overview = enterNotices(createNoticeState(), snapshot, time);
  const snoozed = actOnNotices(overview.state, overview, 'snooze', time);
  snapshot.items.push(row('new-round', '2026-11-28T00:00:00+08:00'));
  const newlyPublished = enterNotices(snoozed, snapshot, '2026-11-25T15:59:59Z');
  assert.deepEqual(newlyPublished.items.map(({ key }) => key), ['new-round']);
  const handled = actOnNotices(newlyPublished.state, newlyPublished, 'acknowledge', time);
  const partial = enterNotices(handled, { ...snapshot, sources: ['hub'], items: [] }, '2026-11-25T16:00:00Z');
  assert.deepEqual(partial.items, []);
  const resumed = enterNotices(partial.state, snapshot, '2026-11-25T16:00:00Z');
  assert.equal(resumed.kind, 'reminder');
  assert.deepEqual(resumed.items.map(({ key }) => key), ['remaining']);
  assert.deepEqual(resumed.state.sites.example.acknowledged, ['new-round']);
});

test('a recovering source can confirm a previously unverified first-use contest alongside a due reminder', () => {
  const row = (source, key, officialStatus) => ({ source, key, officialStatus });
  const firstDay = '2026-11-25T10:00:00+08:00';
  const secondDay = '2026-11-26T10:00:00+08:00';
  const snapshot = { ok: true, scope: 'example', sources: ['hub'], items: [
    row('hub', 'snoozed', 'active'), row('hub', 'unknown'), row('hub', 'finished', 'closed'),
  ] };
  const first = enterNotices(createNoticeState(), snapshot, firstDay);
  assert.deepEqual(first.items.map(item => item.key), ['snoozed']);
  const snoozed = actOnNotices(first.state, first, 'snooze', firstDay);
  snapshot.items[1].officialStatus = 'active';
  const sameSource = enterNotices(snoozed, snapshot, firstDay);
  assert.deepEqual(sameSource.items, []);
  snapshot.sources.push('seasons');
  snapshot.items = [row('seasons', 'unknown', 'active'), row('seasons', 'snoozed', 'active'), row('seasons', 'finished', 'active')];
  const recovered = enterNotices(sameSource.state, snapshot, secondDay);
  assert.deepEqual(recovered.items.map(item => item.key), ['snoozed', 'unknown']);
  assert.equal(recovered.kind, 'reminder');
  const acknowledged = actOnNotices(recovered.state, recovered, 'acknowledge', secondDay);
  snapshot.sources.push('overview');
  snapshot.items.push(row('overview', 'unknown', 'active'));
  assert.deepEqual(enterNotices(acknowledged, snapshot, secondDay).items, []);
});

test('v1 migration preserves discovery and opt-out without treating historical discovery as acknowledgment', () => {
  const site = 'https://play.example';
  const input = { enabled: false, seen: { [site]: { sources: ['seasons'], keys: ['known'] } } };
  const migrated = createNoticeState(input);
  const snapshot = { ok: true, scope: site, sources: ['seasons'], items: [{ key: 'known', source: 'seasons', officialStatus: 'active' }] };
  assert.deepEqual(migrated.sites[site].acknowledged, []);
  const now = Date.now();
  assert.equal(enterNotices(migrated, snapshot, now).status, 'disabled');
  const enabled = actOnNotices(migrated, null, 'enable', now);
  const next = enterNotices(enabled, snapshot, now);
  assert.deepEqual(next.items, []);
  snapshot.items.push({ key: 'next', source: 'seasons', officialStatus: 'active' });
  assert.deepEqual(enterNotices(next.state, snapshot, now).items.map(({ key }) => key), ['next']);
  const enabledUpgrade = enterNotices(createNoticeState({ ...input, enabled: true }), snapshot, now);
  assert.deepEqual(enabledUpgrade.items.map(({ key }) => key), ['next']);
});

function bohrBundle(includeFifth = false) {
  return `
    throw new Error("The reader must not execute the bundle");
    const opening = "2026-10-21T16:00:00+08:00", midnight = "2026-11-03T24:00:00+08:00";
    const tracks = Object.freeze([{key: "skill", challengeId: "slot-z"}, {key: "github", challengeId: "slot-a"},
      {key: "pending", challengeId: null}]);
    const entries = Object.freeze(["mapped-z", "mapped-a"]);
    const mappedSlots = Object.freeze(entries.map((challenge, index) =>
      Object.freeze({key: String(index + 1).padStart(2, "0"), challengeId: challenge})));
    const thirdGroups = Object.freeze([
      Object.freeze({key: "reading", challengeIds: Object.freeze(["read-z", "read-a"])}),
      {key: "writing", challengeIds: Object.freeze(["write-z"])},
    ]);
    const fourthGroups = Object.freeze([{key: "search", challengeIds: Object.freeze(["mapped-a", "search-z"])}]);
    const bonus = "bonus-3";
    const deployedPeriods = Object.freeze([
      {slug: "1", labelZh: "第一期", startAt: opening, endAt: midnight, layout: "tracks", slots: tracks},
      {slug: "2", labelZh: "第二期", startAt: "2026-11-04T16:00:00+08:00", endAt: "2026-11-11T16:00:00+08:00",
        layout: "challenges", slots: mappedSlots},
      {slug: "3", labelZh: "第三期", startAt: "2026-11-11T16:00:00+08:00", endAt: "2026-11-18T16:00:00+08:00",
        layout: "trackGroups", groups: thirdGroups, bonusId: bonus, slots: makeSlots(thirdGroups, bonus)},
      {slug: "4", labelZh: "第四期", startAt: "2026-11-18T21:00:00+08:00", endAt: "2026-11-25T21:00:00+08:00",
        layout: "trackGroups", groups: fourthGroups, bonusId: null, slots: makeSlots(fourthGroups, null)},
      ${includeFifth ? `{slug: "5", labelZh: "第五期", startAt: "2026-11-25T21:00:00+08:00", endAt: "2026-12-02T21:00:00+08:00",
        layout: "trackGroups", groups: Object.freeze([]), slots: []},` : ''}
    ].map(period => Object.freeze({
      ...period, challengeIds: Object.freeze(period.slots.map(slot => slot.challengeId).filter(Boolean)),
    })));
  `;
}

const fourPeriods = [
  { slug: '1', labelZh: '第一期', startAt: '2026-10-21T16:00:00+08:00', endAt: '2026-11-03T24:00:00+08:00',
    challengeIds: ['slot-z', 'slot-a'] },
  { slug: '2', labelZh: '第二期', startAt: '2026-11-04T16:00:00+08:00', endAt: '2026-11-11T16:00:00+08:00',
    challengeIds: ['mapped-z', 'mapped-a'] },
  { slug: '3', labelZh: '第三期', startAt: '2026-11-11T16:00:00+08:00', endAt: '2026-11-18T16:00:00+08:00',
    challengeIds: ['read-z', 'read-a', 'write-z', 'bonus-3'],
    groups: [{ key: 'reading', challengeIds: ['read-z', 'read-a'] }, { key: 'writing', challengeIds: ['write-z'] },
      { key: 'bonus', challengeIds: ['bonus-3'] }] },
  { slug: '4', labelZh: '第四期', startAt: '2026-11-18T21:00:00+08:00', endAt: '2026-11-25T21:00:00+08:00',
    challengeIds: ['mapped-a', 'search-z'], groups: [{ key: 'search', challengeIds: ['mapped-a', 'search-z'] }] },
];
const fifthPeriod = {
  slug: '5', labelZh: '第五期', startAt: '2026-11-25T21:00:00+08:00', endAt: '2026-12-02T21:00:00+08:00',
  challengeIds: [],
};

function facilitiesBundle(published = false) {
  return `
    const aK = "2026-11-13T20:00:00+08:00", cV = ${published ? '"2026-12-10T20:00:00+08:00"' : 'null'};
    const rQ = [
      {key: "p1", name: {zh: "第一期", en: "Period 1"}, openAt: aK, endAt: "2026-11-14T20:00:00+08:00"},
      {key: "p2", name: {zh: "第二期", en: "Period 2"}, openAt: cV, endAt: null},
    ];
    const hR = ${published ? '"facility-new"' : 'null'};
    const xJ = [
      {code: "Q01", period: "p1", direction: "microscopy", challengeId: "facility-z", title: {zh: "样品分析"}},
      {code: "Q02", period: "p2", direction: "imaging", challengeId: "facility-future"},
      {code: "Q03", period: "p1", direction: "imaging", challengeId: "facility-a"},
      {code: "Q04", period: "p2", direction: "microscopy", challengeId: hR},
      {code: "Q05", period: "p1", direction: "imaging", challengeId: null},
    ];
    const decoy = [{code: "Q01", period: "p1", challengeId: "unrelated"}];
  `;
}

const facilitiesPeriods = [
  { slug: '1', labelZh: '第一期', startAt: '2026-11-13T20:00:00+08:00', endAt: '2026-11-14T20:00:00+08:00',
    challengeIds: ['facility-z', 'facility-a'] },
  { slug: '2', labelZh: '第二期', challengeIds: ['facility-future'] },
];
const publishedFacilitiesPeriods = [facilitiesPeriods[0], {
  slug: '2', labelZh: '第二期', startAt: '2026-12-10T20:00:00+08:00', challengeIds: ['facility-future', 'facility-new'],
}];

function pkuBundle(extended = false) {
  return `
    const kR = "2026-11-06T20:00:00+08:00", qK = "pku-slides-z";
    const hP = [
      {key: "science", name: {zh: "科学挑战", en: "Science Challenge"}, desc: {zh: "科学", en: "Science"}},
      {key: "efficiency", name: {zh: "${extended ? '学术效率赛道' : '学术效率'}", en: "Research Productivity"},
        desc: {zh: "学术", en: "Productivity"}},
    ];
    const dU = [
      {id: "science-1", track: "science", name: {zh: "第一期", en: "Round 1"}, startAt: kR, endAt: "2026-11-07T20:00:00+08:00",
        challenges: [{id: "pku-science-z", title: {zh: "挑战一", en: "Challenge 1"}},
          {id: "pku-science-a", title: {zh: "挑战二", en: "Challenge 2"}}]},
      {id: "efficiency-1", track: "efficiency", name: {zh: "第一期", en: "Round 1"}, startAt: kR, endAt: "2026-11-13T20:00:00+08:00",
        challenges: [{id: "pku-product", title: {zh: "文献解析", en: "Document parsing"}}]},
      ${extended ? `{id: "efficiency-3", track: "efficiency", name: {zh: "第三期", en: "Round 3"},
        startAt: "2026-11-20T20:00:00+08:00", endAt: "2026-11-27T20:00:00+08:00",
        groups: [{key: "writing", title: {zh: "写作", en: "Writing"}}, {key: "slides", title: {zh: "幻灯片", en: "Slides"}}],
        challenges: [{id: qK, group: "slides", title: {zh: "学术汇报", en: "Academic presentation"}},
          {id: "pku-writing-a", group: "writing", title: {zh: "写作助手", en: "Writing assistant"}}]},` : ''}
    ];
  `;
}

const pkuPeriods = [
  { slug: 'science-1', labelZh: '科学挑战 · 第一期', labelEn: 'Science Challenge · Round 1', startAt: '2026-11-06T20:00:00+08:00', endAt: '2026-11-07T20:00:00+08:00',
    challengeIds: ['pku-science-z', 'pku-science-a'] },
  { slug: 'efficiency-1', labelZh: '学术效率 · 第一期', labelEn: 'Research Productivity · Round 1', startAt: '2026-11-06T20:00:00+08:00', endAt: '2026-11-13T20:00:00+08:00',
    challengeIds: ['pku-product'] },
];
const extendedPkuPeriods = [pkuPeriods[0], { ...pkuPeriods[1], labelZh: '学术效率赛道 · 第一期' }, {
  slug: 'efficiency-3', labelZh: '学术效率赛道 · 第三期', labelEn: 'Research Productivity · Round 3', startAt: '2026-11-20T20:00:00+08:00', endAt: '2026-11-27T20:00:00+08:00',
  challengeIds: ['pku-slides-z', 'pku-writing-a'],
  groups: [{ key: 'writing', labelZh: '写作', labelEn: 'Writing', challengeIds: ['pku-writing-a'] }, { key: 'slides', labelZh: '幻灯片', labelEn: 'Slides', challengeIds: ['pku-slides-z'] }],
}];
const firstBundle = bohrBundle() + facilitiesBundle() + pkuBundle();
const nextBundle = bohrBundle(true) + facilitiesBundle(true) + pkuBundle(true);
const firstSchedules = {
  [bohrProduct]: { periods: fourPeriods },
  [scientificFacilities]: { periods: facilitiesPeriods },
  [pku]: { periods: pkuPeriods },
};
const nextSchedules = {
  [bohrProduct]: { periods: [...fourPeriods, fifthPeriod] },
  [scientificFacilities]: { periods: publishedFacilitiesPeriods },
  [pku]: { periods: extendedPkuPeriods },
};
const unavailableSchedules = {
  [bohrProduct]: unavailable,
  [scientificFacilities]: unavailable,
  [pku]: unavailable,
};

function fixture() {
  const files = new Map([[pageUrl.pathname, page(firstEntry)], [firstEntry, firstBundle]]);
  const requests = [];
  const reader = createCompetitionSchedulesReader({
    baseUrl: pageUrl.origin,
    async readText(url, { signal }) {
      requests.push(url.href);
      signal.throwIfAborted();
      if (!files.has(url.pathname)) throw new Error('Not found');
      return files.get(url.pathname);
    },
  });
  return { reader, files, requests };
}

test('contest alerts keep healthy sources independent and extract the published weekly summary, rewards and resources', async () => {
  const { reader, files } = fixture();
  files.set(firstEntry, firstBundle + `const pageCopy = {zh:{themeTitle:"主题", chatCardCompute:"进群申领算力", periods:{1:{intro:"本期阅读论文"}},rewardPool:"周赛奖励"},
    en:{themeTitle:"Theme",chatCardCompute:"Request compute",periods:{1:{intro:"Read research papers"}},rewardPool:"Weekly prizes"}};`);
  const client = { baseUrl: pageUrl.origin, getCompetitionSchedules: (options) => reader.read(options),
    noticeSeasons: async () => [{ slug: 'new', nameZh: '新比赛', status: 'active', rules: { awards: [{ zh: '优秀奖' }] }, rounds: [{ seq: 1, status: 'closed' }] }],
    noticeHub: async () => [{ slug: 'new', nameZh: '新比赛', hasPage: true, hub: { description: { en: 'A contest' } } },
      { slug: 'hub-only', nameEn: 'Hub only', hasPage: false }] };
  const snapshot = await readCompetitionNotices(client);
  const first = snapshot.items.find((row) => row.source === bohrProduct);
  assert.deepEqual([first.summaryZh, first.summary, first.rewardZh, first.resources], ['本期阅读论文', 'Read research papers', '周赛奖励', 'Request compute']);
  const season = snapshot.items.find((row) => row.source === 'seasons');
  const round = snapshot.items.find((row) => row.parentKey === season.key);
  assert.equal(season.officialStatus, 'active');
  assert.deepEqual(season.target, { kind: 'collection', season: 'new' });
  assert.deepEqual(round.target, season.target);
  assert.equal(round.officialStatus, 'closed');
  assert.equal(round.rewardZh, '全赛奖项：优秀奖');
  assert.equal(round.summary, 'A contest');
  assert.equal(season.key, snapshot.items.find((row) => row.source === 'hub').key);
  assert.equal(season.webUrl, 'https://play.example/competition/new');
  const partial = await readCompetitionNotices({ ...client, noticeSeasons: async () => { throw Error('offline'); },
    getCompetitionSchedules: async () => ({ [bohrProduct]: { periods: fourPeriods, stale: true } }) });
  assert.deepEqual(partial.sources, ['catalog', 'hub']);
  assert.ok(partial.items.some((row) => row.title === 'Hub only'));
  assert.ok(!partial.items.some((row) => row.source === bohrProduct));
});

test('only a published period with one available challenge has a concrete notice target', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-26T08:00:00Z'));
  const client = { baseUrl: pageUrl.origin, noticeSeasons: async () => [], noticeHub: async () => [],
    getCompetitionSchedules: async () => ({
      [bohrProduct]: { periods: [fourPeriods[0], { ...fifthPeriod, challengeIds: ['actual-id'] }] },
      [scientificFacilities]: { periods: [{ ...fifthPeriod, startAt: '2026-12-02T00:00:00Z', challengeIds: ['unreleased-id'] }] },
    }) };
  const { items } = await readCompetitionNotices(client);
  assert.deepEqual(items.filter((item) => item.source === bohrProduct).map((item) => item.target), [
    { kind: 'collection', competition: bohrProduct, period: '1' },
    { kind: 'challenge', challengeId: 'actual-id', title: 'actual-id', competition: bohrProduct, period: '5' },
  ]);
  assert.deepEqual(items.find((item) => item.source === scientificFacilities).target, { kind: 'collection', competition: scientificFacilities, period: '5' });
  assert.ok(!JSON.stringify(items).includes('unreleased-id'));
});

test('a Science Knights scoring round alert names its exact official catalog group', async () => {
  const client = { baseUrl: pageUrl.origin, noticeSeasons: async () => [{ slug: 's4', rounds: [{ seq: 8 }, { seq: 9 }] }],
    noticeHub: async () => [], getCompetitionSchedules: async () => ({}) };
  const { items } = await readCompetitionNotices(client);
  assert.deepEqual(items.filter((item) => item.parentKey).map((item) => item.target), [
    { kind: 'collection', competition: 'knight-s4', group: 'r8' }, { kind: 'collection', competition: 'knight-s4', group: 'r9' },
  ]);
});

const overviewSource = (extraCards = '') => `
  const stations = [];
  const officialContestCards = [
    {id: "bohr-product", track: "product", ...status(), title: "周赛", description: "", enterTarget: "competition/bohr-product"},
    {id: "deploy-main", track: "deploy", title: "模型部署赛", description: "", enterTarget: "competition/llm-deploy"},
    {id: "agent", track: "agent", title: "Agent 赛", description: "", enterTarget: "competition/another-agent-page"},
    {id: "knight-s4", track: "knight", title: "科学骑士大师赛", description: "", enterTarget: "hackathon-s4"},
    ${extraCards}
    ...stations.map(campusContest)
  ];
  const unrelated = [{id: "decoy", title: "Decoy", description: "", enterTarget: "questions/decoy"}];
`;

test('contest alerts read standalone cards from the official overview and skip existing or unsafe entries', async () => {
  const { reader, files, requests } = fixture();
  const client = { baseUrl: pageUrl.origin, getCompetitionSchedules: (options) => reader.read(options),
    noticeSeasons: async () => [], noticeHub: async () => [
      { slug: 'hub-alias', nameEn: 'Hub contest', hasPage: true }, { slug: 'future-masters', nameEn: 'Separate hub contest', hasPage: true },
    ] };
  files.set(firstEntry, firstBundle + overviewSource());
  const baseline = await readCompetitionNotices(client);
  assert.ok(baseline.sources.includes('overview'));
  assert.deepEqual(baseline.items.filter((item) => item.source === 'overview'), []);

  const later = `
    const slug = "future-masters", route = \`questions/\${slug}\`;
    const begins = "2026-12-01T20:00:00+08:00", deadline = "2026-12-04T20:00:00+08:00";
    ${overviewSource(`
      {id: slug, track: "research", ...status(), title: "未来大师赛", titleEn: "Future Masters",
        description: "未来的独立赛事", descriptionEn: "A future standalone contest",
        date: windowText(Date.parse(begins), Date.parse(deadline)), enterTarget: route},
      {id: "new-lab", track: "research", title: "新实验赛", description: pendingCopy(),
        date: windowText(Date.parse("2026-02-31T00:00:00Z"), Date.parse("2026-02-21T00:00:00")), enterTarget: "competition/new-lab"},
      {id: "duplicate-hub", track: "research", title: "赛事中心条目", description: "", enterTarget: "competition/hub-alias"},
      {id: "foreign", track: "research", title: "Foreign", description: "", enterTarget: "https://foreign.example/competition/foreign"},
      {id: "traversal", track: "research", title: "Traversal", description: "", enterTarget: "questions/../competition/traversal"},
    `)}
  `;
  files.set(pageUrl.pathname, page(nextEntry));
  files.set(nextEntry, nextBundle + later);
  const snapshot = await readCompetitionNotices(client);
  assert.deepEqual(snapshot.items.filter((item) => item.source === 'overview'), [
    { source: 'overview', key: '["future-masters"]', titleZh: '未来大师赛', title: 'Future Masters',
      summaryZh: '未来的独立赛事', summary: 'A future standalone contest', startAt: '2026-12-01T20:00:00+08:00',
      endAt: '2026-12-04T20:00:00+08:00', webUrl: 'https://play.example/questions/future-masters', target: { kind: 'collection' } },
    { source: 'overview', key: '["season","new-lab"]', titleZh: '新实验赛', title: '新实验赛', webUrl: 'https://play.example/competition/new-lab', target: { kind: 'collection' } },
    { source: 'overview', key: '["season","hub-alias"]', titleZh: '赛事中心条目', title: '赛事中心条目', webUrl: 'https://play.example/competition/hub-alias', target: { kind: 'collection' } },
  ]);
  const hubCard = snapshot.items.find((item) => item.webUrl === 'https://play.example/competition/hub-alias');
  assert.equal(hubCard.source, 'hub');
  const withoutHub = await readCompetitionNotices({ ...client, noticeHub: async () => { throw Error('offline'); } });
  const staticCard = withoutHub.items.find((item) => item.webUrl === hubCard.webUrl);
  assert.equal(staticCard.source, 'overview');
  assert.equal(staticCard.key, hubCard.key);
  assert.deepEqual(requests, [firstEntry, nextEntry].flatMap((entry) => [pageUrl.href, new URL(entry, pageUrl).href]).concat(pageUrl.href));
});

test('a malformed or unavailable contest overview does not publish a snapshot and leaves schedule alerts available', async () => {
  const { reader, files } = fixture();
  const client = { baseUrl: pageUrl.origin, getCompetitionSchedules: (options) => reader.read(options),
    noticeSeasons: async () => [], noticeHub: async () => [] };
  const extra = '{id: "new", track: "new", title: "New", description: "", enterTarget: "questions/new"},';
  files.set(firstEntry, firstBundle + overviewSource(extra));
  assert.equal((await readCompetitionNotices(client)).items.find((item) => item.source === 'overview')?.title, 'New');

  files.set(pageUrl.pathname, page(nextEntry));
  for (const source of [
    '',
    overviewSource(extra) + overviewSource().replace('const stations', 'const otherStations').replaceAll('stations.map', 'otherStations.map')
      .replace('officialContestCards', 'anotherContestTable').replace('const unrelated', 'const anotherDecoy'),
    overviewSource(extra + extra),
    overviewSource(extra + '{id: "broken", track: "new", title: "Broken", description: ""},'),
    overviewSource(extra + '{id: computeId(), track: "new", title: "Broken", description: "", enterTarget: "questions/broken"},'),
  ]) {
    files.set(nextEntry, nextBundle + source);
    const snapshot = await readCompetitionNotices(client);
    assert.ok(!snapshot.sources.includes('overview'));
    assert.ok(!snapshot.items.some((item) => item.source === 'overview'));
    assert.ok(snapshot.items.some((item) => item.source === bohrProduct && item.titleZh.endsWith('第五期')));
  }

  files.set(nextEntry, nextBundle + overviewSource(extra));
  assert.ok((await readCompetitionNotices(client)).sources.includes('overview'));
  files.set(pageUrl.pathname, '<p>Unavailable</p>');
  assert.ok(!(await readCompetitionNotices(client)).sources.includes('overview'));
});

test('reads the published schedules in table order from one asset and coalesces concurrent checks', async () => {
  const { reader, requests } = fixture();
  const results = await Promise.all([reader.read({ revalidate: false }), reader.read()]);
  assert.deepEqual(results, [firstSchedules, firstSchedules]);
  assert.deepEqual(await reader.read({ revalidate: false }), firstSchedules);
  assert.deepEqual(await reader.read(), firstSchedules);
  assert.deepEqual(requests, [pageUrl.href, new URL(firstEntry, pageUrl).href, pageUrl.href]);
});

test('picks up new periods and updated track names from a new entry', async () => {
  const { reader, files, requests } = fixture();
  await reader.read();
  files.set(pageUrl.pathname, page(nextEntry));
  files.set(nextEntry, nextBundle);
  assert.deepEqual(await reader.read({ revalidate: false }), firstSchedules);
  assert.deepEqual(await reader.read(), nextSchedules);
  assert.deepEqual(await reader.read({ revalidate: false }), nextSchedules);
  files.set(pageUrl.pathname, page(firstEntry));
  assert.deepEqual(await reader.read(), firstSchedules);
  assert.deepEqual(requests, [firstEntry, nextEntry, firstEntry].flatMap((entry) =>
    [pageUrl.href, new URL(entry, pageUrl).href]));
});

test('rejects missing, foreign or ambiguous module advertisements', async () => {
  const { reader, files, requests } = fixture();
  const invalidPages = [
    `<script src="${firstEntry}"></script><script type=module data-src="${firstEntry}"></script>`,
    `<!--${page(firstEntry)}--><textarea>${page(firstEntry)}</textarea><div title='${page(firstEntry)}'></div>`,
    `<script 'type=module' src="${firstEntry}"></script>`,
    `<script type=module src="${firstEntry}" src="${nextEntry}"></script>`,
    page(`https://other.example${firstEntry}`),
    page(`https://user@play.example${firstEntry}`),
    page('/assets/no-extension'),
    page(firstEntry) + page(nextEntry),
  ];
  for (const html of invalidPages) {
    files.set(pageUrl.pathname, html);
    assert.deepEqual(await reader.read({ revalidate: false }), unavailableSchedules, html);
  }
  assert.deepEqual(requests, invalidPages.map(() => pageUrl.href));
});

test('keeps each last good snapshot through page and bundle failures, then recovers', async () => {
  const { reader, files } = fixture();
  await reader.read();
  const stale = {
    [bohrProduct]: { periods: fourPeriods, stale: true },
    [scientificFacilities]: { periods: facilitiesPeriods, stale: true },
    [pku]: { periods: pkuPeriods, stale: true },
  };
  files.set(pageUrl.pathname, '<p>Unavailable</p>');
  assert.deepEqual(await reader.read(), stale);
  assert.deepEqual(await reader.read({ revalidate: false }), stale);

  files.set(pageUrl.pathname, page(firstEntry));
  assert.deepEqual(await reader.read(), firstSchedules);
  files.set(pageUrl.pathname, page(nextEntry));
  assert.deepEqual(await reader.read(), stale);
  files.set(nextEntry, 'const broken = [');
  assert.deepEqual(await reader.read(), stale);
  files.set(nextEntry, nextBundle);
  assert.deepEqual(await reader.read(), nextSchedules);
});

test('keeps the whole Bohr schedule stale when its table fails and refreshes the other schedules', async () => {
  const { reader, files } = fixture();
  await reader.read();
  files.set(pageUrl.pathname, page(nextEntry));
  const original = bohrBundle();
  const invalidBundles = new Map([
    ['duplicate period', original.replace('slug: "2"', 'slug: "1"')],
    ['leading zero', original.replace('slug: "2"', 'slug: "02"')],
    ['non-ASCII slug', original.replace('slug: "2"', 'slug: "２"')],
    ['slug longer than 40 digits', original.replace('slug: "2"', `slug: "${'2'.repeat(41)}"`)],
    ['missing timezone', original.replace('2026-11-18T21:00:00+08:00', '2026-11-18T21:00:00')],
    ['inverted range', original.replace('2026-11-25T21:00:00+08:00', '2026-11-17T21:00:00+08:00')],
    ['different slot groups', original.replace('slots: makeSlots(fourthGroups, null)', 'slots: makeSlots(thirdGroups, null)')],
    ['invalid date', original.replace('T24:00:00', 'T24:01:00')],
    ['wrong mapped parameter', original.replace('challengeId: challenge', 'challengeId: index')],
    ['non-segment ID', original.replace('"read-a"', '"read/a"')],
    ['empty ID', original.replace('"search-z"', '""')],
    ['unresolved group data', original.replace('groups: fourthGroups', 'groups: missing')],
    ['wrong period projection', original.replace('slot => slot.challengeId', 'slot => slot.key')],
    ['second table', original + original.slice(original.indexOf('const deployedPeriods')).replace('deployedPeriods', 'duplicateTable')],
  ]);
  for (const [reason, source] of invalidBundles) {
    files.set(nextEntry, source + facilitiesBundle(true) + pkuBundle(true));
    assert.deepEqual(await reader.read(), {
      ...nextSchedules,
      [bohrProduct]: { periods: fourPeriods, stale: true },
    }, reason);
  }
  files.set(nextEntry, nextBundle);
  assert.deepEqual(await reader.read(), nextSchedules);
});

test('keeps the whole Scientific Facilities schedule stale when either table fails and refreshes the other schedules', async () => {
  const { reader, files } = fixture();
  await reader.read();
  files.set(pageUrl.pathname, page(nextEntry));
  const original = facilitiesBundle(true);
  const invalidBundles = new Map([
    ['absent question table', original.slice(0, original.indexOf('const xJ'))],
    ['absent period table', original.slice(original.indexOf('const hR'))],
    ['duplicate period', original.replace('key: "p2"', 'key: "p1"')],
    ['missing timezone', original.replace('2026-12-10T20:00:00+08:00', '2026-12-10T20:00:00')],
    ['inverted range', original.replace('2026-11-14T20:00:00+08:00', '2026-11-12T20:00:00+08:00')],
    ['invalid future date', original.replace('2026-12-10T20:00:00+08:00', '12')],
    ['missing future date field', original.replace('openAt: cV, ', '')],
    ['unresolved future date', original.replace('openAt: cV', 'openAt: unknown')],
    ['unknown question period', original.replace('period: "p2"', 'period: "p3"')],
    ['missing challenge ID', original.replace('challengeId: hR', 'unrelated: hR')],
    ['invalid challenge ID', original.replace('"facility-new"', '"not/a/segment"')],
    ['second period table', original + 'const another = [{key: "p1", name: {zh: "第一期"}, openAt: null, endAt: null}];'],
  ]);
  for (const [reason, source] of invalidBundles) {
    files.set(nextEntry, bohrBundle(true) + source + pkuBundle(true));
    assert.deepEqual(await reader.read(), {
      ...nextSchedules,
      [scientificFacilities]: { periods: facilitiesPeriods, stale: true },
    }, reason);
  }
  files.set(nextEntry, nextBundle);
  assert.deepEqual(await reader.read(), nextSchedules);
});

test('keeps the whole PKU schedule stale when either table fails and refreshes the other schedules', async () => {
  const { reader, files } = fixture();
  await reader.read();
  files.set(pageUrl.pathname, page(nextEntry));
  const original = pkuBundle(true);
  const invalidBundles = new Map([
    ['absent unit table', original.slice(0, original.indexOf('const dU'))],
    ['absent track table', original.replace('const hP = [', 'const hP = ignored([').replace('];\n    const dU', ']);\n    const dU')],
    ['missing unit ID', original.replace('id: "efficiency-3", ', '')],
    ['unsafe unit ID', original.replace('"efficiency-3"', '"../efficiency-3"')],
    ['duplicate unit ID', original.replace('"efficiency-3"', '"efficiency-1"')],
    ['unknown track', original.replace('track: "efficiency"', 'track: "unknown"')],
    ['missing timezone', original.replace('2026-11-27T20:00:00+08:00', '2026-11-27T20:00:00')],
    ['inverted date range', original.replace('2026-11-27T20:00:00+08:00', '2026-11-19T20:00:00+08:00')],
    ['invalid challenge ID', original.replace('"pku-writing-a"', '"not/a/segment"')],
  ]);
  for (const [reason, source] of invalidBundles) {
    files.set(nextEntry, bohrBundle(true) + facilitiesBundle(true) + source);
    assert.deepEqual(await reader.read(), {
      ...nextSchedules,
      [pku]: { periods: pkuPeriods, stale: true },
    }, reason);
  }
  files.set(nextEntry, nextBundle);
  assert.deepEqual(await reader.read(), nextSchedules);
});

test('loads on a cold cache-only read and returns the available schedules', async () => {
  const { reader, files, requests } = fixture();
  files.set(firstEntry, facilitiesBundle());
  const expected = { ...unavailableSchedules, [scientificFacilities]: firstSchedules[scientificFacilities] };
  assert.deepEqual(await reader.read({ revalidate: false }), expected);
  assert.deepEqual(await reader.read({ revalidate: false }), expected);
  assert.deepEqual(requests, [pageUrl.href, new URL(firstEntry, pageUrl).href]);

  files.set(firstEntry, firstBundle);
  assert.deepEqual(await reader.read(), firstSchedules);
});

test('passes an abort signal for the read deadline and returns a stale result on timeout', async () => {
  let aborted = false;
  const reader = createCompetitionSchedulesReader({
    baseUrl: pageUrl.origin,
    timeoutMs: 0,
    readText: (url, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(page(firstEntry)), 100);
      signal.addEventListener('abort', () => {
        aborted = true;
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    }),
  });
  assert.deepEqual(await reader.read(), unavailableSchedules);
  assert.equal(aborted, true);
});

test('explicit grouped slots control membership when they differ from group metadata, and keep the groups', async () => {
  const { reader, files } = fixture();
  files.set(firstEntry, firstBundle.replace('slots: makeSlots(fourthGroups, null)', 'slots: [{ challengeId: "search-z" }]'));
  const schedules = await reader.read();
  assert.equal(schedules[bohrProduct].stale, undefined);
  assert.deepEqual(schedules[bohrProduct].periods.at(-1),
    { ...fourPeriods[3], challengeIds: ['search-z'], groups: [{ key: 'search', challengeIds: ['search-z'] }] });
});

// The weekly contest's periods 3 and 4 as the website published them on 2026-11-23 (index-BBQAq2fa.js): group
// keys, Chinese and English names and challenge counts are the site's; the ids are made up and count down, so
// a sorted list would not match the official order.
const thirdTracks = [['reading', '文献阅读', 'Scientific Literature Reading', 10], ['writing', '学术写作', 'Academic Writing', 14],
  ['graphics', '科研绘图', 'Scientific Illustration and Visualization', 5], ['slides', '学术 PPT', 'Academic Presentations', 4]];
const fourthTracks = [['search', '文献检索', 'Literature Search', 11], ['reading', '文献阅读', 'Literature Reading', 14],
  ['writing', '学术写作', 'Academic Writing', 17], ['library', '资料管理', 'Research Library', 5],
  ['research', '深度研究与文献综述', 'Deep Research & Literature Review', 5], ['review', '学术审查', 'Academic Review', 5],
  ['analysis', '科研数据分析', 'Research Data Analysis', 6], ['graphics', '科研绘图', 'Scientific Graphics', 5],
  ['slides', '学术 PPT', 'Academic Slides', 4], ['experiment', '实验方案设计', 'Experimental Design', 5]];
const trackIds = (period, key, count) => Array.from({ length: count }, (_, index) => `p${period}-${key}-${String(count - index).padStart(2, '0')}`);
const trackNames = (tracks, language) => Object.fromEntries(tracks.map(([key, zh, en]) => [key, language === 'zh' ? zh : en]));
const weeklyCopy = {
  zh: { p3: { tracks: { ...trackNames(thirdTracks, 'zh'), bonus: '附加题' }, challengesTitle: '第三期赛题' },
    p4: { tracks: trackNames(fourthTracks, 'zh'), challengesTitle: '第四期赛题' } },
  en: { p3: { tracks: { ...trackNames(thirdTracks, 'en'), bonus: 'Bonus challenge' }, challengesTitle: 'Period 3 challenges' },
    p4: { tracks: trackNames(fourthTracks, 'en'), challengesTitle: 'Period 4 challenges' } },
};

function weeklyBundle({ copy = weeklyCopy, fourthGroups = fourthTracks.map(([key, , , count]) => ({ key, challengeIds: trackIds(4, key, count) })) } = {}) {
  const groups = (list) => `Object.freeze([${list.map(({ key, challengeIds }) =>
    `Object.freeze({key:${JSON.stringify(key)},challengeIds:${typeof challengeIds === 'string' ? challengeIds : `Object.freeze(${JSON.stringify(challengeIds)})`}})`).join(',')}])`;
  const third = thirdTracks.map(([key, , , count]) => ({ key, challengeIds: trackIds(3, key, count) }));
  return `
    const JT=${groups(third)},e2="p3-bonus",t2=${groups(fourthGroups)};
    function n2(e,n){return Object.freeze([...e.flatMap(a=>a.challengeIds.map((i,o)=>Object.freeze({key:\`\${a.key}-\${String(o+1).padStart(2,"0")}\`,challengeId:i,track:a.key}))),...n?[Object.freeze({key:"bonus",challengeId:n,track:null})]:[]])}
    const Ss=Object.freeze([{slug:"3",labelZh:"第三期",labelEn:"Period 3",seasonId:"2026-11-11",startAt:"2026-11-11T16:00:00+08:00",endAt:"2026-11-18T16:00:00+08:00",layout:"trackGroups",groups:JT,bonusId:e2,copy:"p3",liveBoard:!0,slots:n2(JT,e2)},{slug:"4",labelZh:"第四期",labelEn:"Period 4",seasonId:"2026-11-18",startAt:"2026-11-18T21:00:00+08:00",endAt:"2026-11-25T21:00:00+08:00",layout:"trackGroups",groups:t2,bonusId:null,copy:"p4",liveBoard:!1,slots:n2(t2,null)}].map(e=>Object.freeze({...e,challengeIds:Object.freeze(e.slots.map(n=>n.challengeId).filter(Boolean))})));
    const Wi=${JSON.stringify(copy)};
  `;
}

const namedGroups = (period, tracks) => tracks.map(([key, labelZh, labelEn, count]) => ({ key, labelZh, labelEn, challengeIds: trackIds(period, key, count) }));
const weeklyPeriods = [
  { slug: '3', labelZh: '第三期', startAt: '2026-11-11T16:00:00+08:00', endAt: '2026-11-18T16:00:00+08:00',
    challengeIds: [...namedGroups(3, thirdTracks).flatMap((group) => group.challengeIds), 'p3-bonus'],
    groups: [...namedGroups(3, thirdTracks), { key: 'bonus', labelZh: '附加题', labelEn: 'Bonus challenge', challengeIds: ['p3-bonus'] }] },
  { slug: '4', labelZh: '第四期', startAt: '2026-11-18T21:00:00+08:00', endAt: '2026-11-25T21:00:00+08:00',
    challengeIds: namedGroups(4, fourthTracks).flatMap((group) => group.challengeIds), groups: namedGroups(4, fourthTracks) },
];
const withoutNames = (periods, ...labels) => periods.map((period) => ({ ...period,
  groups: period.groups.map((group) => Object.fromEntries(Object.entries(group).filter(([key]) => !labels.includes(key)))) }));
const ungrouped = ({ groups, ...period }) => period;
// A fresh reader for each bundle: one reader parses an entry URL only once.
async function readBundle(bundle) {
  const { reader, files } = fixture();
  files.set(firstEntry, bundle);
  return reader.read();
}
// The real catalog over the schedules parsed from `bundle`; `reads` records every challenge detail read.
async function catalogOver(bundle) {
  const schedules = await readBundle(bundle);
  const reads = [];
  const { catalog } = createCatalog({ client: {
    baseUrl: `${pageUrl.origin}/api`, getCompetitionSchedules: async () => schedules, listCompetitions: async () => ({ items: [] }),
    getChallenge: async (id) => { reads.push(id); return { id, title: id }; },
  } });
  return { schedules, reads, query: (args) => catalog(args, { signal: new AbortController().signal }) };
}
const groupCounts = (result, competition, slug) => result.competitionTable.find((item) => item.id === competition)
  .periods.find((period) => period.slug === slug).groups?.map(({ key, count }) => [key, count]);

test('keeps the weekly contest\'s official groups, their order and names, and the shared bonus challenge last', async () => {
  const { periods, stale } = (await readBundle(weeklyBundle()))[bohrProduct];
  assert.equal(stale, undefined);
  assert.deepEqual(periods, weeklyPeriods);
  assert.deepEqual(periods.map((period) => [period.challengeIds.length, period.groups.length]), [[34, 5], [77, 10]]);
  assert.deepEqual(periods[1].groups.find((group) => group.key === 'graphics').challengeIds,
    ['p4-graphics-05', 'p4-graphics-04', 'p4-graphics-03', 'p4-graphics-02', 'p4-graphics-01']);
  assert.ok(periods.every((period) => Object.isFrozen(period.groups) &&
    period.groups.every((group) => Object.isFrozen(group) && Object.isFrozen(group.challengeIds))));
});

test('leaves weekly groups unnamed when their Chinese names cannot be told apart', async () => {
  const { library, ...withoutLibrary } = weeklyCopy.zh.p4.tracks;
  const cases = new Map([
    ['no page text', [{}, withoutNames(weeklyPeriods, 'labelZh', 'labelEn')]],
    ['only Chinese labels', [{ zh: weeklyCopy.zh }, withoutNames(weeklyPeriods, 'labelEn')]],
    ['only names without Han characters', [{ en: weeklyCopy.en }, withoutNames(weeklyPeriods, 'labelZh')]],
    ['two Chinese tables', [{ ...weeklyCopy, tw: weeklyCopy.zh }, withoutNames(weeklyPeriods, 'labelZh')]],
    ['a name missing', [{ ...weeklyCopy, zh: { ...weeklyCopy.zh, p4: { tracks: withoutLibrary } } }, [weeklyPeriods[0], {
      ...weeklyPeriods[1], groups: weeklyPeriods[1].groups.map(({ labelZh, ...group }) => (group.key === 'library' ? group : { ...group, labelZh })) }]]],
  ]);
  for (const [reason, [copy, expected]] of cases) {
    assert.deepEqual((await readBundle(weeklyBundle({ copy })))[bohrProduct], { periods: expected }, reason);
  }
});

test('leaves only the weekly group unnamed whose own Chinese name cannot be read', async () => {
  const searchUnnamed = [weeklyPeriods[0], { ...weeklyPeriods[1],
    groups: weeklyPeriods[1].groups.map(({ labelZh, ...group }) => (group.key === 'search' ? group : { ...group, labelZh })) }];
  for (const [reason, name] of [['not a literal', 'translate("文献检索")'], ['not a string', '42'], ['empty', '" "']]) {
    const bundle = weeklyBundle().replace('"search":"文献检索"', `"search":${name}`);
    assert.deepEqual((await readBundle(bundle))[bohrProduct], { periods: searchUnnamed }, reason);
  }
});

test('names the groups of every period from its own copy when periods share one', async () => {
  const later = (period, slug, labelZh, startAt, endAt) => ({ ...period, slug, labelZh, startAt, endAt });
  const bundle = weeklyBundle().replace('slots:n2(t2,null)}]', 'slots:n2(t2,null)},' +
    '{slug:"5",labelZh:"第五期",startAt:"2026-11-25T21:00:00+08:00",endAt:"2026-12-02T21:00:00+08:00",layout:"trackGroups",groups:t2,bonusId:null,copy:"p4",slots:n2(t2,null)},' +
    '{slug:"6",labelZh:"第六期",startAt:"2026-12-02T21:00:00+08:00",endAt:"2026-12-09T21:00:00+08:00",layout:"trackGroups",groups:JT,bonusId:e2,copy:"p3",slots:n2(JT,e2)}]');
  assert.deepEqual((await readBundle(bundle))[bohrProduct], { periods: [...weeklyPeriods,
    later(weeklyPeriods[1], '5', '第五期', '2026-11-25T21:00:00+08:00', '2026-12-02T21:00:00+08:00'),
    later(weeklyPeriods[0], '6', '第六期', '2026-12-02T21:00:00+08:00', '2026-12-09T21:00:00+08:00')] });
});

test('written-out weekly slots keep the official groups, limited to the challenges the slots list', async () => {
  const slots = (period, bonus) => JSON.stringify(period.groups.flatMap(({ key, challengeIds }) => (key === 'bonus'
    ? [{ key, challengeId: bonus, track: null }]
    : challengeIds.map((challengeId, index) => ({ key: `${key}-${String(index + 1).padStart(2, '0')}`, challengeId, track: key })))));
  const written = weeklyBundle().replace('slots:n2(JT,e2)', `slots:${slots(weeklyPeriods[0], 'p3-bonus')}`)
    .replace('slots:n2(t2,null)', `slots:${slots(weeklyPeriods[1])}`);
  const { schedules, reads, query } = await catalogOver(written);
  assert.deepEqual(schedules[bohrProduct], { periods: weeklyPeriods });
  const graphics = await query({ competition: bohrProduct, period: '4', group: 'graphics' });
  assert.deepEqual(graphics.challenges.items.map((item) => item.id), trackIds(4, 'graphics', 5));
  assert.deepEqual(reads, trackIds(4, 'graphics', 5));
  assert.deepEqual(groupCounts(graphics, bohrProduct, '4'), fourthTracks.map(([key, , , count]) => [key, count]));

  const withoutGraphics = weeklyBundle().replace('slots:n2(t2,null)',
    `slots:${slots({ groups: weeklyPeriods[1].groups.filter((group) => group.key !== 'graphics') })}`);
  const fourth = (await readBundle(withoutGraphics))[bohrProduct].periods[1];
  assert.equal(fourth.challengeIds.length, 72);
  assert.deepEqual(fourth.groups.map(({ key, challengeIds }) => [key, challengeIds.length]),
    fourthTracks.map(([key, , , count]) => [key, key === 'graphics' ? 0 : count]));

  const unreadableGroups = written.replace('groups:t2,', 'groups:unknownGroups,');
  assert.deepEqual((await readBundle(unreadableGroups))[bohrProduct], { periods: [weeklyPeriods[0], ungrouped(weeklyPeriods[1])] });
});

test('keeps each challenge once in a period and in a group, while one challenge can sit in two groups', async () => {
  const official = weeklyPeriods[1].groups;
  const search = official[0].challengeIds;
  const listedTwice = search[0];
  const fourthGroups = official.map(({ key, challengeIds }) => ({ key,
    challengeIds: { search: [listedTwice, ...challengeIds], reading: [...challengeIds, listedTwice] }[key] ?? challengeIds }));
  const { schedules, reads, query } = await catalogOver(weeklyBundle({ fourthGroups }));
  const fourth = schedules[bohrProduct].periods[1];
  assert.deepEqual(fourth.challengeIds, weeklyPeriods[1].challengeIds);
  assert.deepEqual(fourth.groups.map((group) => group.challengeIds),
    official.map(({ key, challengeIds }) => (key === 'reading' ? [...challengeIds, listedTwice] : challengeIds)));

  const page = await query({ competition: bohrProduct, period: '4', group: 'search', per_page: 2 });
  assert.deepEqual(reads, search, 'each challenge of the group is read once');
  assert.deepEqual(page.challenges.items.map((item) => item.id), search.slice(0, 2));
  assert.equal(page.challenges.total, 11);
  assert.deepEqual(groupCounts(page, bohrProduct, '4').slice(0, 2), [['search', 11], ['reading', 15]]);
  reads.length = 0;
  assert.equal((await query({ competition: bohrProduct, period: '4' })).challenges.total, 77);
  assert.equal(reads.length, 77);
});

test('a fresh schedule whose grouping cannot be read answers group_not_available and still lists the whole period', async () => {
  const fourthGroups = weeklyPeriods[1].groups.map((group) => (group.key === 'search' ? { ...group, key: 'reading' } : group));
  const { schedules, reads, query } = await catalogOver(weeklyBundle({ fourthGroups }));
  assert.equal(schedules[bohrProduct].stale, undefined);
  const graphics = await query({ competition: bohrProduct, period: '4', group: 'graphics' });
  assert.deepEqual([graphics.error?.code, graphics.error?.reason], ['invalid_argument', 'group_not_available']);
  assert.deepEqual(reads, []);
  const whole = await query({ competition: bohrProduct, period: '4' });
  assert.equal(whole.challenges.total, 77);
  assert.equal(groupCounts(whole, bohrProduct, '4'), undefined);
});

test('lists a weekly period ungrouped when its group keys cannot be chosen by key', async () => {
  const groups = weeklyPeriods[1].groups;
  for (const [reason, key] of [['duplicate key', 'search'], ['not a group key', '科研 绘图'], ['missing key', undefined]]) {
    const fourthGroups = groups.map((group, index) => (index === 1 ? { ...group, key } : group));
    assert.deepEqual((await readBundle(weeklyBundle({ fourthGroups })))[bohrProduct],
      { periods: [weeklyPeriods[0], ungrouped(weeklyPeriods[1])] }, reason);
  }
});

test('keeps the last good weekly groups when the grouped table stops parsing', async () => {
  const { reader, files } = fixture();
  files.set(firstEntry, weeklyBundle());
  await reader.read();
  files.set(pageUrl.pathname, page(nextEntry));
  const broken = fourthTracks.map(([key, , , count]) => ({ key, challengeIds: key === 'graphics' ? 'unresolvedIds' : trackIds(4, key, count) }));
  files.set(nextEntry, weeklyBundle({ fourthGroups: broken }));
  assert.deepEqual((await reader.read())[bohrProduct], { periods: weeklyPeriods, stale: true });
  files.set(nextEntry, weeklyBundle());
  assert.deepEqual((await reader.read())[bohrProduct], { periods: weeklyPeriods });
});

test('groups Scientific Facilities periods by the website\'s research directions and PKU units by their own groups', async () => {
  const directions = `
    const cg = [
      {key: "imaging", sources: ["imaging"], title: {zh: "成像与结构重建", en: "Imaging"}, summary: {zh: "成像", en: "Imaging"}},
      {key: "unused", sources: ["fib"], title: {zh: "未出题方向", en: "Unused"}, summary: {zh: "无", en: "None"}},
      {key: "microscopy", sources: ["fib"], title: {zh: "显微", en: "Microscopy"}, summary: {zh: "显微", en: "Microscopy"}},
    ];
  `;
  const facilities = facilitiesBundle(true) + directions;
  const schedules = await readBundle(bohrBundle(true) + facilities + pkuBundle(true));
  const grouped = [
    { ...publishedFacilitiesPeriods[0], groups: [{ key: 'imaging', labelZh: '成像与结构重建', labelEn: 'Imaging', challengeIds: ['facility-a'] },
      { key: 'microscopy', labelZh: '显微', labelEn: 'Microscopy', challengeIds: ['facility-z'] }] },
    { ...publishedFacilitiesPeriods[1], groups: [{ key: 'imaging', labelZh: '成像与结构重建', labelEn: 'Imaging', challengeIds: ['facility-future'] },
      { key: 'microscopy', labelZh: '显微', labelEn: 'Microscopy', challengeIds: ['facility-new'] }] },
  ];
  assert.deepEqual(schedules[scientificFacilities], { periods: grouped });
  assert.deepEqual(schedules[pku], nextSchedules[pku]);

  const { query } = await catalogOver(bohrBundle(true) + facilities + pkuBundle(true));
  const page = await query({ competition: scientificFacilities });
  const groups = page.competitionTable.find((item) => item.id === scientificFacilities).periods[0].groups;
  assert.deepEqual(groups.find((group) => group.key === 'microscopy'), { key: 'microscopy', labelZh: '显微', labelEn: 'Microscopy', count: 1 });
  const academicRound = page.competitionTable.find((item) => item.id === pku).periods.find((period) => period.slug === 'efficiency-3');
  assert.equal(academicRound.labelEn, 'Research Productivity · Round 3');
  const chineseOnly = pkuBundle(true).replace(', en: "Research Productivity"', '').replace(', en: "Round 3"', '');
  const fallback = (await readBundle(bohrBundle(true) + facilities + chineseOnly))[pku].periods;
  assert.equal(fallback.find((period) => period.slug === 'efficiency-3').labelEn, undefined);
  assert.equal(fallback.find((period) => period.slug === 'efficiency-1').labelEn, '学术效率赛道 · Round 1');

  for (const [reason, title, labels] of [
    ['title not a record', 'title: "显微"', {}], ['no title', 'heading: {zh: "显微", en: "Microscopy"}', {}],
    ['no Chinese title', 'title: {en: "Microscopy"}', { labelEn: 'Microscopy' }],
    ['no English title', 'title: {zh: "显微"}', { labelZh: '显微' }],
  ]) {
    const source = facilities.replace('title: {zh: "显微", en: "Microscopy"}', title);
    const expected = grouped.map((period) => ({ ...period, groups: period.groups.map((group) =>
      group.key === 'microscopy' ? { key: group.key, challengeIds: group.challengeIds, ...labels } : group) }));
    assert.deepEqual((await readBundle(bohrBundle(true) + source + pkuBundle(true)))[scientificFacilities],
      { periods: expected }, reason);
  }
  // An unreadable grouping leaves the periods listed, ungrouped.
  const twoTables = facilities + directions.replace('const cg', 'const copy');
  assert.deepEqual((await readBundle(bohrBundle(true) + twoTables + pkuBundle(true)))[scientificFacilities],
    { periods: publishedFacilitiesPeriods });
  const unreadableUnit = pkuBundle(true).replace('{key: "writing", title: {zh: "写作", en: "Writing"}}', 'unknownGroup');
  assert.deepEqual((await readBundle(bohrBundle(true) + facilities + unreadableUnit))[pku],
    { periods: [...extendedPkuPeriods.slice(0, 2), ungrouped(extendedPkuPeriods[2])] });
});
