import { apply } from '../../index.js';

export function credentialRecords(records = new Map()) {
  return {
    async listRecords() { return [...records].map(([key, record]) => ({ key, kind: record.kind })); },
    async modifyRecord(key, mutate) {
      const next = await mutate(records.get(key));
      if (next !== undefined) records.set(key, next);
      return next;
    },
    async deleteRecord(key) { records.delete(key); },
  };
}

export function mountAccountHost(credentials, handlers, settings = {}) {
  const peer = {}, disposers = [];
  let service;
  const scope = {
    get: (name) => name === 'credentials' ? credentials : name === 'connection' ? { browserPeer: peer } : undefined,
    invocation: { peer },
    tools: { register() {} }, commands: { register() {} }, sessionProjections: { register() {} }, typert: { register() {} },
    provide: (_name, value) => { service = value; },
    on(name, handler) {
      if (name !== 'credentials/reference-updated') return;
      handlers.add(handler);
      disposers.push(() => handlers.delete(handler));
    },
    effect(register) { disposers.push(register()); },
    inject(keys, activate) { if (keys.includes('typert')) activate(scope); },
  };
  apply({ ...scope, inject: (_keys, activate) => activate(scope) }, { baseUrl: 'https://example.test/api', ...settings });
  return { service, dispose: () => disposers.reverse().forEach((dispose) => dispose()) };
}
