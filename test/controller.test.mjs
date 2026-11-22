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
  const challengeReads = [];
  const client = { baseUrl: 'https://playground.example.test/api', getChallenge: async (id, request) => {
    challengeReads.push([id, request]);
    if (id === 'missing') throw Object.assign(Error('not found'), { code: 'not_found' });
    return { id, title: 'Same title' };
  } };
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
      async resolveAgent(sessionId) {
        const workspace = workspaces.find((item) => item.sessionIds.includes(sessionId));
        const value = disk.get(sessionId)?.values;
        if (!workspace || !value) return { error: new Error('not found') };
        const agent = { id: sessionId, session: { id: sessionId, cwd: options.resumeCwd || workspace.path } };
        live.set(sessionId, { agent, marker: { ...controllerProjection.init({ id: sessionId }, 0),
          marker: value.playgroundController && { workspaceId: value.playgroundController.workspaceId, sessionId },
          ...(value.playgroundController?.taskChallenges ? { taskChallenges: value.playgroundController.taskChallenges } : {}) }, blank: value.sessionListMetadata.blank, task: value.playgroundTask });
        return { agent };
      },
      async projections({ sessionId }, signal) {
        signal.throwIfAborted();
        if (options.brokenRead === sessionId) throw Error('projection unreadable');
        const found = live.get(sessionId);
        return found ? snapshot(found.marker && 'marker' in found.marker ? controllerProjection.wire.view(found.marker) : found.marker, undefined, found.blank) : disk.get(sessionId) ?? null;
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
        disk.set(session.id, snapshot(entry.marker && 'marker' in entry.marker ? controllerProjection.wire.view(entry.marker) : entry.marker, undefined, entry.blank));
        return true;
      } },
      subagents: options.codex ? { getProvider: (id) => id === 'codex' && { id } } : undefined,
    })[name],
  };
  const restart = () => { live.clear(); controller = createController(ctx, undefined, client); return controller; };
  return { controller: restart(), restart, ctx, client, challengeReads, archived, live, disk, workspaces, createRequests, promptRequests, admitted, options, task, snapshot, put };
}

const open = (controller, workspaceId = 'one', createIfMissing = true) => controller.open({ workspaceId, createIfMissing });

const handoff = { workspaceId: 'one', sessionId: 'controller', challengeId: 'a b/c', requestId: '98bcdf27-3bfb-4120-8ad2-06c2eca5810d' };

test('handoff resumes the exact initialized workspace controller and queues a retry-safe challenge prompt', async (t) => {
  const f = await fixture(t);
  f.put('one', 'controller', f.snapshot({ workspaceId: 'one', sessionId: 'controller' }));
  f.put('two', 'other', f.snapshot({ workspaceId: 'two', sessionId: 'other' }));
  f.options.loseAcknowledgement = true;
  await assert.rejects(f.controller.dispatch(handoff), /acknowledgement lost/);
  f.options.loseAcknowledgement = false;
  assert.deepEqual(await f.controller.dispatch(handoff), { kind: 'accepted', sessionId: 'controller' });
  assert.equal(f.live.has('other'), false);
  assert.equal(f.createRequests.length, 0);
  assert.equal(f.admitted.size, 1);
  assert.deepEqual(f.promptRequests.map(({ sessionId, requestId, mode }) => [sessionId, requestId, mode]),
    Array(2).fill(['controller', `playground-dispatch:${handoff.requestId}`, 'queue']));
  assert.match(f.promptRequests[0].content[0].text, /"a b\/c".*子智能体.*专用子目录.*不授权提交评测/);
});

