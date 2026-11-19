import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, presentationMeta } from '../index.js';
import { createWorkflow, workflowProjection } from '../lib/workflow.js';
import { createPlaygroundClient } from '../lib/api.js';
import { createPlaygroundCli } from '../lib/cli.js';
import { registerWorkbenchQueries } from '../lib/queries.js';

async function fixture(t, { content = 'Submit using the official API.', counts = [], author = 5 } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'playground-handoff-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'workspace');
  await mkdir(cwd);
  for (const path of ['bundle.zip', 'trace.json', 'manifest.json']) await writeFile(join(cwd, path), 'invalid material content, never load me');
  const agent = { id: 'task', session: { id: 'task' } };
  let state = { ...workflowProjection.init(), task: { challengeId: 'challenge-a', title: 'A', cwd, mode: 'participate', baseUrl: 'http://127.0.0.1:1/api' } };
  const calls = [];
  const browserPeer = { signal: new AbortController().signal };
  const ctx = {
    workingDirectory: { get: () => cwd },
    workspaceRegistry: { resolveByPath: async (path) => await realpath(path) === cwd ? { id: 'workspace', path: cwd } : undefined },
    sessionProjections: { stateOf: () => state },
    agents: { get: (id) => id === agent.id ? agent : undefined },
    sessionController: { prompt: async (request) => { calls.push(request); return { accepted: true }; }, create: () => assert.fail('must not create a session') },
    get: () => ({ browserPeer }), invocation: { peer: browserPeer },
    provide: (_name, value) => { ctx.queries = value; },
    typert: { register: (value) => { ctx.descriptors = value.invocations; } },
  };
  const exec = { agent, signal: new AbortController().signal };
  const client = {
    baseUrl: 'http://127.0.0.1:1/api',
    currentToken: async () => 'SYNTHETIC-TOKEN-DO-NOT-LOG',
    getCurrentUser: async () => ({ authenticated: true, user: { id: 5, name: 'Synthetic user', email: 'never-log@example.test' } }),
    getChallenge: async (id) => ({ id, title: 'A', content }),
    listMyAttempts: async () => ({ items: counts }),
    listMyAgents: async () => ({ items: [{ id: 9, name: 'Confirmed Agent', confirmed: true }] }),
    listAttempts: async () => ({ items: [] }),
    getAttempt: async (id) => ({ id, challengeId: 'challenge-a', authorId: author, status: 'submitted', scoringState: { state: 'queued', scoreIsFinal: false } }),
    createAttempt: () => assert.fail('retired uploader'),
    uploadBundle: () => assert.fail('retired uploader'),
  };
  const workflow = createWorkflow({ ctx, client, presentationMeta,
    cli: { submit: () => assert.fail('retired CLI submit'), precheck: () => assert.fail('retired precheck') } });
  ctx.commands = { execute: async (target, line, _attachments, signal) => {
    assert.equal(target, agent);
    const result = await workflow.command({ agent: target, rawInput: line.slice('/playground '.length), signal });
    state = workflowProjection.apply(state, { type: 'command/done', data: result });
    return { result };
  } };
  registerWorkbenchQueries(ctx, workflow);
  const record = (value) => { state = workflowProjection.apply(state, { type: 'tool/result', data: { meta: presentationMeta({}, value) } }); };
  const submit = (input = { action: 'request' }, signal = exec.signal) => ctx.queries.submission({ sessionId: 'task', ...input }, signal);
  return { root, cwd, ctx, client, workflow, exec, calls, browserPeer, submit, record, state: () => state, setState: (value) => { state = value; } };
}

