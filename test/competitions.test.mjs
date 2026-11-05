import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPETITION_IDS, COMPETITIONS, competitionDateText, competitionList, competitionPeriodSlugs, competitionSelection, competitionStatus,
  competitionTimeText, defaultPeriod, findCompetition,
} from '../lib/competitions.js';
import { publicPageUrl } from '../lib/links.js';

const at = (text) => Date.parse(text);
// 玻尔产品周赛 as the website lists it (/challenges?contest=bohr-product&period=<slug>), in its order.
const PERIOD_1 = ['skill-13890f6a', 'ai-github-98fdb6f0', 'ai-635bc8b5'];
const PERIOD_2 = ['product-arena-08-3027d350', 'product-arena-01-5a9928c1', 'product-arena-06-6d8cf72b', 'product-arena-09-0e8befd4',
  'product-arena-10-760d1a0b', 'product-arena-02-7051d92d', 'product-arena-03-429cc14d', 'product-arena-04-4b82ad21',
  'product-arena-05-64faa4a2', 'product-arena-07-865de7e4'];

test('the built-in table is well formed', () => {
  assert.deepEqual(COMPETITION_IDS, ['bohr-product', 'light-chasing', 'pku', 'llm-deploy', 'dpa-deploy', 'harness', 'agent',
    'science-reliability', 'knight-s4', 'paper2arm-s3', 'paper2arm-s2', 'paper2arm-s1']);
  assert.equal(new Set(COMPETITION_IDS).size, COMPETITIONS.length);
  assert.equal(new Set(COMPETITIONS.map((item) => item.nameZh)).size, COMPETITIONS.length, 'names differ, including the three hackathons');
  for (const item of COMPETITIONS) {
    assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(item.nameZh, `${item.id} has a Chinese name`);
    assert.match(item.pagePath, /^(?:competition|hackathon-s)[a-z0-9/-]+$/, `${item.id} page path is relative`);
    const { tag, season, challengeIds } = item.select;
    assert.ok(tag || season || challengeIds?.length || item.periods?.length, `${item.id} selects its challenges`);
    if (season) assert.ok(!tag && !challengeIds, `${item.id} selects by season only`);
    // An entry with periods selects only through its periods' fixed ids.
    if (item.periods) assert.deepEqual(item.select, {}, `${item.id} has no tag, season or ids besides its periods`);
    for (const ids of [challengeIds, ...(item.periods || []).map((period) => period.challengeIds)]) {
      if (!ids) continue;
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(ids.every((id) => typeof id === 'string' && id.trim() === id && id));
    }
    for (const period of item.periods || []) {
      assert.match(period.slug, /^[A-Za-z0-9_-]+$/, `${item.id} period slug is a plain word`);
      assert.ok(period.labelZh && Number.isFinite(at(period.startAt)) && Number.isFinite(at(period.endAt)) && at(period.startAt) < at(period.endAt));
      assert.ok(Object.isFrozen(period) && Object.isFrozen(period.challengeIds));
    }
    if (item.periods) assert.equal(new Set(item.periods.map((period) => period.slug)).size, item.periods.length);
    const start = item.startAt === undefined ? undefined : at(item.startAt);
    const end = item.endAt === undefined ? undefined : at(item.endAt);
    for (const value of [start, end]) assert.ok(value === undefined || Number.isFinite(value), `${item.id} dates parse`);
    if (start !== undefined && end !== undefined) assert.ok(start < end, `${item.id} starts before it ends`);
  }
  assert.ok(Object.isFrozen(COMPETITIONS) && Object.isFrozen(COMPETITIONS[0]) && Object.isFrozen(COMPETITIONS[0].select));
});