test('handoff rejects missing, archived, stale, conflicting and uninitialized controller targets', async (t) => {
  const f = await fixture(t);
  const { workspaceId, sessionId } = handoff;
  const marker = { workspaceId, sessionId };
  assert.equal((await f.controller.dispatch({ ...handoff, workspaceId: 'removed' })).code, 'workspace_missing');
  assert.equal((await f.controller.dispatch(handoff)).code, 'controller_missing');
  f.put(workspaceId, sessionId, f.snapshot(marker, undefined, true));
  assert.equal((await f.controller.dispatch(handoff)).code, 'controller_init_required');
  f.disk.set(sessionId, f.snapshot(marker));
  assert.equal((await f.controller.dispatch({ ...handoff, sessionId: 'wrong' })).code, 'controller_changed');
  f.archived.push(sessionId);
  assert.equal((await f.controller.dispatch(handoff)).code, 'controller_archived');
  f.archived.pop();
  f.options.resumeCwd = f.workspaces[1].path;
  assert.equal((await f.controller.dispatch(handoff)).code, 'workspace_mismatch');
  f.live.delete(sessionId);
  f.put(workspaceId, 'second', f.snapshot({ workspaceId, sessionId: 'second' }));
  assert.equal((await f.controller.dispatch(handoff)).code, 'controller_conflict');
  assert.deepEqual(f.promptRequests, []);
  assert.deepEqual(f.createRequests, []);
});

test('handoff reports a native rejection and never claims admission', async (t) => {
  const f = await fixture(t);
  const { workspaceId, sessionId } = handoff;
  f.put(workspaceId, sessionId, f.snapshot({ workspaceId, sessionId }));
  f.options.rejectPrompt = true;
  assert.equal((await f.controller.dispatch(handoff)).code, 'dispatch_rejected');
  assert.equal(f.promptRequests.length, 1);
  assert.equal(f.admitted.size, 0);
});

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

test('a cancelled dispatch waits behind initialization and sends no prompt', async (t) => {
  const f = await fixture(t);
  const enteredFlush = Promise.withResolvers();
  const finishFlush = Promise.withResolvers();
  f.options.enteredFlush = enteredFlush.resolve;
  f.options.flushGate = finishFlush.promise;
  const execute = f.ctx.commands.execute;
  let ownsBeforeMarker;
  f.ctx.commands.execute = (agent, ...args) => {
    ownsBeforeMarker = f.controller.owns(agent);
    return execute(agent, ...args);
  };

  const openingAbort = new AbortController();
  const request = { ...handoff, sessionId: 'session-1' };
  const opening = f.controller.open({ workspaceId: request.workspaceId, createIfMissing: true }, openingAbort.signal);
  await Promise.race([enteredFlush.promise, opening]);

  const dispatchAbort = new AbortController();
  const cancelled = f.controller.dispatch(request, dispatchAbort.signal);
  let dispatchSettled = false;
  void cancelled.finally(() => { dispatchSettled = true; }).catch(() => {});
  openingAbort.abort();
  dispatchAbort.abort();
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ownsBeforeMarker, true);
    assert.equal(dispatchSettled, false);
    assert.deepEqual(f.promptRequests, []);
  } finally {
    finishFlush.resolve();
  }
  assert.deepEqual(await opening, { kind: 'opened', sessionId: 'session-1', created: true });
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.deepEqual(f.promptRequests.map(({ requestId }) => requestId), ['playground-controller:session-1']);
  assert.deepEqual(await f.controller.dispatch(request), { kind: 'accepted', sessionId: 'session-1' });
  assert.deepEqual(f.promptRequests.map(({ requestId }) => requestId),
    ['playground-controller:session-1', `playground-dispatch:${request.requestId}`]);
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

