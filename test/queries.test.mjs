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