test('the table selects challenges the way the website does', () => {
  assert.deepEqual(competitionSelection('light-chasing'), { tag: '追光者计划·招募赛' });
  assert.deepEqual(competitionSelection('knight-s4'), { season: 's4' });
  assert.deepEqual(competitionSelection('paper2arm-s1'), { season: 's1' });
  assert.deepEqual(competitionSelection('bohr-product'), { challengeIds: [...PERIOD_1, ...PERIOD_2] });
  assert.deepEqual(competitionSelection('harness').challengeIds, ['biomaster-harness-optimization-4f6eec24', 'harness-45c4688b']);
  assert.deepEqual(competitionSelection('agent').challengeIds, ['agent-optimization-v1']);
  assert.deepEqual(competitionSelection('science-reliability').challengeIds, ['scimaster-harness-arena-0ece77a4']);
  // Both rounds of the website's arena list; the second one (v2) is closed but still listed.
  assert.deepEqual(competitionSelection('llm-deploy').challengeIds, ['llm-challenge-arena-v1', 'llm-challenge-arena-v2']);
  const fixed = COMPETITIONS.flatMap((item) => [...(item.select.challengeIds || []), ...(item.periods || []).flatMap((period) => period.challengeIds)]);
  assert.equal(fixed.length, 23, 'the DPA id is listed twice (DPA deploy and the PKU zone)');
  assert.equal(new Set(fixed).size, 22);
  assert.deepEqual(competitionSelection('dpa-deploy').challengeIds, ['optimize-the-complete-dpa4c-nano-lammps-md-step-ac-6a1e56aa']);
  assert.equal(competitionSelection('pku').challengeIds.length, 3);
  for (const unknown of ['', 'nope', 'BOHR-PRODUCT', 's4', undefined, null, 4, {}]) assert.equal(competitionSelection(unknown), undefined);
  // The returned ids are a copy: changing them cannot change the table.
  competitionSelection('agent').challengeIds.push('x');
  assert.deepEqual(findCompetition('agent').select.challengeIds, ['agent-optimization-v1']);
});

test('competitionStatus follows start and end at a fixed time', () => {
  const window = { startAt: '2026-10-10T20:00:00+08:00', endAt: '2026-10-11T20:00:00+08:00' };
  const status = (item, now) => competitionStatus(item, at(now));
  assert.equal(status(window, '2026-10-10T11:59:59Z'), 'upcoming');
  assert.equal(status(window, '2026-10-10T12:00:00Z'), 'live', 'the start instant is live');
  assert.equal(status(window, '2026-10-11T11:59:59Z'), 'live');
  assert.equal(status(window, '2026-10-11T12:00:00Z'), 'ended', 'the end instant is ended');
  assert.equal(status(window, '2030-01-01T00:00:00Z'), 'ended');
  // Start only: live for good once started. No dates: schedule pending. End only: live until it.
  assert.equal(status({ startAt: '2026-10-21T16:00:00+08:00' }, '2026-10-21T07:59:59Z'), 'upcoming');
  assert.equal(status({ startAt: '2026-10-21T16:00:00+08:00' }, '2026-10-21T08:00:00Z'), 'live');
  assert.equal(status({ startAt: '2026-10-21T16:00:00+08:00' }, '2099-01-01T00:00:00Z'), 'live');
  assert.equal(status({}, '2099-01-01T00:00:00Z'), 'upcoming');
  assert.equal(status({ endAt: '2026-10-21T00:00:00Z' }, '2026-10-20T00:00:00Z'), 'live');
  assert.equal(status({ endAt: '2026-10-21T00:00:00Z' }, '2026-10-21T00:00:00Z'), 'ended');
  // Unparseable dates count as absent; a Date works as `now`.
  assert.equal(status({ startAt: 'soon', endAt: '' }, '2026-10-21T00:00:00Z'), 'upcoming');
  assert.equal(competitionStatus(window, new Date('2026-10-10T13:00:00Z')), 'live');
  // "24:00" is the end of that day, as the website writes the end of the first product-contest period.
  assert.equal(status({ startAt: '2026-10-21T16:00:00+08:00', endAt: '2026-11-03T24:00:00+08:00' }, '2026-11-03T15:59:59Z'), 'live');
  assert.equal(status({ startAt: '2026-10-21T16:00:00+08:00', endAt: '2026-11-03T24:00:00+08:00' }, '2026-11-03T16:00:00Z'), 'ended');
});

