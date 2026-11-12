import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { controllerCommand, controllerProjection, controllerNoticesProjection, createController } from '../lib/controller.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'playground-controller-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const other = await mkdir(join(directory, 'other'), { recursive: true });
  const workspaces = [{ id: 'one', title: 'One', path: directory, sessionIds: [] },
    { id: 'two', title: 'Two', path: other, sessionIds: [] }];
  const archived = [];
  const live = new Map();
  const disk = new Map();
  const createRequests = [];
  const promptRequests = [];
  const admitted = new Set();
  const options = { codex: true, flush: true };
  const task = { task: { challengeId: 'fixture' }, prepared: null, receipt: { attemptId: 42 }, attemptIds: [42] };
  const snapshot = (marker, playgroundTask = { task: null }, blank = false) => ({ kind: 'sequenced', asOfSeq: 4,
    values: { playgroundController: marker, playgroundTask, playgroundControllerNotices: [], sessionListMetadata: { blank } } });
  function put(workspaceId, sessionId, value) {
    workspaces.find((item) => item.id === workspaceId).sessionIds.push(sessionId);
    disk.set(sessionId, value);
  }
  let controller;
  const ctx = {
    workspaceRegistry: { list: () => workspaces, archivedSessionIds: archived, resolveByPath: async (path) => workspaces.find((item) => item.path === path) },
    sessionController: {
      async projections({ sessionId }, signal) {
        signal.throwIfAborted();
        if (options.brokenRead === sessionId) throw Error('projection unreadable');
        const found = live.get(sessionId);
        return found ? snapshot(found.marker && 'marker' in found.marker ? found.marker.marker : found.marker, undefined, found.blank) : disk.get(sessionId) ?? null;
      },
      async create(request) {
        createRequests.push(request);
        const sessionId = `session-${createRequests.length}`;
        const workspace = workspaces.find((item) => item.id === request.workspaceId);
        live.set(sessionId, { agent: { id: sessionId, session: { id: sessionId, cwd: workspace.path } }, marker: controllerProjection.init({ id: sessionId }, 0), blank: true });
        if (options.attachFails) throw Object.assign(Error('attach'), { code: 'session/workspace-attach-failed', details: { sessionId } });
        workspace.sessionIds.push(sessionId);
        return { sessionId };
      },
      async rename({ sessionId, title }) { live.get(sessionId).title = title; },
      async prompt(request, signal) {
        signal.throwIfAborted();
        promptRequests.push(request);
        if (options.rejectPrompt) return { accepted: false };
        const { sessionId, requestId } = request;
        if (!live.has(sessionId)) {
          const workspace = workspaces.find((item) => item.sessionIds.includes(sessionId));
          live.set(sessionId, { agent: { id: sessionId, session: { id: sessionId, cwd: workspace.path } },
            marker: { ...controllerProjection.init({ id: sessionId }, 0), marker: disk.get(sessionId).values.playgroundController }, blank: true });
        }
        admitted.add(requestId);
        live.get(sessionId).blank = false;
        if (options.loseAcknowledgement) throw Error('prompt acknowledgement lost');
        return { accepted: true };
      },
    },
    agents: { get: (sessionId) => live.get(sessionId)?.agent },
    sessionProjections: { stateOf(session, key) {
      const entry = live.get(session.id);
      if (key === 'playgroundController') return entry?.marker;
      if (key === 'sessionListMetadata') return { blank: entry.blank };
      return entry?.task ?? { task: null };
    } },
    workingDirectory: { get: (session) => session.cwd },
    commands: { async execute(agent, input) {
      assert.equal(input, `/${controllerCommand}`);
      const entry = live.get(agent.id);
      const result = options.markerFails ? { kind: 'error', text: 'marker unavailable' } : controller.initialize({ agent });
      entry.marker = controllerProjection.apply(entry.marker, { seq: 0, type: 'command/done', data: { commandId: 'cmd-1', ...result } });
      return { commandId: 'cmd-1', result };
    } },
    get: (name) => ({
      sessions: { async flush(session) {
        if (!options.flush) return false;
        options.enteredFlush?.();
        if (options.flushGate) await options.flushGate;
        const entry = live.get(session.id);
        disk.set(session.id, snapshot(entry.marker && 'marker' in entry.marker ? entry.marker.marker : entry.marker, undefined, entry.blank));
        return true;
      } },
      subagents: options.codex ? { getProvider: (id) => id === 'codex' && { id } } : undefined,
    })[name],
  };
  const restart = () => { live.clear(); controller = createController(ctx); return controller; };
  return { controller: restart(), restart, ctx, archived, live, disk, workspaces, createRequests, promptRequests, admitted, options, task, snapshot, put };
}