test('controller guidance delegates solution work to a separate DSH child when Codex cannot run', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const { agent } = f.live.get(sessionId);
  const context = f.controller.context(agent);
  assert.ok(context.includes(JSON.stringify(f.workspaces[0].path)));
  assert.match(context, /subagent_codex/);
  assert.match(context, /playground_controller_link_task.*explicit challenge_id/);
  assert.doesNotMatch(context, /base_url/);
  assert.match(context, /native DSH subagent tool.*Codex is unavailable.*fresh separate DSH conversation/);
  assert.match(context, /If Codex cannot start or ends with a failure.*delegate the unfinished work/);
  assert.match(context, /Never solve the challenge in this controller conversation/);
  assert.match(context, /task conversation for the specific challenge.*playground_task materials.*authorized paths/);
  assert.match(context, /Ask the user to grant access through Playground Workbench.*outside the workspace/);
  assert.match(context, /The Agent in that task conversation submits only after an explicit user request/);
  assert.match(context, /official CLI or API.*inspection, packaging, and upload/);
  assert.match(context, /playground_task status.*submitPolicy\.announcement.*additional user confirmation/);
  assert.match(context, /The plugin records authorized material references only/);
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
  const legacyMarker = { workspaceId: 'one', sessionId: 'fork' };
  assert.deepEqual(controllerProjection.wire.view(state), legacyMarker);
  const legacyState = { sessionId: 'fork', inheritedEventCount: 2, marker: legacyMarker };
  assert.deepEqual(controllerProjection.stateSchema.parse(legacyState), legacyState);
  assert.deepEqual(controllerProjection.wire.viewSchema.parse(legacyMarker), legacyMarker);
  assert.equal(controllerProjection.key, 'playgroundController');
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
  assert.equal(result.rows[0].state, 'ended');
  assert.equal(result.rows[0].terminalText, 'actual result');
  assert.equal(result.rows[0].liveEnd.stopReason, 'error');
  assert.deepEqual(await f.controller.tasks({ workspaceId: 'two', sessionId }), { kind: 'unavailable' });
  f.controller.observeStart({ id: 'child', runId: 'new', provider: 'codex' });
  assert.equal((await f.controller.tasks({ workspaceId: 'one', sessionId })).rows[0].state, 'running');
});