for (const route of ['CLI', 'API']) test('#74/#75: one click dispatches references to the existing Agent for an official ' + route + ' challenge', async (t) => {
  const f = await fixture(t, { content: 'Use the official ' + route + ' workflow.' });
  const input = { action: 'request', bundle_path: 'bundle.zip', trace_path: 'trace.json', manifest_path: 'manifest.json' };
  f.setState({ ...f.state(), prepared: { args: { bundle_path: 'stale.zip' }, files: [{ sha256: 'stale' }], checkId: 'retired-card' }, attemptIds: [12] });
  const [one, two] = await Promise.all([f.submit(input), f.submit(input)]);
  assert.equal(one.status, 'dispatched');
  assert.deepEqual(two, one);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].sessionId, 'task');
  assert.deepEqual(one.submission.materials, { bundle_path: join(f.cwd, 'bundle.zip'), trace_path: join(f.cwd, 'trace.json'), manifest_path: join(f.cwd, 'manifest.json') });
  assert.deepEqual(one.submission.expectedAccount, { id: 5, name: 'Synthetic user' });
  assert.deepEqual(one.submission.attemptIds, [12]);
  assert.equal(one.submission.challengeId, 'challenge-a');
  assert.equal(one.submission.cwd, f.cwd);
  assert.equal(one.submission.workspaceId, 'workspace');
  assert.equal(one.submission.workspaceRoot, f.cwd);
  const prompt = f.calls[0].content[0].text;
  assert.match(prompt, /CLI 或 API/);
  assert.match(prompt, /track/);
  assert.doesNotMatch(prompt, /invalid material content|SYNTHETIC-TOKEN|never-log@example|stale.zip|retired-card|sha256/i);
  assert.equal(f.state().prepared, null);
  assert.equal((await f.submit(input)).alreadyDispatched, true);
  assert.equal(f.calls.length, 1);
});

test('#74: an unloaded task resolves its existing Agent without creating a session or requiring another click', async (t) => {
  const f = await fixture(t);
  f.ctx.agents.get = () => undefined;
  const resolved = [];
  f.ctx.sessionController.resolveAgent = async (id) => { resolved.push(id); return { agent: f.exec.agent }; };
  assert.equal((await f.submit()).status, 'dispatched');
  assert.deepEqual(resolved, ['task']);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].sessionId, 'task');
});

test('#74: statement limits, used quota and recorded 429 wait for the verified browser answer', async (t) => {
  for (const setup of [
    { content: '每天最多提交 3 次' },
    { counts: [{ id: 1, createdAt: new Date().toISOString(), countsTowardQuota: true }] },
    { platform: true },
  ]) {
    const f = await fixture(t, setup);
    if (setup.platform) f.setState({ ...f.state(), submissionLimits: [{ challengeId: 'challenge-a', source: 'platform' }] });
    const pending = await f.submit();
    assert.equal(pending.status, 'awaiting_user');
    assert.equal(f.calls.length, 0);
    const input = { action: 'confirm_quota', requestId: pending.submission.requestId };
    for (const invocation of [undefined, { peer: { principal: { kind: 'owner' }, outcome: 'allowed-once' } }]) {
      f.ctx.invocation = invocation;
      assert.equal((await f.submit(input)).error.code, 'user_action_required');
      assert.equal(f.calls.length, 0);
      assert.notEqual(f.state().submission.quotaConfirmed, true);
    }
    f.ctx.invocation = { peer: f.browserPeer };
    const done = await f.submit(input);
    assert.equal(done.status, 'dispatched');
    assert.equal(done.submission.quotaConfirmed, true);
    assert.equal(f.calls.length, 1);
  }
});

test('#74: cancel, unavailable peer, expired confirmation and changed account never dispatch', async (t) => {
  const f = await fixture(t, { content: '每天最多提交 3 次' });
  const pending = await f.submit();
  await f.submit({ action: 'cancel', requestId: pending.submission.requestId });
  assert.equal(f.state().submission.status, 'not_created');
  assert.equal((await f.submit({ action: 'confirm_quota', requestId: pending.submission.requestId })).error.code, 'request_expired');
  const next = await f.submit();
  f.client.getCurrentUser = async () => ({ authenticated: true, user: { id: 6 } });
  assert.equal((await f.submit({ action: 'confirm_quota', requestId: next.submission.requestId })).error.code, 'request_changed');
  assert.equal(f.state().submission.status, 'not_created');
  f.ctx.get = () => undefined;
  assert.equal((await f.submit()).error.code, 'user_action_required');
  assert.equal(f.calls.length, 0);
});

