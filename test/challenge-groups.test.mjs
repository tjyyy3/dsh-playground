import assert from 'node:assert/strict';
import test from 'node:test';

import { createChallengeGroupsReader } from '../lib/challenge-groups.js';

const LIGHT_CHASING_ROWS = [
  { id: 'lc-mat-2', tags: ['追光者计划·招募赛', '岗位·材料科研 Agent 全栈开发实习生'] },
  { id: 'lc-drug-1', tags: ['追光者计划·招募赛', '岗位·AI for Science药物研发研究员/实习生'] },
  { id: 'lc-mat-1', tags: ['追光者计划·招募赛', '岗位·材料科研 Agent 全栈开发实习生', '岗位·材料科研 Agent 全栈开发实习生'] },
  { id: 'lc-plain', tags: ['追光者计划·招募赛'] },
  { id: 'lc-other', tags: ['追光者计划·招募赛', '岗位·无此岗位'] },
];

const plain = (groups) => groups.map(({ key, labelZh, count, select }) => [key, labelZh, count, [...select.challengeIds]]);

function readerFor(overrides = {}, options = {}) {
  const calls = [];
  const client = {
    async listTaggedChallengeTags(tag) {
      calls.push(`tag:${tag}`);
      return { rows: LIGHT_CHASING_ROWS };
    },
    async getSeasonRounds(season) {
      calls.push(`rounds:${season}`);
      return { currentSeq: 2, rounds: [
        { seq: 1, challengeCount: 2, challengeIds: ['k4-1', 'k4-2'] },
        { seq: 2, challengeCount: 1, challengeIds: ['k4-3'] },
        { seq: 3, challengeCount: 0, challengeIds: [] },
      ] };
    },
    async listSeasonTracks(season) {
      calls.push(`tracks:${season}`);
      return { rows: [
        { id: 'p2-paper-1', track: 'paper', trackZh: '论文复现' },
        { id: 'p2-fox-1', track: 'fox', trackZh: '科学狐狸' },
        { id: 'p2-paper-2', track: 'paper' },
        { id: 'p2-software-1', track: 'software', trackZh: '软件构造' },
        { id: 'p2-new-1', track: 'mystery', trackZh: '新赛道' },
      ] };
    },
    ...overrides,
  };
  return { calls, reader: createChallengeGroupsReader({ client, ...options }) };
}

test('each grouped contest is grouped the way its own website groups it, with the count of each group', async () => {
  const { reader, calls } = readerFor();
  // The job chips in the website's own order, every official job included: a job the contest has no
  // challenge for counts 0 and stays in the row. A challenge with no known job tag joins no group, and the
  // contest's own tag is read, so the ids of a group are always ids of this contest.
  assert.deepEqual(plain((await reader.read('light-chasing')).groups), [
    ['mat', '材料科研 Agent 全栈开发实习生', 2, ['lc-mat-2', 'lc-mat-1']],
    ['drug', 'AI for Science药物研发研究员/实习生', 1, ['lc-drug-1']],
    ['sde', '科研 Agent 全栈开发工程师／实习生', 0, []],
    ['fde', 'FDE 前线部署工程师／实习生', 0, []],
    ['lab', 'AI4S 智能大装置工程开发实习生', 0, []],
    ['spectra', '创新算法研究员/实习生(解谱方向)', 0, []],
    ['lkm', '创新算法研究员／实习生(LKM 方向)', 0, []],
    ['product', '产品实习生', 0, []],
    ['ops', '运营实习生', 0, []],
  ]);
  // The rounds keep the order and the per-round challenge order the platform answered with. A round the
  // season announced without challenges is left out: it has nothing to list.
  assert.deepEqual(plain((await reader.read('knight-s4')).groups), [
    ['r1', '第 1 轮', 2, ['k4-1', 'k4-2']],
    ['r2', '第 2 轮', 1, ['k4-3']],
  ]);
  // Tracks in the season page's own order (论文复现 · 软件构造 · 红蓝对抗 · 科学狐狸), named by the platform
  // where it names them; a track the platform added since follows them in list order.
  assert.deepEqual(plain((await reader.read('paper2arm-s2')).groups), [
    ['paper', '论文复现', 2, ['p2-paper-1', 'p2-paper-2']],
    ['software', '软件构造', 1, ['p2-software-1']],
    ['fox', '科学狐狸', 1, ['p2-fox-1']],
    ['mystery', '新赛道', 1, ['p2-new-1']],
  ]);
  assert.deepEqual(calls, ['tag:追光者计划·招募赛', 'rounds:s4', 'tracks:s2']);
});

test('a competition the website does not group without periods is not grouped here', async () => {
  const { reader, calls } = readerFor();
  for (const id of ['agent', 'bohr-product', 'pku', 'paper2arm-s3', 'missing']) {
    assert.equal(await reader.read(id), undefined, id);
  }
  assert.deepEqual(calls, []);
});