test('settlement projection excludes inherited events and keeps bounded text', () => {
  let state = controllerNoticesProjection.init({ id: 'fork' }, 1);
  const event = (seq, id, text = 'result') => ({ seq, type: 'agent/inbox/spliced', data: { inserted: [{
    source: { kind: 'subagent-settled', senderSessionId: id }, content: [{ type: 'text', text }],
  }] } });
  state = controllerNoticesProjection.apply(state, event(0, 'ancestor-child'));
  state = controllerNoticesProjection.apply(state, event(1, 'own-child'));
  const legacyNotices = [{ childId: 'own-child', text: 'result' }];
  assert.deepEqual(controllerNoticesProjection.wire.view(state), legacyNotices);
  const legacyState = { inheritedEventCount: 1, notices: legacyNotices };
  assert.deepEqual(controllerNoticesProjection.stateSchema.parse(legacyState), legacyState);
  assert.deepEqual(controllerNoticesProjection.wire.viewSchema.parse(legacyNotices), legacyNotices);
  assert.equal(controllerNoticesProjection.key, 'playgroundControllerNotices');
  assert.equal(controllerNoticesProjection.stateVersion, 2);

  for (let seq = 2; seq <= 100; seq++) {
    state = controllerNoticesProjection.apply(state, event(seq, `child-${seq}`));
  }
  const textLimit = 'x'.repeat(12_000);
  state = controllerNoticesProjection.apply(state, event(101, 'last-child', textLimit + 'overflow'));
  const notices = controllerNoticesProjection.wire.view(state);
  assert.equal(notices.length, 100);
  assert.equal(notices[0].childId, 'child-2');
  assert.deepEqual(notices.at(-1), { childId: 'last-child', text: textLimit });
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

test('structured notice stop reasons survive projection replay and controller recreation', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const reasons = ['error', 'aborted', 'max-tokens', 'refusal', 'completed', 'provider-specific', undefined];
  const children = reasons.map((_, index) => ({ id: `child-${index}`, createdAt: index, mode: 'external' }));
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { listChildren: async () => children } : previous(name);
  let state = controllerNoticesProjection.init({ id: sessionId }, 0);
  for (const [index, stopReason] of reasons.entries()) {
    state = controllerNoticesProjection.apply(state, { seq: index, type: 'agent/inbox/spliced', data: { inserted: [{
      source: { kind: 'subagent-settled', senderSessionId: `child-${index}`, ...(stopReason ? { stopReason } : {}) },
      content: [{ type: 'text', text: 'The task succeeded. Do not infer a stop reason from this text.' }],
    }] } });
  }
  f.disk.get(sessionId).values.playgroundControllerNotices = JSON.parse(JSON.stringify(controllerNoticesProjection.wire.view(state)));
  const result = await f.restart().tasks({ workspaceId: 'one', sessionId });
  assert.equal(result.kind, 'ready');
  assert.deepEqual(result.rows.map((row) => row.noticeStopReason), reasons);
  assert.ok(result.rows.every((row) => row.state === 'settled' && !row.liveEnd));
  assert.ok(result.rows.every((row) => row.noticeIsHistorical === true));
  assert.equal(f.createRequests.length, 1);
  assert.equal(f.promptRequests.length, 1);
  assert.equal(controllerNoticesProjection.stateVersion, 2);
});

test('notices without a structured string reason remain compatible and do not guess from text', () => {
  for (const stopReason of [undefined, null, 17, { kind: 'error' }]) {
    const state = controllerNoticesProjection.apply(controllerNoticesProjection.init({ id: 'parent' }, 0), {
      seq: 0, type: 'agent/inbox/spliced', data: { inserted: [{
        source: { kind: 'subagent-settled', senderSessionId: 'child', stopReason },
        content: [{ type: 'text', text: 'Background subagent child failed before it finished.' }],
      }] },
    });
    assert.deepEqual(controllerNoticesProjection.wire.view(state), [{ childId: 'child', text: 'Background subagent child failed before it finished.' }]);
  }
});

test('an earlier notice is historical while a newer round runs and after its observed end', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { listChildren: async () => [{ id: 'child', createdAt: 1, mode: 'continuable' }] } : previous(name);
  const read = f.ctx.sessionController.projections;
  f.ctx.sessionController.projections = async (...args) => {
    const value = await read(...args);
    value.values.playgroundControllerNotices = [{ childId: 'child', text: 'earlier result', stopReason: 'error' }];
    return value;
  };
  f.controller.observeStart({ id: 'child', runId: 'new', provider: 'dsh' });
  let row = (await f.controller.tasks({ workspaceId: 'one', sessionId })).rows[0];
  assert.equal(row.state, 'running');
  assert.equal(row.noticeStopReason, 'error');
  assert.equal(row.noticeIsHistorical, true);
  assert.equal(row.liveEnd, undefined);
  f.controller.observeEnd({ id: 'child', runId: 'old', provider: 'dsh', stopReason: 'error' });
  assert.equal((await f.controller.tasks({ workspaceId: 'one', sessionId })).rows[0].state, 'running');
  f.controller.observeEnd({ id: 'child', runId: 'new', provider: 'dsh', stopReason: 'completed' });
  row = (await f.controller.tasks({ workspaceId: 'one', sessionId })).rows[0];
  assert.equal(row.state, 'ended');
  assert.equal(row.liveEnd.stopReason, 'completed');
  assert.equal(row.noticeStopReason, 'error');
  assert.equal(row.terminalText, 'earlier result');
  assert.equal(row.noticeIsHistorical, false);
  assert.equal(f.createRequests.length, 1);
  assert.equal(f.promptRequests.length, 1);
});

