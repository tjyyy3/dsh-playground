import { randomUUID } from 'node:crypto';

const unavailable = { authenticated: false, reason: 'unavailable' };

export function createAccountSwitches(ctx, identify) {
  const store = ctx.get?.('credentials');
  const supported = typeof ctx.on === 'function' && typeof store?.set === 'function'
    && typeof store.resolve === 'function' && typeof store.unset === 'function';
  const prefix = 'PLAYGROUND_SWITCH_' + randomUUID().slice(0, 8).toUpperCase() + '_';
  const credentialFor = (id) => prefix + id.replaceAll('-', '').toUpperCase();
  const pending = new Map();

  async function consume(ref, ticket) {
    const saved = await store.resolve(ref);
    if (saved?.source !== 'file') return unavailable;
    try { await store.unset(ref); }
    catch { return { authenticated: false, reason: 'cleanup_failed' }; }
    if (!ticket || pending.get(ref) !== ticket || typeof saved.value !== 'string' || !saved.value.trim()) return unavailable;
    return identify({}, saved.value);
  }

  if (supported) {
    ctx.on('credentials/reference-updated', (ref) => {
      if (!ref.startsWith(prefix) || !/^[A-F0-9]{32}$/.test(ref.slice(prefix.length))) return;
      const pendingTicket = pending.get(ref);
      const ticket = pendingTicket && !pendingTicket.received ? pendingTicket : undefined;
      if (ticket) ticket.received = true;
      return consume(ref, ticket).then((answer) => ticket?.resolve(answer), () => ticket?.resolve(unavailable));
    });
    ctx.on('dispose', () => {
      for (const ticket of pending.values()) {
        clearTimeout(ticket.timer);
        ticket.resolve(unavailable);
      }
      pending.clear();
    });
  }

  return {
    startAccountSwitch() {
      if (!supported) return { ok: false };
      const id = randomUUID();
      const credential = credentialFor(id);
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
