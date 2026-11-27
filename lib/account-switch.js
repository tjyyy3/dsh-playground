import { randomUUID } from 'node:crypto';

const unavailable = { authenticated: false, reason: 'unavailable' };
const cleanupFailed = { authenticated: false, reason: 'cleanup_failed' };
const candidateReference = /^PLAYGROUND_SWITCH_[A-F0-9]{8}_[A-F0-9]{32}$/;
const recordPrefix = 'playground-competition/';
const recordKey = (ref) => recordPrefix + ref.toLowerCase().replaceAll('_', '-');

export function createAccountSwitches(ctx, identify) {
  const store = ctx.get?.('credentials');
  const supported = typeof ctx.effect === 'function' && typeof ctx.on === 'function' && typeof store?.set === 'function'
    && typeof store.resolve === 'function' && typeof store.describe === 'function' && typeof store.unset === 'function'
    && typeof store.readRecord === 'function' && typeof store.listRecords === 'function'
    && typeof store.modifyRecord === 'function' && typeof store.deleteRecord === 'function';
  const prefix = 'PLAYGROUND_SWITCH_' + randomUUID().slice(0, 8).toUpperCase() + '_';
  const credentialFor = (id) => prefix + id.replaceAll('-', '').toUpperCase();
  const pending = new Map();
  let disposed = false, recovery;

  function reportRecoveryFailure() {
    ctx.logger?.warn?.('Playground could not finish temporary account credential cleanup. The Host will retry on its next start.');
  }

  async function consume(ref) {
    const key = recordKey(ref);
    const record = await store.readRecord(key);
    const marker = record?.kind === 'grant' && record.payload;
    if (!marker || typeof marker.proof !== 'string') return;

    const info = await store.describe(ref);
    const saved = info?.source === 'file' ? await store.resolve(ref) : undefined;
    const prefix = marker.proof + ':';
    const owned = saved?.source === 'file' && typeof saved.value === 'string' && saved.value.startsWith(prefix);
    if (!owned) {
      // An observed write is already gone. An unobserved browser write can still arrive after reload.
      if (marker.observed) await store.deleteRecord(key);
      return;
    }

    const ticket = pending.get(ref);
    const verify = ticket && !ticket.received ? ticket : undefined;
    if (verify) verify.received = true;
    let answer = unavailable;
    try {
      if (!marker.observed) {
        // Persist the fact that a candidate arrived before unsetting it, so a failed record deletion can be retried.
        const updated = await store.modifyRecord(key, (current) => {
          if (current?.kind === 'grant' && current.payload?.proof === marker.proof && !current.payload.observed) {
            return { kind: 'grant', payload: { ...marker, observed: true } };
          }
        });
        if (updated?.payload?.proof !== marker.proof || !updated.payload.observed) return;
      }
      try { await store.unset(ref); }
      catch { answer = cleanupFailed; reportRecoveryFailure(); return; }
      try { await store.deleteRecord(key); }
      catch { reportRecoveryFailure(); }
      const token = saved.value.slice(prefix.length);
      if (verify && pending.get(ref) === verify && token && !/\s/.test(token)) answer = await identify({}, token);
    } finally {
      verify?.resolve(answer);
    }
  }

  async function recoverCandidates() {
    const records = await store.listRecords();
    if (disposed) return;
    const results = await Promise.allSettled(records.flatMap(({ key, kind }) => {
      if (kind !== 'grant' || !key.startsWith(recordPrefix)) return [];
      const ref = key.slice(recordPrefix.length).replaceAll('-', '_').toUpperCase();
      return candidateReference.test(ref) ? [consume(ref)] : [];
    }));
    if (results.some((result) => result.status === 'rejected')) reportRecoveryFailure();
  }

  if (supported) {
    ctx.on('credentials/reference-updated', (ref) => {
      // A credential write can finish after the Host that issued its ticket was disposed.
      if (disposed || !candidateReference.test(ref)) return;
      return consume(ref).catch(() => {
        pending.get(ref)?.resolve(unavailable);
        reportRecoveryFailure();
      });
    });
    ctx.effect(() => () => {
      disposed = true;
      for (const ticket of pending.values()) {
        clearTimeout(ticket.timer);
        ticket.resolve(unavailable);
      }
      pending.clear();
    });
    recovery = recoverCandidates().catch(reportRecoveryFailure);
  }

  return {
    async startAccountSwitch() {
      if (!supported || disposed) return { ok: false };
      await recovery;
      if (disposed) return { ok: false };
      const id = randomUUID();
      const credential = credentialFor(id);
      const proof = randomUUID();
      // The recovery record binds the browser write to this reservation without storing the API token.
      try { await store.modifyRecord(recordKey(credential), () => ({ kind: 'grant', payload: { proof } })); }
      catch { return { ok: false }; }
      if (disposed) return { ok: false };
      const { promise, resolve } = Promise.withResolvers();
      const timer = setTimeout(() => {
        pending.delete(credential);
        resolve(unavailable);
      }, 120000);
      timer.unref();
      pending.set(credential, { promise, resolve, timer, received: false, claimed: false });
      return { ok: true, id, credential, proof };
    },
    async verifyAccount(id) {
      const credential = credentialFor(id);
      const ticket = pending.get(credential);
      if (!ticket || ticket.claimed) return unavailable;
      ticket.claimed = true;
      try { return await ticket.promise; }
      finally { clearTimeout(ticket.timer); pending.delete(credential); }
    },
  };
}