test('table statuses at one fixed time', () => {
  const now = at('2026-11-02T12:00:00Z');
  const statuses = Object.fromEntries(COMPETITIONS.map((item) => [item.id, competitionStatus(item, now)]));
  assert.deepEqual(statuses, {
    'bohr-product': 'live', 'light-chasing': 'ended', pku: 'upcoming', 'llm-deploy': 'live', 'dpa-deploy': 'live', harness: 'live',
    agent: 'live', 'science-reliability': 'live', 'knight-s4': 'live', 'paper2arm-s3': 'ended', 'paper2arm-s2': 'ended', 'paper2arm-s1': 'ended',
  });
  // Before the website launched them, the later contests are not live yet.
  const early = at('2026-09-19T00:00:00Z');
  assert.deepEqual(COMPETITIONS.filter((item) => competitionStatus(item, early) === 'live').map((item) => item.id),
    ['llm-deploy', 'knight-s4']);
});

test('dates are shown as written; a time of day only with +08:00', () => {
  const find = (id) => findCompetition(id);
  assert.equal(competitionDateText(find('light-chasing')), '2026.10.10 — 2026.10.11');
  assert.equal(competitionTimeText(find('light-chasing')), '2026.10.10 20:00 — 2026.10.11 20:00');
  assert.equal(competitionDateText(find('bohr-product')), '2026.10.21 起');
  assert.equal(competitionTimeText(find('bohr-product')), '2026.10.21 16:00 起');
  assert.equal(competitionDateText(find('pku')), '日期待定');
  assert.equal(competitionTimeText(find('pku')), '日期待定');
  // Z times are not Beijing clock times (s1 ran 13:00 to 17:00 there), so the season shows its date only.
  assert.equal(competitionDateText(find('paper2arm-s1')), '2026.04.17', 'one day collapses to one date');
  assert.equal(competitionTimeText(find('paper2arm-s1')), '2026.04.17', 'no time of day for a Z string');
  // s4 reads as on the website: its end is 2027.01.31, not 2027.02.01 in UTC+8, and no clock time is shown.
  assert.equal(competitionDateText(find('knight-s4')), '2026.07.27 — 2027.01.31');
  assert.equal(competitionTimeText(find('knight-s4')), '2026.07.27 — 2027.01.31');
  // The live API writes +00:00; it keeps the written dates and shows no time of day either.
  const api = { startAt: '2026-07-27T00:00:00+00:00', endAt: '2027-01-31T23:59:59+00:00' };
  assert.equal(competitionTimeText(api), '2026.07.27 — 2027.01.31');
  assert.equal(competitionTimeText({ startAt: '2026-04-17T05:00:00+00:00', endAt: '2026-04-17T09:00:00+00:00' }), '2026.04.17');
  assert.equal(competitionTimeText({ startAt: '2026-04-17T05:00:00-05:00' }), '2026.04.17 起');
  assert.equal(competitionTimeText({ startAt: '2026-04-17T05:00:00' }), '2026.04.17 起', 'no offset: date only');
  assert.equal(competitionDateText({ endAt: '2026-10-21T00:00:00Z' }), '至 2026.10.21');
  // An explicit +08:00 keeps its written value, even where the UTC date is a day earlier, with or without
  // seconds, fractions or the colon in the offset.
  assert.equal(competitionTimeText({ startAt: '2026-09-18T00:00:00+08:00' }), '2026.09.18 00:00 起');
  assert.equal(competitionTimeText({ startAt: '2026-09-18T00:00+08:00' }), '2026.09.18 00:00 起');
  assert.equal(competitionTimeText({ startAt: '2026-09-18T07:30:00.000+08:00' }), '2026.09.18 07:30 起');
  assert.equal(competitionTimeText({ startAt: '2026-09-18T07:30:00+0800' }), '2026.09.18 07:30 起');
  // Mixed offsets: each end keeps its own rule.
  assert.equal(competitionTimeText({ startAt: '2026-09-18T20:00:00+08:00', endAt: '2026-09-19T12:00:00Z' }), '2026.09.18 20:00 — 2026.09.19');
  // A bare date has no time of day; a parseable non-ISO string gives its UTC+8 date; an unparseable one is absent.
  assert.equal(competitionTimeText({ startAt: '2026-09-18' }), '2026.09.18 起');
  assert.equal(competitionTimeText({ startAt: 'Tue, 01 Dec 2026 20:00:00 GMT' }), '2026.12.02 起');
  assert.equal(competitionTimeText({ startAt: 'soon', endAt: '2026-13-45' }), '日期待定');
  // Padded strings parse like their trimmed value.
  assert.equal(competitionTimeText({ startAt: ' 2026-10-10T20:00:00+08:00 ', endAt: '\t2026-10-11T20:00:00+08:00\n' }), '2026.10.10 20:00 — 2026.10.11 20:00');
  assert.equal(competitionDateText({ startAt: ' 2026-07-27T08:00:00Z ' }), '2026.07.27 起');
  assert.equal(competitionStatus({ startAt: ' 2026-07-27T08:00:00Z ' }, at('2026-07-27T08:00:00Z')), 'live');
  assert.equal(competitionStatus({ startAt: ' 2026-07-27T08:00:00Z ' }, at('2026-07-27T07:59:59Z')), 'upcoming');
  // Status still compares real instants: the written 23:59 with +00:00 is 07:59 the next day in UTC+8.
  assert.equal(competitionStatus(api, at('2027-01-31T23:59:58Z')), 'live');
  assert.equal(competitionStatus(api, at('2027-01-31T23:59:59Z')), 'ended');
  assert.equal(competitionStatus({ startAt: '2026-09-18T00:00:00+08:00' }, at('2026-09-17T16:00:00Z')), 'live');
});