test('passive resident local running evidence wins while idle, absent and external status prove no outcome', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const children = [
    { id: 'running', createdAt: 1, mode: 'continuable' },
    { id: 'idle', createdAt: 1, mode: 'one-shot' },
    { id: 'missing', createdAt: 1, mode: 'continuable' },
    { id: 'external', createdAt: 1, mode: 'external' },
  ];
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { listChildren: async () => children } : previous(name);
  const controller = f.restart();
  const read = f.ctx.sessionController.projections;
  f.ctx.sessionController.projections = async (...args) => {
    const value = await read(...args);
    value.values.playgroundControllerNotices = [{ childId: 'running', text: 'older error', stopReason: 'error' }];
    return value;
  };
  for (const id of ['running', 'idle', 'external']) f.live.set(id, { agent: { id, status: id === 'idle' ? 'idle' : 'running' } });
  const result = await controller.tasks({ workspaceId: 'one', sessionId });
  assert.deepEqual(result.rows.map((row) => row.state), ['running', 'unknown', 'unknown', 'unknown']);
  assert.equal(result.rows[0].noticeStopReason, 'error');
  assert.equal(result.rows[0].liveEnd, undefined);
  assert.equal(f.live.has(sessionId), false, 'reading tasks does not activate the cold parent');
  assert.equal(f.createRequests.length, 1);
  assert.equal(f.promptRequests.length, 1);
});

test('a newer resident round keeps the previously observed end as history without dispatching', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { listChildren: async () => [{ id: 'child', createdAt: 1, mode: 'continuable' }] } : previous(name);
  f.controller.observeEnd({ id: 'child', runId: 'previous', provider: 'dsh', stopReason: 'error', lastAssistantMessage: [{ type: 'text', text: 'previous output' }] });
  const before = (await f.controller.tasks({ workspaceId: 'one', sessionId })).rows[0];
  assert.equal(before.state, 'ended');
  f.live.set('child', { agent: { id: 'child', status: 'running' } });
  const after = (await f.controller.tasks({ workspaceId: 'one', sessionId })).rows[0];
  assert.equal(after.state, 'running');
  assert.deepEqual(after.liveEnd, before.liveEnd);
  assert.equal(f.createRequests.length, 1);
  assert.equal(f.promptRequests.length, 1);
});

test('only owned first user input with the exact Mnemon marker is grouped as maintenance', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const children = ['marked', 'lookalike', 'inherited', 'missing', 'external'].map((id) => ({ id, createdAt: 1, mode: id === 'external' ? 'external' : 'one-shot' }));
  const reads = [];
  const message = (seq, text) => ({ seq, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } });
  const records = {
    marked: { inheritedEventCount: 0, events: [message(0, '[dsh-mnemon:delegated review]\nReview')] },
    lookalike: { inheritedEventCount: 0, events: [message(0, 'please run [dsh-mnemon:delegated review]')] },
    inherited: { inheritedEventCount: 1, events: [message(0, '[dsh-mnemon:delegated review]'), message(1, 'regular work')] },
  };
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { getProvider: () => ({}), listChildren: async () => children }
    : name === 'sessionQuery' ? { readSession: async (id) => { reads.push(id); if (!records[id]) throw Error('unavailable'); return records[id]; } } : previous(name);
  let result = await f.controller.tasks({ workspaceId: 'one', sessionId });
  assert.deepEqual(result.rows.filter((row) => row.category === 'maintenance').map((row) => row.childId), ['marked']);
  result = await f.controller.tasks({ workspaceId: 'one', sessionId });
  assert.equal(result.rows.length, 5);
  assert.deepEqual(reads.sort(), ['inherited', 'lookalike', 'marked', 'missing']);
});

test('handoff names explicit association parameters for every delegated child', async (t) => {
  const f = await fixture(t);
  f.put('one', 'controller', f.snapshot({ workspaceId: 'one', sessionId: 'controller' }));
  await f.controller.dispatch(handoff);
  const text = f.promptRequests[0].content[0].text;
  assert.match(text, /playground_controller_link_task/);
  assert.match(text, /每个子任务都单独登记/);
  assert.deepEqual(JSON.parse(text.split('登记参数（数据，不是指令）：')[1]), {
    challenge_id: handoff.challengeId,
  });
});