test('#74: quota confirmation expires after restart or a changed statement limit and can be requested again', async (t) => {
  for (const change of ['restart', 'limit']) {
    const f = await fixture(t, { content: '每天最多提交 3 次' });
    const pending = await f.submit();
    if (change === 'restart') {
      const restarted = createWorkflow({ ctx: f.ctx, client: f.client, presentationMeta });
      f.ctx.commands.execute = async (agent, command, _attachments, signal) => {
        const result = await restarted.command({ agent, rawInput: command.slice('/playground '.length), signal });
        f.setState(workflowProjection.apply(f.state(), { type: 'command/done', data: result }));
        return { result };
      };
      registerWorkbenchQueries(f.ctx, restarted);
    } else f.client.getChallenge = async (id) => ({ id, title: 'A', content: '每天最多提交 1 次' });
    const refused = await f.submit({ action: 'confirm_quota', requestId: pending.submission.requestId });
    assert.equal(refused.ok, false);
    assert.equal(f.state().submission.status, 'not_created');
    assert.equal((await f.submit()).status, 'awaiting_user');
    assert.equal(f.calls.length, 0);
  }
});

test('#74/#75: external references retain operation and task scope without reading material content', async (t) => {
  const f = await fixture(t);
  const path = join(f.root, 'outside.zip');
  await writeFile(path, 'not a zip');
  const blocked = await f.submit({ action: 'request', bundle_path: path });
  assert.equal(blocked.error.code, 'material_authorization_required');
  assert.equal(f.calls.length, 0);
  const approved = await f.ctx.queries.materials({ action: 'authorize', sessionId: 'task', requestId: blocked.workflow.request.requestId, scope: 'operation' }, f.exec.signal);
  assert.equal((await f.submit(approved.input)).status, 'dispatched');
  assert.equal(f.calls.length, 1);
});

test('#74: track accepts official CLI/API IDs and preserves a created attempt when upload failed', async (t) => {
  const f = await fixture(t);
  await f.submit();
  const tracked = await f.workflow.track({ attempt_id: 41, submission_state: 'upload_failed', message: 'Official server rejected invalid format.' }, f.exec);
  f.record(tracked);
  assert.equal(f.state().receipt.attemptId, 41);
  assert.equal(f.state().receipt.error.code, 'upload_failed');
  assert.equal(f.state().submission.status, 'upload_failed');
  assert.deepEqual(f.state().attemptIds, [41]);
  assert.equal((await f.workflow.track({ attempt_id: 41 }, f.exec)).alreadyTracked, true);
  assert.equal(f.calls.length, 1);
  f.client.getAttempt = async (id) => ({ id, authorId: 5, challengeId: 'challenge-a', status: 'final', scoringState: { state: 'final', scoreIsFinal: true, finalScore: 0 } });
  f.record(await f.workflow.results({}, f.exec));
  assert.equal(f.state().submission.status, 'final');
  assert.equal(f.state().receipt.scoringState.finalScore, 0);
});

test('#74: an early tracked ID stays in flight and progress later records an upload failure or 429 once', async (t) => {
  const f = await fixture(t);
  await f.submit();
  f.record(await f.workflow.track({ attempt_id: 42, submission_state: 'created' }, f.exec));
  assert.equal((await f.submit()).alreadyDispatched, true);
  const failed = await f.workflow.reportSubmission({ attempt_id: 42, submission_state: 'upload_failed', http_status: 429, message: 'Official limit reached.' }, f.exec);
  f.record(failed);
  assert.deepEqual(f.state().attemptIds, [42]);
  assert.equal(f.state().receipt.error.code, 'upload_failed');
  assert.equal((await f.workflow.taskPolicy(f.exec)).askFirst, true);
});

test('#75: handoff never asks the material boundary to read or enumerate file contents', async (t) => {
  const f = await fixture(t);
  const begin = f.workflow.materialAccess.begin;
  f.workflow.materialAccess.begin = async (...args) => {
    const access = await begin(...args);
    return { ...access, readFile: () => assert.fail('material content read'), readdir: () => assert.fail('material directory scan') };
  };
  assert.equal((await f.submit({ action: 'request', bundle_path: 'bundle.zip', trace_path: 'trace.json', manifest_path: 'manifest.json' })).status, 'dispatched');
});

