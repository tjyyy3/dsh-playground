import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPETITION_IDS } from '../lib/competitions.js';
import { registerWorkbenchQueries } from '../lib/queries.js';

test('challenge dispatch admits only the exact workspace, session, challenge and request identities', async () => {
  let service;
  let invocations;
  const calls = [];
  registerWorkbenchQueries({ provide: (_name, value) => { service = value; }, typert: { register: (value) => { invocations = value.invocations; } } }, {}, {
    dispatch: async (input, signal) => { calls.push([input, signal]); return { kind: 'accepted', sessionId: input.sessionId }; },
  });
  const descriptor = invocations.find(({ method }) => method === 'dispatchChallenge');
  const schema = descriptor.parameters[0].codec.create();
  const signal = new AbortController().signal;
  const input = { workspaceId: 'workspace-a', sessionId: 'controller-a', challengeId: 'a b/c', requestId: '98bcdf27-3bfb-4120-8ad2-06c2eca5810d' };
  assert.deepEqual(await service.dispatchChallenge(schema.parse(input), signal), { kind: 'accepted', sessionId: 'controller-a' });
  assert.deepEqual(calls, [[input, signal]]);
  for (const invalid of [{ ...input, title: 'other' }, { ...input, prompt: 'other' }, { ...input, workspaceId: '' },
    { ...input, sessionId: undefined }, { ...input, challengeId: ' ' }, { ...input, requestId: 'random' }]) {
    assert.equal(schema.safeParse(invalid).success, false);
  }
});

// Client-side behavior of the workbench reads is covered in client.test.mjs.
test('the session-free query contract admits only reads and forwards cancellation', async () => {
  const services = new Map();
  const calls = [];
  let contribution;
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (value) => { contribution = value; } } }, {
    auth: async (exec) => { calls.push(['auth', exec]); return { authenticated: false, user: undefined }; },
    catalog: async (input, exec) => { calls.push(['catalog', input, exec]); return { ok: true, challenges: { items: [] } }; },
  });
  const descriptor = contribution.invocations[0];
  const service = services.get(descriptor.service);
  const schema = descriptor.parameters[0].codec.create();
  const signal = new AbortController().signal;
  assert.deepEqual(await service.query(schema.parse({ action: 'auth' }), signal), { authenticated: false });
  const input = { action: 'catalog', search: 'synthetic', season: 'spring', per_page: 12 };
  await service.query(schema.parse(input), signal);
  assert.deepEqual(calls, [['auth', { signal }], ['catalog', input, { signal }]]);
  for (const invalid of [{ action: 'confirm' }, { action: 'start' }, { action: 'auth', sessionId: 'A' },
    { action: 'catalog', per_page: 1000 }, { action: 'catalog', search: {} }, null]) {
    assert.equal(schema.safeParse(invalid).success, false);
  }
  assert.equal(service.typertRemote.service, service);
  assert.equal(descriptor.cancellation.parameter, 'signal');
});

test('the catalog query accepts a competition only by an id of the built-in table', async () => {
  const services = new Map();
  const calls = [];
  let contribution;
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (value) => { contribution = value; } } }, {
    catalog: async (input) => { calls.push(input); return { ok: true, challenges: { items: [] } }; },
  });
  const descriptor = contribution.invocations.find((item) => item.method === 'query');
  const schema = descriptor.parameters[0].codec.create();
  for (const id of COMPETITION_IDS) {
    const input = { action: 'catalog', competition: id, search: 'x', per_page: 12 };
    await services.get(descriptor.service).query(schema.parse(input), new AbortController().signal);
    assert.deepEqual(calls.at(-1), input);
  }
  assert.equal(calls.length, COMPETITION_IDS.length);
  assert.equal(schema.safeParse({ action: 'catalog', competition: 'bohr-product' }).success, true);
  assert.equal(schema.safeParse({ action: 'catalog', season: 's5' }).success, true, 'API seasons keep using season');
  for (const invalid of ['', 'unknown', 'Bohr-Product', ' bohr-product', 'bohr-product ', 's4', 'season:s5', 'product-arena', '../x', 7, null, ['agent'], {}]) {
    assert.equal(schema.safeParse({ action: 'catalog', competition: invalid }).success, false, JSON.stringify(invalid));
  }
  // Only the catalog action takes a competition; tag and challenge ids are not query fields.
  assert.equal(schema.safeParse({ action: 'auth', competition: 'agent' }).success, false);
  assert.equal(schema.safeParse({ action: 'catalog', tag: 'product-arena' }).success, false);
  assert.equal(schema.safeParse({ action: 'catalog', challengeIds: ['x'] }).success, false);
});