test('competitionList computes status now, groups live first and keeps API seasons the table lacks', () => {
  const now = at('2026-11-02T12:00:00Z');
  const season = (slug, fields) => ({ slug, name: 'Season', ...fields });
  const seasons = [
    season('s1', { status: 'ended' }), season('s2', { status: 'ended' }), season('s3', { status: 'ended' }),
    season('s4', { status: 'active', startAt: '2026-07-27T00:00:00Z', endAt: '2027-01-31T23:59:59Z' }),
    season('s5', { name: 'Spring Cup', nameZh: '春季赛', seasonLabel: '第五季', status: 'upcoming', startAt: '2026-12-01T00:00:00Z', endAt: '2026-12-08T00:00:00Z' }),
  ];
  const items = competitionList({ seasons, now });
  assert.deepEqual(items.map((item) => `${item.status}:${item.id}`), [
    'live:science-reliability', 'live:bohr-product', 'live:agent', 'live:harness', 'live:dpa-deploy', 'live:llm-deploy', 'live:knight-s4',
    'upcoming:season:s5', 'upcoming:pku',
    'ended:light-chasing', 'ended:paper2arm-s3', 'ended:paper2arm-s2', 'ended:paper2arm-s1',
  ]);
  // s1-s4 are in the table, so only s5 is added from the API.
  assert.equal(items.filter((item) => item.kind === 'season').length, 1);
  const extra = items.find((item) => item.id === 'season:s5');
  assert.deepEqual(extra, { id: 'season:s5', kind: 'season', season: 's5', nameZh: '春季赛 · 第五季', name: 'Spring Cup', status: 'upcoming',
    startAt: '2026-12-01T00:00:00Z', endAt: '2026-12-08T00:00:00Z', dateText: '2026.12.01 — 2026.12.08',
    timeText: '2026.12.01 — 2026.12.08', pagePath: 'hackathon-s5' });
  const bohr = items.find((item) => item.id === 'bohr-product');
  assert.equal(bohr.rounds, '第一期 10.21 16:00 — 11.03 24:00 · 第二期 11.04 16:00 — 11.11 16:00');
  assert.equal(bohr.pagePath, 'competition/bohr-product');
  assert.equal(bohr.nameZh, '玻尔产品周赛');
  assert.equal(bohr.name, 'Bohrium Product Weekly Contest');
  assert.match(items.find((item) => item.id === 'harness').rounds, /第二季 10\.30 20:00 起/);
  assert.equal('rounds' in items.find((item) => item.id === 'dpa-deploy'), false);
  // Statuses move with the clock.
  assert.equal(competitionList({ seasons, now: at('2026-09-01T00:00:00Z') }).find((item) => item.id === 'harness').status, 'upcoming');
  // Without any API data the table alone is listed.
  assert.equal(competitionList({ now }).length, COMPETITIONS.length);
  assert.equal(competitionList({ seasons: 'bad', now }).length, COMPETITIONS.length);
  assert.equal(competitionList({ seasons: [null, {}, { slug: 5 }], now }).length, COMPETITIONS.length);
});