const open = (controller, workspaceId = 'one', createIfMissing = true) => controller.open({ workspaceId, createIfMissing });

test('explicit concurrent creation writes one native session and cold reopening keeps its id', async (t) => {
  const f = await fixture(t);
  f.put('one', 'challenge', f.snapshot(null, f.task));
  assert.deepEqual(await f.controller.inspect({ workspaceId: 'one' }), { kind: 'absent', codex: 'registered' });
  assert.equal((await open(f.controller, 'one', false)).code, 'controller_missing');
  let finishFlush;
  f.options.flushGate = new Promise((resolve) => { finishFlush = resolve; });
  const enteredFlush = new Promise((resolve) => { f.options.enteredFlush = resolve; });
  const first = open(f.controller);
  const second = open(f.controller);
  let settled = false;
  void first.then(() => { settled = true; });
  await enteredFlush;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  finishFlush();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results, [{ kind: 'opened', sessionId: 'session-1', created: true }, { kind: 'opened', sessionId: 'session-1', created: false }]);
  assert.equal(f.promptRequests.length, 1);
  const [prompt] = f.promptRequests;
  assert.equal(prompt.sessionId, 'session-1');
  assert.equal(prompt.mode, 'queue');
  assert.equal(prompt.content.length, 1);
  assert.match(prompt.content[0].text, /只回复.+请勿调用工具、查看文件、派发任务或提交/);
  assert.equal(f.disk.get('session-1').values.sessionListMetadata.blank, false);
  assert.equal((await open(f.controller, 'one', false)).sessionId, 'session-1');
  const other = await open(f.controller, 'two');
  assert.equal(other.sessionId, 'session-2');
  assert.deepEqual(f.createRequests, [{ workspaceId: 'one' }, { workspaceId: 'two' }]);
  assert.deepEqual(f.disk.get('challenge').values.playgroundTask, f.task);
  const cold = f.restart();
  assert.deepEqual(await open(cold, 'one', false), { kind: 'opened', sessionId: 'session-1', created: false });
  assert.deepEqual(await open(cold, 'two', false), { kind: 'opened', sessionId: 'session-2', created: false });
  assert.deepEqual(f.promptRequests.map(({ sessionId }) => sessionId), ['session-1', 'session-2']);
});

test('forks do not own inherited controller markers and archived controllers are never replaced', async (t) => {
  const f = await fixture(t);
  const marker = { workspaceId: 'one', sessionId: 'original' };
  f.put('one', 'original', f.snapshot(marker));
  f.put('one', 'fork', f.snapshot(marker));
  f.archived.push('original');
  f.options.codex = false;
  assert.deepEqual(await f.controller.inspect({ workspaceId: 'one' }),
    { kind: 'existing', sessionId: 'original', archived: true, codex: 'unavailable' });
  assert.deepEqual((await open(f.controller)).sessionIds, ['original']);
  assert.equal((await open(f.controller)).code, 'controller_archived');
  assert.deepEqual(f.createRequests, []);
  const fork = { id: 'fork', session: { id: 'fork', cwd: f.workspaces[0].path } };
  f.live.set('fork', { agent: fork, marker: { ...controllerProjection.init({ id: 'fork' }, 0), marker } });
  assert.equal(f.controller.owns(fork), false);
  assert.equal(f.controller.context(fork), '');
  f.archived.pop();
  assert.equal((await open(f.controller)).sessionId, 'original');
});