test('the submission-history read accepts only challengeId, limit and cursor and forwards cancellation', async () => {
  const services = new Map();
  const calls = [];
  let contribution;
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (value) => { contribution = value; } } }, {
    myAttempts: async (input, exec) => { calls.push([input, exec]); return { ok: true, items: [{ id: 3, score: undefined }], nextCursor: null, limit: 50 }; },
    catalog: async () => assert.fail('history must not fall through to the catalog'),
  });
  const descriptor = contribution.invocations.find((item) => item.method === 'query');
  const schema = descriptor.parameters[0].codec.create();
  const controller = new AbortController();
  const input = { action: 'my_attempts', challengeId: 'challenge-a', limit: 50, cursor: 'opaque.cursor' };
  assert.deepEqual(await services.get('playgroundQueries').query(schema.parse(input), controller.signal),
    { ok: true, items: [{ id: 3 }], nextCursor: null, limit: 50 });
  assert.deepEqual(calls, [[input, { signal: controller.signal }]]);
  assert.equal(schema.safeParse({ action: 'my_attempts', challengeId: 'challenge-a' }).success, true);
  for (const invalid of [{ action: 'my_attempts' }, { action: 'my_attempts', challengeId: '' },
    { action: 'my_attempts', challengeId: 'challenge-a', status: 'submitted' },
    { action: 'my_attempts', challengeId: 'challenge-a', sessionId: 'A' },
    { action: 'my_attempts', challengeId: 'challenge-a', attemptId: 1 },
    { action: 'my_attempts', challenge_id: 'challenge-a' },
    { action: 'my_attempts', challengeId: 'challenge-a', limit: 0 },
    { action: 'my_attempts', challengeId: 'challenge-a', limit: 101 },
    { action: 'my_attempts', challengeId: 'challenge-a', limit: 1.5 },
    { action: 'my_attempts', challengeId: 'challenge-a', cursor: 7 },
    { action: 'my_attempts', challengeId: { id: 'challenge-a' } }]) {
    assert.equal(schema.safeParse(invalid).success, false, JSON.stringify(invalid));
  }
});

test('session-free login accepts only the account email and never a password', async () => {
  const services = new Map();
  const calls = [];
  let contribution;
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (value) => { contribution = value; } } }, {
    login: async (email, exec) => { calls.push([email, exec]); return { ok: true, authenticated: true, user: undefined }; },
  });
  const descriptor = contribution.invocations.find((item) => item.method === 'login');
  assert.equal(descriptor.id, '@playground/dsh-playground#playgroundQueries/login');
  const schema = descriptor.parameters[0].codec.create();
  const signal = new AbortController().signal;
  assert.deepEqual(await services.get('playgroundQueries').login(schema.parse({ email: ' a@example.test ' }), signal), { ok: true, authenticated: true });
  assert.deepEqual(calls, [['a@example.test', { signal }]]);
  for (const invalid of [{ email: 'a@example.test', password: 'x' }, { email: '' }, { email: '   ' }, {}, { email: 1 }]) {
    assert.equal(schema.safeParse(invalid).success, false);
  }
});

test('controller RPCs separate inspection from explicit creation and name only the selected workspace', async () => {
  let service;
  let invocations;
  const calls = [];
  registerWorkbenchQueries({ provide: (_name, value) => { service = value; }, typert: { register: (value) => { invocations = value.invocations; } } }, {}, {
    inspect: async (input, signal) => { calls.push(['inspect', input, signal]); return { kind: 'absent', codex: 'registered' }; },
    open: async (input, signal) => { calls.push(['open', input, signal]); return { kind: 'opened', sessionId: 'c', created: true }; },
  });
  const [inspect, open] = ['inspectController', 'openController'].map((method) => invocations.find((item) => item.method === method).parameters[0].codec.create());
  const input = { workspaceId: 'workspace' };
  const selected = { ...input, createIfMissing: true };
  const signal = new AbortController().signal;
  assert.equal((await service.inspectController(inspect.parse(input), signal)).kind, 'absent');
  assert.equal((await service.openController(open.parse(selected), signal)).sessionId, 'c');
  assert.deepEqual(calls, [['inspect', input, signal], ['open', selected, signal]]);
  assert.equal(inspect.safeParse(selected).success, false);
  assert.equal(open.safeParse(input).success, false);
  for (const target of [{ cwd: '/example' }, { workspaceId: '' }, { ...input, sessionId: 'foreign' }]) {
    assert.equal(inspect.safeParse(target).success, false);
    assert.equal(open.safeParse({ ...target, createIfMissing: true }).success, false);
  }
});