test('a grouping is read once per TTL, again on refresh, and only once while a read is in flight', async () => {
  const { reader, calls } = readerFor({}, { ttlMs: 50 });
  const [first, second] = await Promise.all([reader.read('knight-s4'), reader.read('knight-s4')]);
  assert.deepEqual(first.groups, second.groups);
  assert.deepEqual(calls, ['rounds:s4'], 'two callers share one in-flight read');
  await reader.read('knight-s4');
  assert.deepEqual(calls, ['rounds:s4'], 'a cached grouping answers inside its TTL');
  await reader.read('knight-s4', { refresh: true });
  assert.deepEqual(calls, ['rounds:s4', 'rounds:s4'], 'refresh reads the official membership again');
  await new Promise((resolve) => { setTimeout(resolve, 60); });
  await reader.read('knight-s4');
  assert.equal(calls.length, 3, 'an expired grouping is read again');
});

test('a failed read keeps the last grouping, and marks every answer that is not fresh', async () => {
  let rounds = { rounds: [{ seq: 1, challengeCount: 1, challengeIds: ['k4-1'] }] };
  const { reader, calls } = readerFor({ getSeasonRounds: async () => {
    calls.push('rounds:s4');
    if (!rounds) throw new Error('HTTP 503');
    return rounds;
  } }, { ttlMs: 60 * 1000 });
  const fresh = await reader.read('knight-s4');
  assert.deepEqual([plain(fresh.groups), fresh.stale], [[['r1', '第 1 轮', 1, ['k4-1']]], undefined]);
  rounds = undefined;
  const degraded = await reader.read('knight-s4', { refresh: true });
  assert.deepEqual([plain(degraded.groups), degraded.stale], [[['r1', '第 1 轮', 1, ['k4-1']]], true],
    'the last grouping survives a short outage so a chosen group keeps working');
  // The grouping stays marked until a read succeeds, the answers served from its TTL included: it is still
  // the membership of before the outage.
  const cached = await reader.read('knight-s4');
  assert.deepEqual([plain(cached.groups), cached.stale], [[['r1', '第 1 轮', 1, ['k4-1']]], true]);
  assert.deepEqual(calls, ['rounds:s4', 'rounds:s4'], 'a cached grouping is not read again inside its TTL');
  rounds = { rounds: [{ seq: 1, challengeCount: 1, challengeIds: ['k4-1'] }, { seq: 2, challengeCount: 1, challengeIds: ['k4-2'] }] };
  const recovered = await reader.read('knight-s4', { refresh: true });
  assert.deepEqual([plain(recovered.groups).length, recovered.stale], [2, undefined], 'a successful read clears the mark');
  assert.equal((await reader.read('knight-s4')).stale, undefined);
});

test('a read that fails with nothing to fall back on gives no groups instead of rejecting', async () => {
  const { reader } = readerFor({ listTaggedChallengeTags: async () => { throw new Error('HTTP 503'); } });
  assert.deepEqual(await reader.read('light-chasing'), { groups: [], stale: true });
});

test('a grouping that cannot be queried or counted is dropped whole', async () => {
  // Groups are chosen by key on the wire, so a platform key that is not a group key leaves the contest
  // ungrouped rather than listing a group nobody can select.
  const { reader: byKey } = readerFor({ listSeasonTracks: async () => ({ rows: [
    { id: 'p2-1', track: '论文复现' },
    { id: 'p2-2', track: 'fox' },
  ] }) });
  assert.deepEqual((await byKey.read('paper2arm-s2')).groups, []);

  const { reader: emptyRounds } = readerFor({ getSeasonRounds: async () => ({ rounds: [] }) });
  assert.deepEqual((await emptyRounds.read('knight-s4')).groups, []);
});

test('an incompletely read grouping takes the same fallback as a read that never answered', async () => {
  // lib/api.js refuses to describe a filter it could not page to the end, so an incomplete read arrives
  // here as a failure. Publishing its short answer would count and list fewer challenges than the season
  // holds, and a chosen group would silently lose members.
  let incomplete = false;
  const { reader } = readerFor({ listSeasonTracks: async () => {
    if (incomplete) throw Object.assign(new Error('the challenge list filter could not be read completely'), { code: 'incomplete_list' });
    return { rows: [{ id: 'p2-paper-1', track: 'paper', trackZh: '论文复现' }, { id: 'p2-fox-1', track: 'fox' }] };
  } });
  assert.deepEqual(plain((await reader.read('paper2arm-s2')).groups).map(([key, , count]) => [key, count]), [['paper', 1], ['fox', 1]]);
  incomplete = true;
  const degraded = await reader.read('paper2arm-s2', { refresh: true });
  assert.deepEqual([degraded.groups.map((group) => group.key), degraded.stale], [['paper', 'fox'], true]);

  // The first read of a contest cannot fall back on anything, so the contest is listed ungrouped instead of
  // listing a grouping that would miscount.
  const { reader: first } = readerFor({ listSeasonTracks: async () => {
    throw Object.assign(new Error('the challenge list filter could not be read completely'), { code: 'incomplete_list' });
  } });
  assert.deepEqual(await first.read('paper2arm-s2'), { groups: [], stale: true });
});

test('a grouping a caller receives cannot be changed under the next caller', async () => {
  const { reader } = readerFor();
  const { groups } = await reader.read('knight-s4');
  assert.throws(() => { groups[0].count = 99; }, TypeError);
  assert.throws(() => { groups[0].select.challengeIds.push('k4-9'); }, TypeError);
});
