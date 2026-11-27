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
    && typeof store.listRecords === 'function' && typeof store.modifyRecord === 'function' && typeof store.deleteRecord === 'function';
  const prefix = 'PLAYGROUND_SWITCH_' + randomUUID().slice(0, 8).toUpperCase() + '_';
  const credentialFor = (id) => prefix + id.replaceAll('-', '').toUpperCase();
  const pending = new Map();
  let disposed = false, recovery;

  function reportRecoveryFailure() {
    ctx.logger?.warn?.('Playground could not finish temporary account credential cleanup. The Host will retry on its next start.');
  }

  async function consume(ref, ticket) {
    const saved = ticket ? await store.resolve(ref) : await store.describe(ref);
    if (saved?.source !== 'file') return unavailable;
    try { await store.unset(ref); }
    catch { return cleanupFailed; }
    try { await store.deleteRecord(recordKey(ref)); }
    catch { reportRecoveryFailure(); }
    if (!ticket || pending.get(ref) !== ticket || typeof saved.value !== 'string' || !saved.value.trim()) return unavailable;
    return identify({}, saved.value);
  }

  async function recoverCandidates() {
    const records = await store.listRecords();
    if (disposed) return;
    const results = await Promise.allSettled(records.flatMap(({ key, kind }) => {
      if (kind !== 'grant' || !key.startsWith(recordPrefix)) return [];
      const ref = key.slice(recordPrefix.length).replaceAll('-', '_').toUpperCase();
      // Keep the record when the write is still pending. A later update or mount can clear it.
      return candidateReference.test(ref) ? [consume(ref)] : [];
    }));
    if (results.some((result) => result.status === 'rejected' || result.value === cleanupFailed)) reportRecoveryFailure();
  }

  if (supported) {
    ctx.on('credentials/reference-updated', (ref) => {
      // A credential write can finish after the Host that issued its ticket was disposed.
      if (disposed || !candidateReference.test(ref)) return;
      const pendingTicket = pending.get(ref);
      const ticket = pendingTicket && !pendingTicket.received ? pendingTicket : undefined;
      if (ticket) ticket.received = true;
      return consume(ref, ticket).then((answer) => ticket?.resolve(answer), () => ticket?.resolve(unavailable));
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
      // Persist only the reference before the browser can write it. Tickets stay within this Host lifetime.
      try { await store.modifyRecord(recordKey(credential), () => ({ kind: 'grant', payload: null })); }
      catch { return { ok: false }; }
      if (disposed) return { ok: false };
      const { promise, resolve } = Promise.withResolvers();
      const timer = setTimeout(() => {
        pending.delete(credential);
        resolve(unavailable);
      }, 120000);
      timer.unref();
      pending.set(credential, { promise, resolve, timer, received: false, claimed: false });
      return { ok: true, id, credential };
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