test('unknown, migrated, wrong-workspace and conflicting records cannot justify creation', async (t) => {
  const f = await fixture(t);
  assert.equal((await open(f.controller, 'removed')).code, 'workspace_missing');
  f.put('one', 'legacy', { kind: 'migration-required', values: { playgroundController: null } });
  f.options.brokenRead = 'legacy';
  assert.equal((await open(f.controller)).code, 'projection_unavailable');
  f.options.brokenRead = undefined;
  assert.equal((await open(f.controller)).code, 'migration_required');
  f.disk.set('legacy', { kind: 'sequenced', asOfSeq: 2, values: {} });
  assert.equal((await open(f.controller)).code, 'projection_unavailable');
  f.disk.set('legacy', f.snapshot({ workspaceId: 'two', sessionId: 'legacy' }));
  assert.equal((await open(f.controller)).code, 'controller_conflict');
  f.disk.set('legacy', f.snapshot({ workspaceId: 'one', sessionId: 'legacy' }, f.task));
  assert.equal((await open(f.controller)).code, 'controller_conflict');
  f.disk.set('legacy', f.snapshot({ workspaceId: 'one', sessionId: 'legacy' }));
  f.put('one', 'other', f.snapshot({ workspaceId: 'one', sessionId: 'other' }));
  assert.deepEqual((await open(f.controller)).sessionIds, ['legacy', 'other']);
  assert.deepEqual(f.createRequests, []);
});

test('partial initialization retains its native id and can retry until persistence succeeds', async (t) => {
  const f = await fixture(t);
  f.options.markerFails = true;
  const failed = await open(f.controller);
  assert.equal(failed.code, 'controller_init_failed');
  assert.deepEqual(failed.sessionIds, ['session-1']);
  assert.equal(f.controller.owns(f.live.get('session-1').agent), true);
  assert.equal((await f.controller.inspect({ workspaceId: 'one' })).kind, 'incomplete');
  assert.equal((await open(f.controller, 'one', false)).code, 'controller_init_required');
  f.options.markerFails = false;
  f.options.flush = false;
  assert.deepEqual((await open(f.controller)).sessionIds, ['session-1']);
  assert.equal(f.disk.has('session-1'), false);
  assert.deepEqual(f.promptRequests, []);
  f.options.flush = true;
  assert.equal((await open(f.controller)).sessionId, 'session-1');
  assert.equal((await open(f.restart(), 'one', false)).sessionId, 'session-1');
  assert.deepEqual(f.createRequests, [{ workspaceId: 'one' }]);
});

test('a cold command-only controller requires explicit initialization and keeps the original session', async (t) => {
  const f = await fixture(t);
  const sessionId = 'old-controller';
  f.put('one', sessionId, f.snapshot({ workspaceId: 'one', sessionId }, undefined, true));
  assert.deepEqual(await f.controller.inspect({ workspaceId: 'one' }), { kind: 'incomplete', sessionId, codex: 'registered' });
  const blocked = await open(f.controller, 'one', false);
  assert.equal(blocked.code, 'controller_init_required');
  assert.deepEqual(blocked.sessionIds, [sessionId]);
  assert.deepEqual(f.promptRequests, []);
  const initialized = { kind: 'opened', sessionId, created: false };
  assert.deepEqual(await open(f.controller), initialized);
  assert.deepEqual(await open(f.restart(), 'one', false), initialized);
  assert.deepEqual(f.createRequests, []);
  assert.deepEqual(f.promptRequests.map((request) => request.sessionId), [sessionId]);
});