test('a season the table holds takes its dates and status from the API when the API lists it', () => {
  const now = at('2026-11-02T12:00:00Z');
  const knight = (seasons) => competitionList({ seasons, now }).find((item) => item.id === 'knight-s4');
  assert.equal(knight([]).status, 'live');
  const ended = knight([{ slug: 's4', status: 'ended', startAt: '2026-07-27T00:00:00Z', endAt: '2026-10-01T00:00:00Z' }]);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.endAt, '2026-10-01T00:00:00Z');
  assert.equal(ended.dateText, '2026.07.27 — 2026.10.01');
  // The API says active even though its end has passed: the date wins, as on the website.
  assert.equal(knight([{ slug: 's4', status: 'active', endAt: '2026-10-01T00:00:00Z' }]).status, 'ended');
});

test('an API season without dates is judged by its own status', () => {
  const now = at('2026-11-02T12:00:00Z');
  const status = (fields) => competitionList({ seasons: [{ slug: 's9', ...fields }], now }).find((item) => item.id === 'season:s9');
  assert.equal(status({ status: 'active' }).status, 'live');
  assert.equal(status({ status: 'ended' }).status, 'ended');
  assert.equal(status({}).status, 'upcoming');
  assert.equal(status({}).nameZh, 's9');
  assert.equal(status({}).dateText, '日期待定');
});

test('an API season gets a page path only for a plain slug', () => {
  const now = at('2026-11-02T12:00:00Z');
  const seasons = ['s6', 'spring_2027-A', 'a/b', '../admin', 's 7', '%2F', 'é'].map((slug) => ({ slug, status: 'active' }));
  const extra = competitionList({ seasons, now }).filter((item) => item.kind === 'season');
  assert.deepEqual(extra.map((item) => [item.season, item.pagePath]), [
    ['s6', 'hackathon-s6'], ['spring_2027-A', 'hackathon-spring_2027-A'],
    ['a/b', undefined], ['../admin', undefined], ['s 7', undefined], ['%2F', undefined], ['é', undefined]]);
  assert.ok(extra.filter((item) => item.pagePath === undefined).every((item) => !('pagePath' in item)));
});

test('publicPageUrl joins the web root and a page path', () => {
  assert.equal(publicPageUrl('https://play.bohrium.com/api', 'competition/bohr-product'), 'https://play.bohrium.com/competition/bohr-product');
  assert.equal(publicPageUrl('https://user:secret@play.bohrium.com/api/', '/challenges'), 'https://play.bohrium.com/challenges');
  assert.equal(publicPageUrl('http://127.0.0.1:15000/api', 'hackathon-s a'), 'http://127.0.0.1:15000/hackathon-s%20a');
});

test('publicPageUrl adds a query string after the encoded path', () => {
  assert.equal(publicPageUrl('https://play.bohrium.com/api', 'competition/bohr-product', { period: '2' }),
    'https://play.bohrium.com/competition/bohr-product?period=2');
  assert.equal(publicPageUrl('https://user:secret@play.bohrium.com/api?token=x#frag', 'competition/bohr-product', { period: '1' }),
    'https://play.bohrium.com/competition/bohr-product?period=1');
  // A `?` in the path stays in the path; query values are encoded; empty and undefined queries add nothing.
  assert.equal(publicPageUrl('https://play.bohrium.com', 'competition/a?b'), 'https://play.bohrium.com/competition/a%3Fb');
  assert.equal(publicPageUrl('https://play.bohrium.com', 'competition/x', { period: 'a b&c=d' }), 'https://play.bohrium.com/competition/x?period=a+b%26c%3Dd');
  assert.equal(publicPageUrl('https://play.bohrium.com', 'competition/x', {}), 'https://play.bohrium.com/competition/x');
  assert.equal(publicPageUrl('https://play.bohrium.com', 'competition/x', { period: undefined }), 'https://play.bohrium.com/competition/x');
});

