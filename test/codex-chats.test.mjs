import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createCodexChats } from '../lib/controller/codex-chats.js';
import * as codexRpc from '../lib/controller/codex-rpc.js';
import { registerWorkbenchQueries } from '../lib/queries.js';

const cwd = await realpath('.');
const workspace = { id: 'workspace', path: cwd, sessionIds: ['controller'] };
const marker = { workspaceId: workspace.id, sessionId: 'controller' };
const thread = (name, extra = {}) => ({ id: randomUUID(), source: 'appServer', name, cwd, status: { type: 'idle' }, ...extra });

function fixture(threads, options = {}) {
  const calls = [];
  let listen;
  const rpc = {
    wait: (promise) => promise,
    listen(callback) { listen = callback; },
    async call(method, params) {
      calls.push({ method, params });
      const item = threads.find((row) => row.id === params.threadId);
      if (options.handle) {
        const result = options.handle(method, params, listen);
        if (result !== undefined) return result;
      }
      if (method === 'thread/list') return { data: threads, nextCursor: null };
      if (method === 'thread/read' || method === 'thread/resume') return { thread: item };
      if (method === 'thread/turns/list') return { data: [] };
      if (method === 'turn/start') {
        const params = { threadId: item.id, turnId: 'accepted-turn' };
        listen({ method: 'item/completed', params: { ...params, threadId: randomUUID(), item: { type: 'agentMessage', text: 'unrelated' } } });
        listen({ method: 'item/completed', params: { ...params, turnId: 'other-turn', item: { type: 'agentMessage', text: 'older' } } });
        listen({ method: 'item/completed', params: { ...params, item: { type: 'agentMessage', text: 'actual reply' } } });
        listen({ method: 'turn/completed', params: { ...params, turn: { id: params.turnId, status: 'completed', items: [] } } });
        return { turn: { id: params.turnId } };
      }
      assert.fail(method);
    }
  };
  const chats = createCodexChats({ ctx: { agents: { get: () => ({ session: {} }) }, workingDirectory: { get: () => cwd },
    workspaceRegistry: { resolveByPath: async () => options.workspace || workspace } }, markerOf: () => marker,
    inspect: async () => options.snapshot || { kind: 'existing', sessionId: marker.sessionId },
    getService: () => ({ listChildren: async () => options.children || [] }),
    findExecutable: options.findExecutable,
    connect: options.connect || (async (callback) => callback(rpc)) });
  return { calls, run: (input) => chats({ ...marker, ...input }) };
}

test('detect checks for the executable without connecting to the Codex server', async (t) => {
  const connect = t.mock.fn();
  const findExecutable = t.mock.fn(async () => join(cwd, 'codex'));
  const { run } = fixture([], { connect, findExecutable });
  const missing = fixture([], { connect, findExecutable: async () => { throw Error('codex_unavailable'); } });
  const wrongWorkspace = fixture([], { connect, findExecutable, workspace: { ...workspace, id: 'other' } });

  assert.deepEqual(await run({ action: 'detect' }), { kind: 'available' });
  assert.deepEqual(await missing.run({ action: 'detect' }), { kind: 'unavailable', code: 'codex_unavailable' });
  assert.deepEqual(await wrongWorkspace.run({ action: 'detect' }), { kind: 'unavailable', code: 'controller_changed' });
  assert.equal(findExecutable.mock.callCount(), 1);
  assert.equal(connect.mock.callCount(), 0);
});

test('findCodex skips directories named like the executable and finds a regular executable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'codex-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binary = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const directoryBin = join(root, 'directory-bin');
  const regularBin = join(root, 'regular-bin');
  const executable = join(regularBin, binary);
  await mkdir(join(directoryBin, binary), { recursive: true });
  await mkdir(regularBin);
  await writeFile(executable, '', { mode: 0o755 });

  const { PATH, SystemRoot } = process.env;
  t.after(() => {
    if (PATH === undefined) delete process.env.PATH;
    else process.env.PATH = PATH;
    if (SystemRoot !== undefined) process.env.SystemRoot = SystemRoot;
  });
  delete process.env.SystemRoot;
  process.env.PATH = directoryBin;
  assert.equal(typeof codexRpc.findCodex, 'function');
  await assert.rejects(codexRpc.findCodex(), /codex_unavailable/);
  process.env.PATH = [directoryBin, regularBin].join(delimiter);
  assert.equal(await codexRpc.findCodex(), executable);
});

test('discover only interactive roots in the exact registered workspace and exclude DSH children', async () => {
  const mine = thread('A');
  const child = thread('DSH');
  const { run, calls } = fixture([mine, child, thread('other directory', { cwd: join(cwd, 'other') }),
    thread('agent', { parentThreadId: mine.id }), thread('agent', { source: { subAgent: {} } }),
    thread('temporary', { ephemeral: true }), thread('DSH provider', { originator: 'deepseek-harness' })], { children: [{ id: child.id }] });
  const result = await run({ action: 'list' });
  assert.deepEqual(result.rows.map((item) => item.threadId), [mine.id]);
  assert.deepEqual(calls.map((call) => call.method), ['thread/list']);
  assert.equal(calls[0].params.currentAccountOnly, true);
  assert.equal(calls[0].params.archived, false);
  assert.equal(calls[0].params.cwd, cwd);
});