test('an initialization retry reuses the request id and skips prompting after a turn starts', async (t) => {
  const f = await fixture(t);
  f.options.rejectPrompt = true;
  const rejected = await open(f.controller);
  assert.equal(rejected.code, 'controller_init_failed');
  assert.deepEqual(rejected.sessionIds, ['session-1']);
  assert.equal(f.disk.get('session-1').values.sessionListMetadata.blank, true);
  f.options.rejectPrompt = false;
  f.options.loseAcknowledgement = true;
  const uncertain = await open(f.controller);
  assert.equal(uncertain.code, 'controller_init_failed');
  assert.deepEqual(uncertain.sessionIds, rejected.sessionIds);
  assert.equal(f.promptRequests.length, 2);
  assert.equal(f.promptRequests[0].requestId, f.promptRequests[1].requestId);
  assert.equal(f.admitted.size, 1);
  assert.equal((await open(f.controller)).sessionId, 'session-1');
  assert.equal(f.promptRequests.length, 2);
  assert.equal((await open(f.restart(), 'one', false)).sessionId, 'session-1');
  assert.deepEqual(f.createRequests, [{ workspaceId: 'one' }]);
});

test('a native workspace attach failure reports its created session instead of creating another', async (t) => {
  const f = await fixture(t);
  f.options.attachFails = true;
  const first = await open(f.controller);
  assert.equal(first.code, 'controller_attach_failed');
  assert.deepEqual(first.sessionIds, ['session-1']);
  assert.deepEqual(await open(f.controller), first);
  assert.deepEqual(f.createRequests, [{ workspaceId: 'one' }]);
});

test('the native controller prompt directs Codex only while the registered workspace matches', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const { agent } = f.live.get(sessionId);
  const context = f.controller.context(agent);
  assert.ok(context.includes(JSON.stringify(f.workspaces[0].path)));
  assert.match(context, /subagent_codex/);
  assert.match(context, /terminal result or error/);
  assert.match(context, /Do not delegate Playground submissions/);
  assert.equal(f.controller.initialize({ agent }).kind, 'error', 'chat commands cannot reinitialize the controller');
  agent.session.cwd = `${f.workspaces[0].path}/.`;
  assert.match(f.controller.context(agent), /subagent_codex/, 'directory aliases retain controller guidance');
  agent.session.cwd = f.workspaces[1].path;
  assert.match(f.controller.context(agent), /no longer matches its registered workspace/);
  assert.doesNotMatch(f.controller.context(agent), /subagent_codex/);
});


test('projection replays only the current session marker after its inherited prefix', () => {
  let state = controllerProjection.init({ id: 'fork' }, 2);
  const marker = (seq, sessionId) => ({ seq, type: 'command/done', data: { kind: 'success', text: JSON.stringify({ playgroundController: { workspaceId: 'one', sessionId } }) } });
  state = controllerProjection.apply(state, marker(0, 'ancestor'));
  state = controllerProjection.apply(state, marker(2, 'fork'));
  assert.deepEqual(controllerProjection.wire.view(state), { workspaceId: 'one', sessionId: 'fork' });
  assert.equal(controllerProjection.stateVersion, 2);
});

test('promotion preserves a nonblank conversation and is idempotent', async (t) => {
  const f = await fixture(t);
  const sessionId = 'ordinary';
  f.workspaces[0].sessionIds.push(sessionId);
  f.live.set(sessionId, { agent: { id: sessionId, session: { id: sessionId, cwd: f.workspaces[0].path } }, marker: controllerProjection.init({ id: sessionId }, 0), blank: false });
  const result = await f.controller.promote({ sessionId });
  assert.deepEqual(result, { kind: 'opened', sessionId, created: false });
  assert.deepEqual(await f.controller.promote({ sessionId }), result);
  assert.equal(f.promptRequests.length, 0);
  assert.equal(f.createRequests.length, 0);
  assert.equal(f.live.get(sessionId).title, undefined);
});