test('玻尔产品周赛 lists the website\'s periods and fixed ids, not its tag', () => {
  const bohr = findCompetition('bohr-product');
  assert.equal('tag' in bohr.select, false);
  assert.deepEqual(bohr.periods.map(({ slug, labelZh, startAt, endAt }) => ({ slug, labelZh, startAt, endAt })), [
    { slug: '1', labelZh: '第一期', startAt: '2026-10-21T16:00:00+08:00', endAt: '2026-11-03T24:00:00+08:00' },
    { slug: '2', labelZh: '第二期', startAt: '2026-11-04T16:00:00+08:00', endAt: '2026-11-11T16:00:00+08:00' }]);
  assert.deepEqual(competitionPeriodSlugs('bohr-product'), ['1', '2']);
  // All periods: the de-duplicated concatenation in period order, 13 challenges.
  const all = competitionSelection('bohr-product').challengeIds;
  assert.equal(all.length, 13);
  assert.deepEqual(all, [...PERIOD_1, ...PERIOD_2]);
  assert.equal(all.includes('challenge-9313ad0a'), false, '写作19 is tagged product-arena but in no period');
  assert.deepEqual(competitionSelection('bohr-product', '1'), { challengeIds: PERIOD_1 });
  assert.deepEqual(competitionSelection('bohr-product', '2'), { challengeIds: PERIOD_2 });
  // Only the entry's own slugs, exactly; other competitions have no periods.
  for (const period of ['3', '', ' 1', '1 ', '01', 1, null, 'all']) assert.equal(competitionSelection('bohr-product', period), undefined, JSON.stringify(period));
  assert.equal(competitionSelection('agent', '1'), undefined);
  assert.equal(competitionSelection('light-chasing', '1'), undefined);
  assert.equal(competitionSelection('nope', '1'), undefined);
  for (const id of COMPETITION_IDS.filter((value) => value !== 'bohr-product')) assert.deepEqual(competitionPeriodSlugs(id), [], id);
  assert.deepEqual(competitionPeriodSlugs('nope'), []);
  assert.deepEqual(competitionPeriodSlugs(undefined), []);
  // A copy: changing it cannot change the table.
  competitionSelection('bohr-product', '1').challengeIds.push('x');
  assert.deepEqual([...findCompetition('bohr-product').periods[0].challengeIds], PERIOD_1);
});

