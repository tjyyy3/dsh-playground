import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPETITION_IDS, COMPETITIONS, competitionDateText, competitionList, competitionSelection, competitionStatus,
  competitionTimeText, findCompetition,
} from '../lib/competitions.js';
import { publicPageUrl } from '../lib/links.js';

const at = (text) => Date.parse(text);

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
    assert.ok(tag || season || challengeIds?.length, `${item.id} selects its challenges`);
    if (season) assert.ok(!tag && !challengeIds, `${item.id} selects by season only`);
    if (challengeIds) {
      assert.equal(new Set(challengeIds).size, challengeIds.length);
      assert.ok(challengeIds.every((id) => typeof id === 'string' && id.trim() === id && id));
    }
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
  assert.deepEqual(competitionSelection('bohr-product'), { tag: 'product-arena',
    challengeIds: ['skill-13890f6a', 'ai-github-98fdb6f0', 'ai-635bc8b5'] });
  assert.deepEqual(competitionSelection('harness').challengeIds, ['biomaster-harness-optimization-4f6eec24', 'harness-45c4688b']);
  assert.deepEqual(competitionSelection('agent').challengeIds, ['agent-optimization-v1']);
  assert.deepEqual(competitionSelection('science-reliability').challengeIds, ['scimaster-harness-arena-0ece77a4']);
  // Both rounds of the website's arena list; the second one (v2) is closed but still listed.
  assert.deepEqual(competitionSelection('llm-deploy').challengeIds, ['llm-challenge-arena-v1', 'llm-challenge-arena-v2']);
  const fixed = COMPETITIONS.flatMap((item) => item.select.challengeIds || []);
  assert.equal(fixed.length, 13, 'the DPA id is listed twice (DPA deploy and the PKU zone)');
  assert.equal(new Set(fixed).size, 12);
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

test('dates and times are shown as written, without converting time zones', () => {
  const find = (id) => findCompetition(id);
  assert.equal(competitionDateText(find('light-chasing')), '2026.10.10 — 2026.10.11');
  assert.equal(competitionTimeText(find('light-chasing')), '2026.10.10 20:00 — 2026.10.11 20:00');
  assert.equal(competitionDateText(find('bohr-product')), '2026.10.21 起');
  assert.equal(competitionTimeText(find('bohr-product')), '2026.10.21 16:00 起');
  assert.equal(competitionDateText(find('pku')), '日期待定');
  assert.equal(competitionTimeText(find('pku')), '日期待定');
  assert.equal(competitionDateText(find('paper2arm-s1')), '2026.04.17', 'one day collapses to one date');
  assert.equal(competitionTimeText(find('paper2arm-s1')), '2026.04.17 05:00 — 2026.04.17 09:00');
  // s4 reads as on the website: its end is 2027.01.31, not 2027.02.01 07:59 in UTC+8.
  assert.equal(competitionDateText(find('knight-s4')), '2026.07.27 — 2027.01.31');
  assert.equal(competitionTimeText(find('knight-s4')), '2026.07.27 00:00 — 2027.01.31 23:59');
  // The live API writes +00:00; the digits are kept the same way.
  const api = { startAt: '2026-07-27T00:00:00+00:00', endAt: '2027-01-31T23:59:59+00:00' };
  assert.equal(competitionTimeText(api), '2026.07.27 00:00 — 2027.01.31 23:59');
  assert.equal(competitionDateText({ endAt: '2026-10-21T00:00:00Z' }), '至 2026.10.21');
  // An explicit +08:00 keeps its written value, even where the UTC date is a day earlier.
  assert.equal(competitionTimeText({ startAt: '2026-09-18T00:00:00+08:00' }), '2026.09.18 00:00 起');
  // A bare date has no time of day; a parseable non-ISO string falls back to UTC+8; an unparseable one is absent.
  assert.equal(competitionTimeText({ startAt: '2026-09-18' }), '2026.09.18 起');
  assert.equal(competitionTimeText({ startAt: 'Tue, 01 Dec 2026 00:00:00 GMT' }), '2026.12.01 08:00 起');
  assert.equal(competitionTimeText({ startAt: 'soon', endAt: '2026-13-45' }), '日期待定');
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
    timeText: '2026.12.01 00:00 — 2026.12.08 00:00', pagePath: 'hackathon-s5' });
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
