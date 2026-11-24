import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { access, constants } from 'node:fs/promises';
import { Duplex } from 'node:stream';
import WebSocket from 'ws';
import { StringDecoder } from 'node:string_decoder';

async function findCodex() {
  const binary = process.platform === 'win32' ? 'codex.exe' : 'codex';
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, binary);
    if (await access(candidate, constants.X_OK).then(() => true, () => false)) return candidate;
  }
  throw new Error('codex_unavailable');
}

// One stdio client owns one operation. A write uses the live server so its active
// turn and approval state belong to the same executor as the original chat.
export async function withCodex(operation, { live = false, signal, launch } = {}) {
  signal?.throwIfAborted();
  const child = launch ? launch(live) : spawn(await findCodex(), ['app-server', ...(live ? ['proxy'] : ['--stdio'])],
    { cwd: homedir(), windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'] });
  const deadline = AbortSignal.timeout(live ? 180000 : 20000);
  const stop = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let nextId = 0;
  let failure;
  let onNotice;
  let buffer = '';
  const decoder = new StringDecoder('utf8');
  const pending = new Map();
  const closed = Promise.withResolvers();
  void closed.promise.catch(() => {});
  function fail(error) {
    if (failure) return;
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    closed.reject(error);
    child.kill();
  }
  const abort = () => fail(new Error('codex_interrupted'));
  stop.addEventListener('abort', abort, { once: true });
  if (stop.aborted) abort();
  const ended = () => fail(new Error('codex_unavailable'));
  child.on('error', ended);
  child.once('close', ended);
  child.stdin.on('error', ended);
  child.stdout.on('error', ended);
  const ready = Promise.withResolvers();
  const socket = live ? new WebSocket('ws://localhost/', {
    // The official proxy forwards raw bytes. The HTTP upgrade and all frames travel over its stdio.
    createConnection: () => Duplex.from({ readable: child.stdout, writable: child.stdin }),
    handshakeTimeout: 8000, perMessageDeflate: false, maxPayload: 8 * 1024 * 1024,
  }) : null;
  if (socket) {
    socket.once('open', ready.resolve);
    socket.on('error', ended);
    socket.once('close', ended);
    socket.on('message', (frame) => {
      try { receive(JSON.parse(frame.toString())); } catch { fail(new Error('codex_protocol')); }
    });
  } else ready.resolve();
  function write(value) {
    if (socket) socket.send(JSON.stringify(value));
    else child.stdin.write(JSON.stringify(value) + '\n');
  }
  function receive(message) {
    if (message.method) {
      if (Object.hasOwn(message, 'id')) {
        // The plugin cannot answer requests for approval, tools, credentials or user input.
        fail(new Error('interaction_required'));
      } else onNotice?.(message);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error('codex_rejected'));
    else request.resolve(message.result);
  }
  if (!socket) child.stdout.on('data', (chunk) => {
    buffer += decoder.write(chunk);
    let end;
    try {
      while (!failure && (end = buffer.indexOf('\n')) >= 0) {
        if (end > 8 * 1024 * 1024) throw new Error();
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (line.trim()) receive(JSON.parse(line));
      }
      if (buffer.length > 8 * 1024 * 1024) throw new Error();
    } catch { fail(new Error('codex_protocol')); }
  });
  const rpc = {
    call(method, params) {
      if (failure) return Promise.reject(failure);
      const id = ++nextId;
      const request = Promise.withResolvers();
      pending.set(id, request);
      write({ id, method, params });
      return request.promise;
    },
    listen(listener) { onNotice = listener; },
    wait(promise) { return Promise.race([promise, closed.promise]); },
  };
  try {
    await rpc.wait(ready.promise);
    const info = await rpc.call('initialize', { clientInfo: { name: 'dsh_playground', title: 'Playground Workbench', version: '1' }, capabilities: {} });
    // Earlier servers can silently ignore unknown list filters. Check before listing.
    const version = info?.userAgent?.match(/\/(\d+)\.(\d+)\.(\d+)(?:-alpha\.(\d+))?(?=\s|$)/);
    if (!version || !(+version[1] > 0 || +version[2] > 171 || +version[2] === 171 &&
      (+version[3] > 0 || !version[4] || +version[4] >= 13))) throw new Error('codex_incompatible');
    write({ method: 'initialized', params: {} });
    return await Promise.race([operation(rpc), closed.promise]);
  } finally {
    stop.removeEventListener('abort', abort);
    socket?.terminate();
    child.kill();
  }
}