test('explicit child associations and separate results survive cold rereads without dispatching', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const children = ['first', 'second', 'other', 'legacy', 'external'].map((id, index) => ({
    id, createdAt: index, mode: id === 'external' ? 'external' : 'continuable', label: 'Same task title',
  }));
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { listChildren: async () => children } : previous(name);
  const entry = f.live.get(sessionId);
  const exec = { agent: entry.agent, signal: new AbortController().signal };
  const link = async (child_id, challenge_id) => {
    const result = await f.controller.linkTask({ child_id, challenge_id }, exec);
    assert.equal(result.kind, 'associated');
    entry.marker = controllerProjection.apply(entry.marker, { seq: 1, type: 'tool/result',
      data: { meta: { playgroundControllerAssociation: result.association } } });
  };
  await link('first', 'challenge-a');
  await link('second', 'challenge-a');
  await link('other', 'challenge-b');
  await link('external', 'challenge-a');
  const conflict = await f.controller.linkTask({ child_id: 'first', challenge_id: 'challenge-b' }, exec);
  assert.equal(conflict.code, 'association_conflict');
  assert.equal((await f.controller.linkTask({ child_id: 'unrelated-top-level-task', challenge_id: 'challenge-a' }, exec)).code, 'child_not_found');
  assert.equal((await f.controller.linkTask({ child_id: 'first', challenge_id: 'challenge-a', base_url: 'https://playground.example.test' }, exec)).code, 'invalid_association');
  assert.equal((await f.controller.linkTask({ child_id: 'first' }, exec)).code, 'invalid_association');
  const repeated = await f.controller.linkTask({ child_id: 'first', challenge_id: 'challenge-a' }, exec);
  const before = entry.marker;
  assert.equal(controllerProjection.apply(before, { seq: 2, type: 'tool/result', data: { meta: { playgroundControllerAssociation: repeated.association } } }), before);
  await f.ctx.get('sessions').flush(entry.agent.session);
  f.disk.get(sessionId).values.playgroundControllerNotices = children.map((child) => ({ childId: child.id, text: `${child.id} result`, stopReason: child.id === 'other' ? 'error' : 'completed' }));
  const result = await f.restart().tasks({ workspaceId: 'one', sessionId });
  assert.deepEqual(result.rows.map((row) => row.challenge?.id), ['challenge-a', 'challenge-a', 'challenge-b', undefined, 'challenge-a']);
  assert.deepEqual(result.rows.map((row) => row.terminalText), children.map((child) => `${child.id} result`));
  assert.ok(result.rows.every((row) => row.state === 'settled' && row.noticeIsHistorical && !row.liveEnd));
  assert.equal(result.rows[2].noticeStopReason, 'error');
  assert.deepEqual((await f.controller.tasks({ workspaceId: 'one', sessionId })).rows, result.rows);
  assert.deepEqual(await f.controller.tasks({ workspaceId: 'two', sessionId }), { kind: 'unavailable' });
  assert.equal(f.live.has(sessionId), false);
  assert.equal(f.createRequests.length, 1);
  assert.equal(f.promptRequests.length, 1);
});