test('the attempt query reads one submission by id, forwards cancellation and rejects every other parameter', async () => {
  const services = new Map();
  const calls = [];
  let contribution;
  // A workflow with only `attempt`: any other call would throw, so this read can reach nothing else.
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (value) => { contribution = value; } } }, {
    attempt: async (id, exec) => { calls.push([id, exec]); return { id, status: 'queued', scoringState: { state: 'queued', scoreIsFinal: false }, ignored: undefined }; },
  });
  const descriptor = contribution.invocations.find((item) => item.method === 'query');
  const schema = descriptor.parameters[0].codec.create();
  const signal = new AbortController().signal;
  assert.deepEqual(await services.get('playgroundQueries').query(schema.parse({ action: 'attempt', attemptId: 62532 }), signal),
    { id: 62532, status: 'queued', scoringState: { state: 'queued', scoreIsFinal: false } });
  assert.deepEqual(calls, [[62532, { signal }]]);
  for (const invalid of [{ action: 'attempt' }, { action: 'attempt', attemptId: 0 }, { action: 'attempt', attemptId: -3 }, { action: 'attempt', attemptId: 1.5 },
    { action: 'attempt', attemptId: '12' }, { action: 'attempt', attemptId: null }, { action: 'attempt', attemptId: 2 ** 60 },
    { action: 'attempt', attemptId: 1, sessionId: 'A' }, { action: 'attempt', attemptId: 1, per_page: 10 }, { action: 'attempt', attempt_id: 1 },
    { action: 'attempt', attemptId: 1, confirm: true }, { action: 'attempt', attemptId: 1, challengeId: 'challenge-a' }]) {
    assert.equal(schema.safeParse(invalid).success, false, JSON.stringify(invalid));
  }
});

test('the challenge detail query accepts only a challengeId, trims it and forwards cancellation', async () => {
  const services = new Map();
  const calls = [];
  let contribution;
  // A workflow with only `challenge`: any other call would throw, so this read can reach nothing else.
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (value) => { contribution = value; } } }, {
    challenge: async (id, exec) => { calls.push([id, exec]); return { ok: true, id, title: 'Synthetic', ignored: undefined }; },
  });
  const descriptor = contribution.invocations.find((item) => item.method === 'query');
  const schema = descriptor.parameters[0].codec.create();
  const signal = new AbortController().signal;
  assert.deepEqual(await services.get('playgroundQueries').query(schema.parse({ action: 'challenge', challengeId: ' challenge-a ' }), signal),
    { ok: true, id: 'challenge-a', title: 'Synthetic' });
  assert.deepEqual(calls, [['challenge-a', { signal }]]);
  assert.equal(schema.safeParse({ action: 'challenge', challengeId: 'x'.repeat(200) }).success, true);
  for (const invalid of [{ action: 'challenge' }, { action: 'challenge', challengeId: '' }, { action: 'challenge', challengeId: '   ' },
    { action: 'challenge', challengeId: 'x'.repeat(201) }, { action: 'challenge', challengeId: 7 }, { action: 'challenge', challengeId: null },
    { action: 'challenge', challenge_id: 'challenge-a' }, { action: 'challenge', challengeId: 'challenge-a', sessionId: 'A' },
    { action: 'challenge', challengeId: 'challenge-a', cwd: '/workspace' }, { action: 'challenge', challengeId: 'challenge-a', max_content_chars: 10 },
    { action: 'challenge', challengeId: 'challenge-a', confirm: true }, { action: 'challenge', challengeId: { id: 'challenge-a' } }]) {
    assert.equal(schema.safeParse(invalid).success, false, JSON.stringify(invalid));
  }
});

