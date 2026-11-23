import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCompetitionSchedulesReader } from '../lib/competition-schedules.js';

const pageUrl = new URL('https://play.example/competition/bohr-product');
const firstEntry = '/assets/index-AbCd1234.js';
const nextEntry = '/assets/weekly-Q7v8X_9z.js';
const page = (entry) => `<!doctype html><head><script crossorigin SRC="${entry}" type=module></script></head>`;
const bohrProduct = 'bohr-product';
const scientificFacilities = 'scientific-facilities';
const pku = 'pku';
const unavailable = { periods: undefined, stale: true };

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
  { slug: 'science-1', labelZh: '科学挑战 · 第一期', startAt: '2026-11-06T20:00:00+08:00', endAt: '2026-11-07T20:00:00+08:00',
    challengeIds: ['pku-science-z', 'pku-science-a'] },
  { slug: 'efficiency-1', labelZh: '学术效率 · 第一期', startAt: '2026-11-06T20:00:00+08:00', endAt: '2026-11-13T20:00:00+08:00',
    challengeIds: ['pku-product'] },
];
const extendedPkuPeriods = [pkuPeriods[0], { ...pkuPeriods[1], labelZh: '学术效率赛道 · 第一期' }, {
  slug: 'efficiency-3', labelZh: '学术效率赛道 · 第三期', startAt: '2026-11-20T20:00:00+08:00', endAt: '2026-11-27T20:00:00+08:00',
  challengeIds: ['pku-slides-z', 'pku-writing-a'],
  groups: [{ key: 'writing', labelZh: '写作', challengeIds: ['pku-writing-a'] }, { key: 'slides', labelZh: '幻灯片', challengeIds: ['pku-slides-z'] }],
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

test('explicit grouped slots control membership when they differ from group metadata', async () => {
  const { reader, files } = fixture();
  files.set(firstEntry, firstBundle.replace('slots: makeSlots(fourthGroups, null)', 'slots: [{ challengeId: "search-z" }]'));
  const schedules = await reader.read();
  assert.equal(schedules[bohrProduct].stale, undefined);
  assert.deepEqual(schedules[bohrProduct].periods.at(-1).challengeIds, ['search-z']);
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

const namedGroups = (period, tracks) => tracks.map(([key, labelZh, , count]) => ({ key, labelZh, challengeIds: trackIds(period, key, count) }));
const weeklyPeriods = [
  { slug: '3', labelZh: '第三期', startAt: '2026-11-11T16:00:00+08:00', endAt: '2026-11-18T16:00:00+08:00',
    challengeIds: [...namedGroups(3, thirdTracks).flatMap((group) => group.challengeIds), 'p3-bonus'],
    groups: [...namedGroups(3, thirdTracks), { key: 'bonus', labelZh: '附加题', challengeIds: ['p3-bonus'] }] },
  { slug: '4', labelZh: '第四期', startAt: '2026-11-18T21:00:00+08:00', endAt: '2026-11-25T21:00:00+08:00',
    challengeIds: namedGroups(4, fourthTracks).flatMap((group) => group.challengeIds), groups: namedGroups(4, fourthTracks) },
];
const unnamed = (periods) => periods.map((period) => ({ ...period, groups: period.groups.map(({ labelZh, ...group }) => group) }));
const ungrouped = ({ groups, ...period }) => period;
// A fresh reader for each bundle: one reader parses an entry URL only once.
async function readBundle(bundle) {
  const { reader, files } = fixture();
  files.set(firstEntry, bundle);
  return reader.read();
}

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
    ['no page text', [{}, unnamed(weeklyPeriods)]],
    ['only names without Han characters', [{ en: weeklyCopy.en }, unnamed(weeklyPeriods)]],
    ['two Chinese tables', [{ ...weeklyCopy, tw: weeklyCopy.zh }, unnamed(weeklyPeriods)]],
    ['a name missing', [{ ...weeklyCopy, zh: { ...weeklyCopy.zh, p4: { tracks: withoutLibrary } } }, [weeklyPeriods[0], {
      ...weeklyPeriods[1], groups: weeklyPeriods[1].groups.map(({ labelZh, ...group }) => (group.key === 'library' ? group : { ...group, labelZh })) }]]],
  ]);
  for (const [reason, [copy, expected]] of cases) {
    assert.deepEqual((await readBundle(weeklyBundle({ copy })))[bohrProduct], { periods: expected }, reason);
  }
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
  assert.deepEqual(schedules[scientificFacilities], { periods: [
    { ...publishedFacilitiesPeriods[0], groups: [{ key: 'imaging', labelZh: '成像与结构重建', challengeIds: ['facility-a'] },
      { key: 'microscopy', labelZh: '显微', challengeIds: ['facility-z'] }] },
    { ...publishedFacilitiesPeriods[1], groups: [{ key: 'imaging', labelZh: '成像与结构重建', challengeIds: ['facility-future'] },
      { key: 'microscopy', labelZh: '显微', challengeIds: ['facility-new'] }] },
  ] });
  assert.deepEqual(schedules[pku], nextSchedules[pku]);

  // An unreadable grouping leaves the periods listed, ungrouped.
  for (const [reason, source] of [
    ['direction without a title record', facilities.replace('title: {zh: "显微", en: "Microscopy"}', 'title: "显微"')],
    ['two direction tables', facilities + directions.replace('const cg', 'const copy')],
  ]) {
    assert.deepEqual((await readBundle(bohrBundle(true) + source + pkuBundle(true)))[scientificFacilities],
      { periods: publishedFacilitiesPeriods }, reason);
  }
  const unreadableUnit = pkuBundle(true).replace('{key: "writing", title: {zh: "写作", en: "Writing"}}', 'unknownGroup');
  assert.deepEqual((await readBundle(bohrBundle(true) + facilities + unreadableUnit))[pku],
    { periods: [...extendedPkuPeriods.slice(0, 2), ungrouped(extendedPkuPeriods[2])] });
});