test('association replay rejects inherited, foreign and malformed records and never relinks a child', () => {
  const marker = { workspaceId: 'one', sessionId: 'controller' };
  let state = controllerProjection.apply(controllerProjection.init({ id: 'controller' }, 3), {
    seq: 3, type: 'command/done', data: { kind: 'success', text: JSON.stringify({ playgroundController: marker }) },
  });
  const challenge = { baseUrl: 'https://one.example.test/api', id: 'same-id', title: 'Same title' };
  const event = (association, seq = 4) => ({ seq, type: 'tool/result', data: { meta: { playgroundControllerAssociation: association } } });
  const association = { ...marker, childId: 'first', challenge };
  for (const invalid of [event(association, 2), event({ ...association, sessionId: 'another' }),
    event({ ...association, workspaceId: 'two' }), event({ ...association, challenge: { title: 'Same title' } })]) {
    assert.equal(controllerProjection.apply(state, invalid), state);
  }
  state = controllerProjection.apply(state, event(association));
  const before = state;
  assert.equal(controllerProjection.apply(state, event({ ...association, challenge: { ...challenge, id: 'later-challenge' } })), before);
  state = controllerProjection.apply(state, event({ ...association, childId: 'second', challenge: { ...challenge, baseUrl: 'https://two.example.test/api' } }));
  assert.deepEqual(controllerProjection.wire.view(state), { ...marker, taskChallenges: {
    first: challenge, second: { ...challenge, baseUrl: 'https://two.example.test/api' },
  } });
  assert.equal(controllerProjection.stateSchema.safeParse(JSON.parse(JSON.stringify(state))).success, true);
  assert.equal(controllerProjection.wire.viewSchema.safeParse(controllerProjection.wire.view(state)).success, true);
  assert.equal(controllerProjection.wire.viewSchema.safeParse(marker).success, true);
});

test('association validates a platform challenge and refuses an unknown id before recording', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { listChildren: async () => [{ id: 'child', mode: 'external', createdAt: 1 }] } : previous(name);
  const entry = f.live.get(sessionId);
  const exec = { agent: entry.agent, signal: new AbortController().signal };
  const result = await f.controller.linkTask({ child_id: 'child', challenge_id: 'missing' }, exec);
  assert.equal(result.code, 'not_found');
  assert.equal(result.association, undefined);
  assert.equal(entry.marker.taskChallenges, undefined);
  assert.equal(f.challengeReads.length, 1);
  assert.equal(f.challengeReads[0][0], 'missing');
  assert.equal(f.challengeReads[0][1].signal, exec.signal);
});

test('an explicit correction names its predecessor and survives replay without weakening first-write-wins', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { listChildren: async () => [{ id: 'child', mode: 'external', createdAt: 1 }] } : previous(name);
  const entry = f.live.get(sessionId);
  const exec = { agent: entry.agent, signal: new AbortController().signal };
  const initial = entry.marker;
  const events = [];
  const call = (challenge_id, supersedes) => f.controller.linkTask({ child_id: 'child', challenge_id,
    ...(supersedes === undefined ? {} : { supersedes }) }, exec);
  const record = (result) => {
    assert.equal(result.kind, 'associated');
    const event = { seq: events.length + 1, type: 'tool/result', data: { meta: { playgroundControllerAssociation: result.association } } };
    events.push(event);
    entry.marker = controllerProjection.apply(entry.marker, event);
  };
  record(await call('challenge-a'));
  assert.equal((await call('challenge-b')).code, 'association_conflict');
  assert.equal((await call('missing', 'challenge-a')).code, 'not_found');
  assert.equal(entry.marker.taskChallenges.child.id, 'challenge-a');
  record(await call('challenge-b', ' challenge-a '));
  assert.equal(entry.marker.taskChallenges.child.id, 'challenge-b');
  assert.equal(events[1].data.meta.playgroundControllerAssociation.supersedes, 'challenge-a');
  assert.equal((await call('challenge-c', 'challenge-a')).code, 'association_conflict');
  const before = entry.marker;
  const ordinary = { ...events[0], seq: 3 };
  assert.equal(controllerProjection.apply(before, ordinary), before);
  const stale = { ...events[1], seq: 4, data: { meta: { playgroundControllerAssociation: {
    ...events[1].data.meta.playgroundControllerAssociation, challenge: { baseUrl: f.client.baseUrl, id: 'challenge-c' },
  } } } };
  assert.equal(controllerProjection.apply(before, stale), before);
  assert.equal(events.reduce((state, event) => controllerProjection.apply(state, event), initial).taskChallenges.child.id, 'challenge-b');
  assert.equal(controllerProjection.apply(initial, events[1]), initial, 'a correction cannot create an unassociated mapping');
});