test('promotion refuses challenge evidence and serializes with creation', async (t) => {
  const f = await fixture(t);
  const sessionId = 'ordinary';
  f.workspaces[0].sessionIds.push(sessionId);
  const entry = { agent: { id: sessionId, session: { id: sessionId, cwd: f.workspaces[0].path } }, marker: controllerProjection.init({ id: sessionId }, 0), blank: false, task: { task: null, prepared: null, receipt: null, attemptIds: [7] } };
  f.live.set(sessionId, entry);
  assert.equal((await f.controller.promote({ sessionId })).code, 'controller_conflict');
  entry.task = { task: null };
  const [promoted, opened] = await Promise.all([f.controller.promote({ sessionId }), open(f.controller)]);
  assert.equal(promoted.sessionId, opened.sessionId);
  assert.ok(f.createRequests.length <= 1);
});

test('task rows require catalog membership and preserve notice and observed terminal evidence', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { getProvider: () => ({}), listChildren: async () => [{ id: 'child', createdAt: 1, mode: 'external', label: 'Work' }] } : previous(name);
  const previousRead = f.ctx.sessionController.projections;
  f.ctx.sessionController.projections = async (...args) => {
    const result = await previousRead(...args);
    result.values.playgroundControllerNotices = [{ childId: 'child', text: 'actual result' }, { childId: 'other', text: 'not owned' }];
    return result;
  };
  f.controller.observeStart({ id: 'other', runId: 'x', provider: 'codex' });
  f.controller.observeEnd({ id: 'child', runId: 'run', provider: 'codex', stopReason: 'error' });
  const result = await f.controller.tasks({ workspaceId: 'one', sessionId });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].state, 'settled');
  assert.equal(result.rows[0].terminalText, 'actual result');
  assert.equal(result.rows[0].liveEnd.stopReason, 'error');
  assert.deepEqual(await f.controller.tasks({ workspaceId: 'two', sessionId }), { kind: 'unavailable' });
  f.controller.observeStart({ id: 'child', runId: 'new', provider: 'codex' });
  assert.equal((await f.controller.tasks({ workspaceId: 'one', sessionId })).rows[0].state, 'running');
});

test('settlement projection excludes inherited events and keeps bounded text', () => {
  let state = controllerNoticesProjection.init({ id: 'fork' }, 1);
  const event = (seq, id) => ({ seq, type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'subagent-settled', senderSessionId: id }, content: [{ type: 'text', text: 'result' }] }] } });
  state = controllerNoticesProjection.apply(state, event(0, 'ancestor-child'));
  state = controllerNoticesProjection.apply(state, event(1, 'own-child'));
  assert.deepEqual(controllerNoticesProjection.wire.view(state), [{ childId: 'own-child', text: 'result' }]);
});


test('a failed promotion flush retries without renaming or prompting', async (t) => {
  const f = await fixture(t);
  const sessionId = 'ordinary';
  f.workspaces[0].sessionIds.push(sessionId);
  f.live.set(sessionId, { agent: { id: sessionId, session: { id: sessionId, cwd: f.workspaces[0].path } }, marker: controllerProjection.init({ id: sessionId }, 0), blank: false });
  f.options.flush = false;
  assert.equal((await f.controller.promote({ sessionId })).code, 'controller_init_failed');
  f.options.flush = true;
  assert.equal((await f.controller.promote({ sessionId })).sessionId, sessionId);
  assert.equal(f.live.get(sessionId).title, undefined);
  assert.equal(f.promptRequests.length, 0);
});


test('verified cold controllers retain their direct task history', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { getProvider: () => ({}), listChildren: async () => [{ id: 'child', createdAt: 1, mode: 'external' }] } : previous(name);
  f.disk.get(sessionId).values.playgroundControllerNotices = [{ childId: 'child', text: 'saved result' }];
  const result = await f.restart().tasks({ workspaceId: 'one', sessionId });
  assert.equal(result.kind, 'ready');
  assert.equal(result.rows[0].state, 'settled');
  assert.equal(result.rows[0].terminalText, 'saved result');
});