test('summary attributes final messages, unknown and absent replies without resuming any thread', async () => {
  const threads = [thread('completed'), thread('failed'), thread('empty'), thread('unreadable')];
  const { run, calls } = fixture(threads, { handle(method, { threadId }) {
    if (method !== 'thread/turns/list') return;
    const i = threads.findIndex((item) => item.id === threadId);
    if (i === 3) throw Error('history unavailable');
    return { data: i === 2 ? [] : [{ id: 'turn', status: i === 0 ? 'completed' : 'failed',
      items: [{ type: 'agentMessage', phase: 'final_answer', text: 'done' }, { type: 'agentMessage', phase: 'commentary', text: 'progress' }] }] };
  } });
  const result = await run({ action: 'summary' });
  assert.deepEqual(result.rows.map((r) => r.threadId), threads.map((r) => r.id));
  assert.deepEqual(result.rows.map((r) => [r.result, r.text]), [['reply','done'],['unknown',undefined],['empty',undefined],['unknown',undefined]]);
  assert.ok(calls.every(({method}) => ['thread/list','thread/turns/list'].includes(method)));
  calls.length = 0;
  const named = await run({ action: 'summary', target: 'completed' });
  assert.deepEqual(named.rows.map((row) => row.threadId), [threads[0].id]);
  assert.deepEqual(calls.filter(({ method }) => method === 'thread/turns/list').map(({ params }) => params.threadId), [threads[0].id]);
});

test('duplicate titles never send; choosing an exact ID replies only to that turn', async () => {
  const items = [thread('same'),thread('same')];
  const { run, calls } = fixture(items);
  const message = 'Keep the original wording.';
  assert.equal((await run({ action: 'send', target: 'same', message })).kind, 'choose');
  assert.equal((await run({ action: 'send', target: 'absent', message })).code, 'target_missing');
  assert.equal((await run({ action: 'choose', threadId: items[0].id, message })).kind, 'choose');
  assert.equal(calls.some(({method}) => method === 'thread/resume' || method === 'turn/start'), false);
  const reply = await run({ action: 'send', threadId: items[1].id, message });
  assert.equal(reply.source.threadId, items[1].id);
  assert.equal(reply.turnId,'accepted-turn');
  assert.equal(reply.text, 'actual reply');
  assert.deepEqual(calls.filter(({method}) => method === 'turn/start').map(({params}) => params),
    [{ threadId: items[1].id, input: [{ type: 'text', text: message, text_elements: [] }] }]);
});

test('only the full chat title can select a thread by name', async () => {
  const prefix = 'x'.repeat(150);
  const named = thread(prefix + ' end');
  const unnamed = thread(null, { preview: prefix });
  const { run, calls } = fixture([named, unnamed]);
  assert.equal((await run({ action: 'send', target: prefix, message: 'Hello' })).code, 'target_missing');
  assert.ok(!calls.some(({ method }) => method === 'turn/start'));
  const reply = await run({ action: 'send', target: named.name, message: 'Hello' });
  assert.equal(reply.source.threadId, named.id);
  calls.length = 0;
  const moved = await run({ action: 'send', target: named.name, expectedThreadId: unnamed.id, message: 'Hello' });
  assert.equal(moved.code, 'target_changed');
  assert.ok(!calls.some(({ method }) => method === 'turn/start'));
});

test('foreign, archived-controller, stale and busy targets are refused before dispatch', async () => {
  const mine = thread('A');
  for (const f of [fixture([thread('foreign', { id: mine.id, cwd: join(cwd, 'other') })]),
    fixture([mine], { workspace: { ...workspace, id: 'other' } }), fixture([mine], { snapshot: { kind: 'existing', sessionId: 'controller', archived: true } }),
    fixture([{ ...mine, status: { type: 'active' } }]), fixture([{ ...mine, status: { type: 'notLoaded' } }]), fixture([mine], { handle: (m) => m === 'thread/read' ? { thread: thread('stale') } : undefined })]) {
    assert.equal((await f.run({ action: 'send', threadId: mine.id, message: 'follow up' })).kind, 'unavailable');
    assert.ok(!f.calls.some(({method}) => method === 'turn/start'));
  }
});

test('a lost dispatch response is unknown and never triggers another send', async () => {
  const item = thread('only');
  const { run, calls } = fixture([item], { handle(m) { if(m === 'turn/start') throw Error('codex_interrupted'); } });
  const result = await run({ action: 'send', target: 'only', message: 'text' });
  assert.equal(result.kind, 'unknown');
  assert.equal(result.source.threadId, item.id);
  assert.equal(calls.filter(({method}) => method === 'turn/start').length,1);
});

test('only the authenticated browser peer can invoke Codex RPCs', async () => {
  let service;
  let schema;
  const peer = {};
  const ctx = { provide: (_key, s) => { service = s; }, typert: { register({ invocations }) {
    schema = invocations.find((entry) => entry.method === 'codexChats').parameters[0].codec.create();
  } },
    get: () => ({ browserPeer: peer }), invocation: { peer: {} } };
  let count = 0;
  registerWorkbenchQueries(ctx, {}, { codexChats: async () => { count++; return { kind: 'sent' }; } });
  const original = '  preserve indentation\n';
  assert.deepEqual(schema.parse({ ...marker, action: 'detect' }), { ...marker, action: 'detect' });
  const input = schema.parse({ ...marker, action: 'send', threadId: randomUUID(), message: original });
  assert.equal(input.message, original);
  assert.equal(schema.safeParse({ ...input, message: '   \n' }).success, false);
  assert.equal((await service.codexChats(input)).code, 'user_action_required');
  assert.equal(count, 0);
  ctx.invocation.peer = peer;
  assert.equal((await service.codexChats(input)).kind, 'sent');
  assert.equal(count, 1);
});