test('the default period is the live one, else the most recently started, else the first', () => {
  const bohr = findCompetition('bohr-product').periods;
  assert.equal(defaultPeriod(bohr, at('2026-11-02T12:00:00Z')), '1', 'period 1 is live');
  assert.equal(defaultPeriod(bohr, at('2026-11-03T15:59:59Z')), '1', 'the last second before 11.03 24:00');
  // Exactly 11.03 24:00 (+08:00): period 1 has ended and period 2 has not started, so period 1 stays the default.
  assert.deepEqual(bohr.map((period) => competitionStatus(period, at('2026-11-03T16:00:00Z'))), ['ended', 'upcoming']);
  assert.equal(defaultPeriod(bohr, at('2026-11-03T16:00:00Z')), '1', 'the end of period 1: the most recently started');
  assert.equal(defaultPeriod(bohr, at('2026-11-04T07:59:59Z')), '1', 'the last second before period 2 starts');
  // Exactly 11.11 16:00 (+08:00): period 2 has ended too and stays the default as the most recently started.
  assert.equal(competitionStatus(bohr[1], at('2026-11-11T07:59:59Z')), 'live');
  assert.deepEqual(bohr.map((period) => competitionStatus(period, at('2026-11-11T08:00:00Z'))), ['ended', 'ended']);
  assert.equal(defaultPeriod(bohr, at('2026-11-11T08:00:00Z')), '2', 'the end of period 2: the most recently started');
  assert.equal(defaultPeriod(bohr, at('2026-11-03T20:00:00Z')), '1', 'between the periods: the most recently started');
  assert.equal(defaultPeriod(bohr, at('2026-11-04T08:00:00Z')), '2', 'period 2 is live from its start');
  assert.equal(defaultPeriod(bohr, at('2026-12-01T00:00:00Z')), '2', 'all ended: the most recently started');
  assert.equal(defaultPeriod(bohr, at('2026-10-01T00:00:00Z')), '1', 'none started: the first');
  assert.equal(defaultPeriod(bohr, new Date('2026-11-05T00:00:00Z')), '2');
  // Order of the list does not decide among started periods; it does when none has started.
  const late = { slug: 'b', startAt: '2026-05-01T00:00:00Z', endAt: '2026-06-01T00:00:00Z' };
  const early = { slug: 'a', startAt: '2026-01-01T00:00:00Z', endAt: '2026-02-01T00:00:00Z' };
  assert.equal(defaultPeriod([late, early], at('2026-03-01T00:00:00Z')), 'a');
  assert.equal(defaultPeriod([late, early], at('2026-07-01T00:00:00Z')), 'b');
  assert.equal(defaultPeriod([late, early], at('2025-07-01T00:00:00Z')), 'b');
  // Two live periods: the later start; a live one beats a later-started one that has ended.
  const long = { slug: 'long', startAt: '2026-01-01T00:00:00Z', endAt: '2026-12-01T00:00:00Z' };
  const short = { slug: 'short', startAt: '2026-03-01T00:00:00Z', endAt: '2026-04-01T00:00:00Z' };
  assert.equal(defaultPeriod([long, short], at('2026-03-15T00:00:00Z')), 'short');
  assert.equal(defaultPeriod([long, short], at('2026-05-01T00:00:00Z')), 'long');
  assert.equal(defaultPeriod([], at('2026-05-01T00:00:00Z')), undefined);
  assert.equal(defaultPeriod(undefined), undefined);
});

test('competitionList gives the product contest its periods with status, time and default, without challenge ids', () => {
  const bohr = (now) => competitionList({ now: at(now) }).find((item) => item.id === 'bohr-product');
  const live = bohr('2026-11-05T00:00:00Z');
  assert.deepEqual(live.periods, [
    { slug: '1', labelZh: '第一期', status: 'ended', startAt: '2026-10-21T16:00:00+08:00', endAt: '2026-11-03T24:00:00+08:00',
      dateText: '2026.10.21 — 2026.11.03', timeText: '2026.10.21 16:00 — 2026.11.03 24:00' },
    { slug: '2', labelZh: '第二期', status: 'live', startAt: '2026-11-04T16:00:00+08:00', endAt: '2026-11-11T16:00:00+08:00',
      dateText: '2026.11.04 — 2026.11.11', timeText: '2026.11.04 16:00 — 2026.11.11 16:00' }]);
  assert.equal(live.defaultPeriod, '2');
  assert.equal(live.status, 'live');
  assert.equal(live.rounds, '第一期 10.21 16:00 — 11.03 24:00 · 第二期 11.04 16:00 — 11.11 16:00');
  assert.equal(JSON.stringify(live).includes('skill-13890f6a'), false, 'challenge ids stay on the Host');
  assert.equal(bohr('2026-11-02T12:00:00Z').defaultPeriod, '1');
  assert.deepEqual(bohr('2026-11-02T12:00:00Z').periods.map((period) => period.status), ['live', 'upcoming']);
  assert.equal(bohr('2026-12-01T00:00:00Z').defaultPeriod, '2');
  // Other entries and API seasons have no periods, even when the API sends a field of that name.
  const items = competitionList({ seasons: [{ slug: 's9', status: 'active', periods: [{ slug: 'x' }] }], now: at('2026-11-05T00:00:00Z') });
  assert.ok(items.filter((item) => item.id !== 'bohr-product').every((item) => !('periods' in item) && !('defaultPeriod' in item)));
});
