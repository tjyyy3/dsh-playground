import assert from 'node:assert/strict';
import test from 'node:test';
import { registerWorkbenchQueries } from '../lib/queries.js';

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