test('the catalog query takes strict page, origin, discipline and sort filters, and no status filter', async () => {
  const services = new Map();
  const calls = [];
  let contribution;
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (value) => { contribution = value; } } }, {
    catalog: async (input) => { calls.push(input); return { ok: true, challenges: { items: [] } }; },
  });
  const schema = contribution.invocations.find((item) => item.method === 'query').parameters[0].codec.create();
  const input = { action: 'catalog', search: 'x', competition: 'bohr-product', page: 3, origin: 'benchmark', discipline: ' fluid-dynamics ', sort: 'attempts', per_page: 20 };
  await services.get('playgroundQueries').query(schema.parse(input), new AbortController().signal);
  assert.deepEqual(calls, [{ ...input, discipline: 'fluid-dynamics' }]);
  for (const origin of ['community', 'benchmark', 'hackathon', 'arena']) assert.equal(schema.safeParse({ action: 'catalog', origin }).success, true, origin);
  for (const sort of ['newest', 'attempts']) assert.equal(schema.safeParse({ action: 'catalog', sort }).success, true, sort);
  assert.equal(schema.safeParse({ action: 'catalog', page: 1 }).success, true);
  assert.equal(schema.safeParse({ action: 'catalog', discipline: 'x'.repeat(100) }).success, true);
  for (const invalid of [{ page: 0 }, { page: -1 }, { page: 1.5 }, { page: '2' }, { page: null }, { page: 100001 },
    { origin: '' }, { origin: 'all' }, { origin: 'Community' }, { origin: 'github' }, { origin: ['arena'] },
    { discipline: '' }, { discipline: '   ' }, { discipline: 'x'.repeat(101) }, { discipline: 7 }, { discipline: ['physics'] },
    { sort: '' }, { sort: 'score' }, { sort: 'Newest' }, { sort: 1 },
    { status: 'open' }, { disc: 'physics' }, { perPage: 20 }, { tag: 'product-arena' }]) {
    assert.equal(schema.safeParse({ action: 'catalog', ...invalid }).success, false, JSON.stringify(invalid));
  }
  // The filters belong to the catalog only.
  assert.equal(schema.safeParse({ action: 'challenge', challengeId: 'c', page: 2 }).success, false);
  assert.equal(schema.safeParse({ action: 'auth', origin: 'arena' }).success, false);
});

test('the catalog query takes a period only as a slug of the chosen competition\'s periods', async () => {
  const services = new Map();
  const calls = [];
  let contribution;
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (value) => { contribution = value; } } }, {
    catalog: async (input) => { calls.push(input); return { ok: true, challenges: { items: [] } }; },
  });
  const schema = contribution.invocations.find((item) => item.method === 'query').parameters[0].codec.create();
  for (const period of ['1', '2']) {
    const input = { action: 'catalog', search: '', competition: 'bohr-product', period, sort: 'attempts', page: 2, per_page: 20 };
    await services.get('playgroundQueries').query(schema.parse(input), new AbortController().signal);
    assert.deepEqual(calls.at(-1), input);
  }
  assert.equal(schema.safeParse({ action: 'catalog', competition: 'bohr-product' }).success, true, 'no period is all periods');
  // Exactly one of the competition's slugs; nothing is trimmed or coerced.
  for (const period of ['3', '', ' 1', '1 ', '01', 'all', '第一期', 1, null, ['1'], {}]) {
    assert.equal(schema.safeParse({ action: 'catalog', competition: 'bohr-product', period }).success, false, JSON.stringify(period));
  }
  // A competition without periods, a season or no competition at all takes no period.
  for (const input of [{ competition: 'agent', period: '1' }, { competition: 'light-chasing', period: '1' }, { competition: 'knight-s4', period: '1' },
    { season: 's5', period: '1' }, { period: '1' }, { competition: 'nope', period: '1' }]) {
    assert.equal(schema.safeParse({ action: 'catalog', ...input }).success, false, JSON.stringify(input));
  }
  // Each refusal names its own reason: no competition, a competition without periods, or an unknown slug.
  const periodMessage = (input) => schema.safeParse({ action: 'catalog', ...input }).error.issues.find((issue) => issue.path.join('.') === 'period')?.message;
  assert.equal(periodMessage({ period: '1' }), 'period needs a competition');
  assert.equal(periodMessage({ season: 's5', period: '1' }), 'period needs a competition');
  assert.equal(periodMessage({ competition: 'agent', period: '1' }), 'the chosen competition has no periods');
  assert.equal(periodMessage({ competition: 'bohr-product', period: '3' }), 'period must be one of 1, 2');
  assert.equal(schema.safeParse({ action: 'challenge', challengeId: 'c', period: '1' }).success, false);
  assert.equal(calls.length, 2);
});


test('controller task and promotion RPCs accept only workspace and session identity', () => {
  const invocations = [];
  const services = new Map();
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (descriptor) => invocations.push(...descriptor.invocations) } }, {}, {});
  for (const method of ['promoteController', 'controllerTasks']) {
    const schema = invocations.find((item) => item.method === method).parameters[0].codec.create();
    assert.deepEqual(schema.parse({ workspaceId: 'w', sessionId: 's' }), { workspaceId: 'w', sessionId: 's' });
    assert.equal(schema.safeParse({ workspaceId: 'w', sessionId: 's', cwd: '/other' }).success, false);
    assert.equal(schema.safeParse({ workspaceId: 'w' }).success, false);
  }
});