test('association uses the configured API base and canonical challenge title', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { listChildren: async () => [{ id: 'child', mode: 'external', createdAt: 1 }] } : previous(name);
  const exec = { agent: f.live.get(sessionId).agent, signal: new AbortController().signal };
  f.client.getChallenge = async (id) => { f.challengeReads.push([id]); return { id, title: '  Same\n  title  ' }; };
  const args = { child_id: 'child', challenge_id: ' challenge-a ' };
  const first = await f.controller.linkTask(args, exec);
  assert.equal(first.kind, 'associated');
  assert.deepEqual(first.association.challenge, { baseUrl: f.client.baseUrl, id: 'challenge-a', title: 'Same title' });
  const second = await f.controller.linkTask(args, exec);
  assert.equal(second.kind, 'associated');
  assert.deepEqual(second.association.challenge, first.association.challenge);
  assert.ok(f.challengeReads.every(([id]) => id === 'challenge-a'));
  assert.equal((await f.controller.linkTask({ ...args, challenge_id: '  ' }, exec)).code, 'invalid_association');
});

test('association retention keeps the newest 100 inserts in order through correction and replay', () => {
  const marker = { workspaceId: 'one', sessionId: 'controller' };
  const initial = controllerProjection.apply(controllerProjection.init({ id: marker.sessionId }, 0), {
    seq: 0, type: 'command/done', data: { kind: 'success', text: JSON.stringify({ playgroundController: marker }) },
  });
  let state = initial;
  const events = [];
  const insert = (index, supersedes) => {
    const event = { seq: events.length + 1, type: 'tool/result', data: { meta: { playgroundControllerAssociation: {
      ...marker, childId: `child-${index}`, challenge: { baseUrl: 'https://one.example.test/api', id: supersedes ? 'corrected' : `challenge-${index}` },
      ...(supersedes ? { supersedes } : {}),
    } } } };
    events.push(event);
    state = controllerProjection.apply(state, event);
  };
  for (let index = 0; index <= 100; index += 1) insert(index);
  const expected = Array.from({ length: 100 }, (_, index) => `child-${index + 1}`);
  assert.deepEqual(Object.keys(state.taskChallenges), expected);
  assert.equal(Object.hasOwn(state.taskChallenges, 'child-0'), false);
  insert(50, 'challenge-50');
  assert.deepEqual(Object.keys(state.taskChallenges), expected, 'a correction does not change insertion order');
  assert.equal(state.taskChallenges['child-50'].id, 'corrected');
  insert(101);
  assert.deepEqual(Object.keys(state.taskChallenges), Array.from({ length: 100 }, (_, index) => `child-${index + 2}`));
  assert.deepEqual(events.reduce((restored, event) => controllerProjection.apply(restored, event), initial), state);
});

test('association conflict identifies a stored platform mismatch even when the challenge id matches', async (t) => {
  const f = await fixture(t);
  const { sessionId } = await open(f.controller);
  const previous = f.ctx.get;
  f.ctx.get = (name) => name === 'subagents' ? { listChildren: async () => [{ id: 'child', mode: 'external', createdAt: 1 }] } : previous(name);
  const entry = f.live.get(sessionId);
  entry.marker = controllerProjection.apply(entry.marker, { seq: 1, type: 'tool/result', data: { meta: { playgroundControllerAssociation: {
    workspaceId: 'one', sessionId, childId: 'child', challenge: { baseUrl: 'https://other.example.test/api', id: 'challenge-a' },
  } } } });
  const result = await f.controller.linkTask({ child_id: 'child', challenge_id: 'challenge-a' }, {
    agent: entry.agent, signal: new AbortController().signal,
  });
  assert.equal(result.code, 'association_conflict');
  assert.match(result.reason, /平台.*不一致/);
  assert.doesNotMatch(result.reason, /另一道赛题/);
});