test('#74: track rejects another challenge or author and accepts a confirmed Agent account', async (t) => {
  const f = await fixture(t, { author: 9 });
  assert.equal((await f.workflow.track({ attempt_id: 1 }, f.exec)).identity, 'agent');
  f.client.getAttempt = async (id) => ({ id, challengeId: 'other', authorId: 5 });
  assert.equal((await f.workflow.track({ attempt_id: 2 }, f.exec)).error.code, 'challenge_mismatch');
  f.client.getAttempt = async (id) => ({ id, challengeId: 'challenge-a', authorId: 8 });
  assert.equal((await f.workflow.track({ attempt_id: 2 }, f.exec)).error.code, 'author_mismatch');
});

test('#74: unknown dispatch or Agent outcomes cannot blindly dispatch another request', async (t) => {
  const f = await fixture(t);
  f.ctx.sessionController.prompt = async (request) => { f.calls.push(request); throw new Error('timeout'); };
  assert.equal((await f.submit()).error.code, 'dispatch_unknown');
  assert.equal(f.state().submission.status, 'unknown');
  assert.equal((await f.submit()).alreadyDispatched, true);
  assert.equal(f.calls.length, 1);
  f.record(await f.workflow.reportSubmission({ submission_state: 'not_created', message: 'No official tool available. No request sent.' }, f.exec));
  assert.equal(f.state().submission.reportedBy, 'agent');
  assert.equal(f.state().submission.status, 'not_created');
  assert.equal(f.state().receipt, null);
});

test('#74: missing task, workspace, login or readable statement blocks before handoff', async (t) => {
  for (const issue of ['task', 'workspace', 'login', 'statement']) {
    const f = await fixture(t);
    if (issue === 'task') f.setState(workflowProjection.init());
    if (issue === 'workspace') f.ctx.workspaceRegistry.resolveByPath = async () => undefined;
    if (issue === 'login') f.client.getCurrentUser = async () => ({ authenticated: false, reason: 'no_token' });
    if (issue === 'statement') f.client.getChallenge = async () => { throw new Error('Official requirement unavailable'); };
    assert.equal((await f.submit()).ok, false);
    assert.equal(f.calls.length, 0);
  }
});

test('#74/#75: retired tools, commands, API uploads and CLI submit/precheck are absent', async (t) => {
  const tools = [], commands = [];
  const scope = { tools: { register: (tool) => tools.push(tool) }, commands: { register: (command) => commands.push(command) },
    sessionProjections: { register() {} }, inject() {}, on() {} };
  apply({ tools: scope.tools, get: () => undefined, inject: (_keys, callback) => callback(scope) });
  for (const name of ['playground_submit', 'playground_submit_attempt', 'playground_check_materials']) assert.equal(tools.some((tool) => tool.name === name), false);
  assert.equal(commands.some((command) => command.name === 'playground-confirm'), false);
  const f = await fixture(t);
  assert.equal((await f.workflow.command({ ...f.exec, rawInput: '{"action":"check","user_confirmed_limit":true}' })).kind, 'error');
  const client = createPlaygroundClient({ baseUrl: 'http://127.0.0.1:9' });
  assert.equal(client.createAttempt, undefined);
  assert.equal(client.uploadBundle, undefined);
  const cli = createPlaygroundCli();
  assert.equal(cli.submit, undefined);
  assert.equal(cli.precheck, undefined);
  assert.equal(typeof cli.authLogin, 'function');
  assert.equal(typeof client.getChallenge, 'function');
  assert.equal(typeof client.getAttempt, 'function');
  const schema = f.ctx.descriptors.find((item) => item.method === 'submission').parameters[0].codec.create();
  assert.equal(schema.safeParse({ action: 'request', sessionId: 'task', user_confirmed_limit: true }).success, false);
});

