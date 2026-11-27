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
    getUserSubmissions: async () => counts.map((item) => ({ attemptId: item.id, time: item.createdAt, authorId: 5, challengeId: 'challenge-a', countsTowardQuota: item.countsTowardQuota })),
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

test('unknown current-account quota alone allows ordinary handoff', async (t) => {
  const f = await fixture(t, { counts: [{ id: 1, createdAt: new Date().toISOString() }] });
  const result = await f.submit();
  assert.equal(result.status, 'dispatched');
  assert.equal(result.submission.counts.total, 1);
  assert.equal(result.submission.counts.counted, null);
  assert.match(result.submission.policy.announcement, /占名额次数未知/);
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

test('reading a prior receipt keeps the new submission pending until its own attempt is tracked', async (t) => {
  const f = await fixture(t);
  f.record(await f.workflow.track({ attempt_id: 7, submission_state: 'uploaded' }, f.exec));
  const { submission } = await f.submit();
  f.client.getAttempt = async (id) => ({ id, challengeId: 'challenge-a', authorId: 5, status: 'final' });
  const oldResult = await f.workflow.results({}, f.exec);
  f.record(oldResult);
  assert.equal(f.state().receipt.submissionState, 'final');
  assert.deepEqual(f.state().submission, submission);
  assert.equal((await f.submit()).alreadyDispatched, true);
  assert.equal(f.calls.length, 1);

  f.record(await f.workflow.track({ attempt_id: 8 }, f.exec));
  assert.equal(f.state().submission.attemptId, 8);
  assert.equal(f.state().submission.status, 'final');
  f.record(oldResult);
  assert.equal(f.state().receipt.attemptId, 8);
  assert.equal(f.state().submission.attemptId, 8);
});

test('a result waiting for counts cannot replace a newer same-attempt receipt and Agent report', async (t) => {
  const f = await fixture(t);
  await f.submit();
  f.record(await f.workflow.track({ attempt_id: 7, submission_state: 'created' }, f.exec));
  const counting = Promise.withResolvers();
  const release = Promise.withResolvers();
  f.client.getUserSubmissions = async () => { counting.resolve(); return release.promise; };
  const pending = f.workflow.results({}, f.exec);
  await counting.promise;

  try {
    f.client.getAttempt = async (id) => ({ id, challengeId: 'challenge-a', authorId: 5, status: 'final', score: 9,
      scoringState: { state: 'final', scoreIsFinal: true } });
    f.record(await f.workflow.reportSubmission({ attempt_id: 7, submission_state: 'uploaded', message: 'Upload confirmed.' }, f.exec));
  } finally {
    release.resolve([]);
  }
  const newer = f.state();
  const stale = await pending;
  assert.equal(stale.scoringState.state, 'queued');
  assert.equal(stale.workflow, undefined);
  f.record(stale);
  assert.deepEqual(f.state(), newer);
  assert.equal(f.state().receipt.score, 9);
  assert.equal(f.state().submission.status, 'final');
  assert.equal(f.state().receipt.agentReport.message, 'Upload confirmed.');

  const refreshed = await f.workflow.results({}, f.exec);
  f.record(refreshed);
  assert.deepEqual(f.state().receipt, newer.receipt);
  assert.equal(f.state().submissionCounts.total, 0);
});

test('replaying a delayed result keeps same-attempt settlement and Agent upload evidence', async (t) => {
  const f = await fixture(t);
  await f.submit();
  f.record(await f.workflow.track({ attempt_id: 7, submission_state: 'created' }, f.exec));
  const queued = await f.workflow.results({}, f.exec);

  f.client.getAttempt = async (id) => ({ id, challengeId: 'challenge-a', authorId: 5, status: 'final', score: 9,
    scoringState: { state: 'final', scoreIsFinal: true } });
  f.record(await f.workflow.results({}, f.exec));
  const settled = f.state();
  assert.equal(settled.submission.status, 'final');
  f.record(queued);
  assert.deepEqual(f.state(), settled);

  f.client.getAttempt = async (id) => ({ id, challengeId: 'challenge-a', authorId: 5, status: 'submitted', scoringState: { state: 'queued' } });
  f.record(await f.workflow.reportSubmission({ attempt_id: 7, submission_state: 'uploaded', message: 'Upload confirmed.' }, f.exec));
  const uploaded = f.state();
  assert.equal(uploaded.submission.status, 'uploaded');
  f.record(queued);
  assert.deepEqual(f.state(), uploaded);
});

test('a queued lookup cannot replace a receipt with a terminal platform status', async (t) => {
  const f = await fixture(t);
  const queued = f.client.getAttempt;
  f.client.getAttempt = async (id) => ({ id, challengeId: 'challenge-a', authorId: 5, status: 'closed' });
  f.record(await f.workflow.track({ attempt_id: 7 }, f.exec));
  const closed = f.state();
  f.client.getAttempt = queued;
  f.record(await f.workflow.results({}, f.exec));
  assert.deepEqual(f.state(), closed);
});

test('task result, tracking and history reads reject a changed platform before looking up attempts', async (t) => {
  const f = await fixture(t);
  const original = f.client.baseUrl;
  f.record(await f.workflow.track({ attempt_id: 7 }, f.exec));
  const saved = f.state();
  f.client.baseUrl = 'https://other.example/api';
  let reads = 0;
  const getAttempt = f.client.getAttempt;
  f.client.getAttempt = (id) => { reads++; return getAttempt(id); };
  f.client.getUserSubmissions = async () => { reads++; return []; };
  for (const [taskBase, receiptBase] of [[original, undefined], [undefined, original], [original, f.client.baseUrl]]) {
    f.setState({ ...saved, task: { ...saved.task, baseUrl: taskBase }, receipt: { ...saved.receipt, baseUrl: receiptBase } });
    const before = f.state();
    assert.equal((await f.workflow.taskPolicy(f.exec)).error?.code, 'platform_changed');
    assert.equal((await f.submit()).error?.code, 'platform_changed');
    assert.equal(f.calls.length, 0);
    for (const result of [await f.workflow.results({}, f.exec), await f.workflow.track({ attempt_id: 8 }, f.exec)]) {
      assert.equal(result.error?.code, 'platform_changed');
      f.record(result);
      assert.deepEqual(f.state(), before);
    }
  }
  const lookup = await f.ctx.queries.query({ action: 'attempt', attemptId: 7, baseUrl: original, challengeId: 'challenge-a' }, f.exec.signal);
  assert.equal(lookup.error?.code, 'platform_changed');
  const history = await f.ctx.queries.query({ action: 'my_attempts', challengeId: 'challenge-a', baseUrl: original }, f.exec.signal);
  assert.equal(history.error?.code, 'platform_changed');
  assert.equal(reads, 0);

  f.setState({ ...saved, task: { ...saved.task, baseUrl: undefined }, receipt: { ...saved.receipt, baseUrl: undefined } });
  assert.equal((await f.workflow.results({}, f.exec)).ok, true);
  assert.equal((await f.workflow.track({ attempt_id: 8 }, f.exec)).tracked, true);
});

test('a result for a different challenge or attempt leaves the saved receipt intact', async (t) => {
  const f = await fixture(t);
  f.record(await f.workflow.track({ attempt_id: 7 }, f.exec));
  const saved = f.state();
  for (const [attempt, code] of [[{ id: 7, challengeId: 'other' }, 'challenge_mismatch'], [{ id: 8, challengeId: 'challenge-a' }, 'attempt_mismatch']]) {
    f.client.getAttempt = async () => ({ ...attempt, authorId: 5, status: 'final' });
    const result = await f.workflow.results({ attempt_id: 7 }, f.exec);
    assert.equal(result.error?.code, code);
    f.record(result);
    assert.deepEqual(f.state(), saved);
    const lookup = await f.ctx.queries.query({ action: 'attempt', attemptId: 7, baseUrl: f.client.baseUrl, challengeId: 'challenge-a' }, f.exec.signal);
    assert.equal(lookup.error?.code, code);
  }
});

test('workbench lookup and tracking reject malformed attempt IDs from the API adapter', async (t) => {
  const f = await fixture(t);
  let responseId;
  const api = createPlaygroundClient({ baseUrl: f.client.baseUrl, fetchImpl: async (url) => {
    assert.equal(url.pathname, '/api/attempts/1');
    return Response.json({ id: responseId, challengeId: 'challenge-a', authorId: '5', status: 'final' });
  } });
  f.client.getAttempt = api.getAttempt;
  const read = () => f.ctx.queries.query({ action: 'attempt', attemptId: 1, baseUrl: f.client.baseUrl, challengeId: 'challenge-a' }, f.exec.signal);
  const track = () => f.workflow.track({ attempt_id: 1 }, f.exec);
  const before = f.state();
  for (const invalid of [undefined, -1, 'invalid', true, [1]]) {
    responseId = invalid;
    assert.equal((await read()).error?.code, 'attempt_mismatch', String(invalid));
    const result = await track();
    assert.equal(result.error?.code, 'attempt_mismatch', String(invalid));
    f.record(result);
    assert.deepEqual(f.state(), before);
  }

  responseId = '1';
  assert.equal((await read()).id, 1);
  const tracked = await track();
  assert.equal(tracked.tracked, true);
  f.record(tracked);
  assert.deepEqual(f.state().attemptIds, [1]);
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
  assert.equal((await f.workflow.taskPolicy(f.exec)).policy.askFirst, true);
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

test('#74 r1: browser cancellation resets stranded handoffs and keeps attempts for reconciliation', async (t) => {
  for (const status of ['dispatched', 'created', 'unknown']) {
    const f = await fixture(t);
    if (status === 'unknown') f.ctx.sessionController.prompt = async (request) => { f.calls.push(request); throw new Error('timeout'); };
    await f.submit();
    if (status === 'created') f.record(await f.workflow.track({ attempt_id: 41, submission_state: 'created' }, f.exec));
    if (status === 'unknown') f.record(await f.workflow.reportSubmission({ submission_state: 'unknown', message: 'Agent cannot confirm the result.' }, f.exec));
    assert.equal(f.state().submission.status, status);
    const receipt = f.state().receipt;
    const attemptIds = f.state().attemptIds;
    const input = { action: 'cancel', requestId: f.state().submission.requestId };
    f.ctx.invocation = { peer: { principal: { kind: 'owner' } } };
    assert.equal((await f.submit(input)).error.code, 'user_action_required');
    assert.equal(f.state().submission.status, status);
    f.ctx.invocation = { peer: f.browserPeer };
    const cancelled = await f.submit(input);
    assert.equal(cancelled.ok, true, status);
    assert.equal(f.state().submission.status, 'not_created');
    assert.equal(f.state().submission.reportedBy, 'workbench');
    assert.match(cancelled.submission.message, /不.*撤回.*服务器/);
    assert.equal(f.state().receipt, receipt);
    assert.deepEqual(f.state().attemptIds, attemptIds);
    if (status === 'created') assert.equal(cancelled.submission.attemptId, 41);
    assert.equal(f.calls.length, 1, 'cancellation must not dispatch or write');
    f.ctx.sessionController.prompt = async (request) => { f.calls.push(request); return { accepted: true }; };
    const next = await f.submit();
    assert.equal(next.status, 'dispatched');
    assert.deepEqual(next.submission.attemptIds, attemptIds);
    assert.match(f.calls[1].content[0].text, /先核对上次请求是否已在服务器创建提交/);
    if (status === 'created') assert.match(f.calls[1].content[0].text, /"attemptIds":\[41\]/);
  }
});

test('#74 r1: cancellation cannot reset a different request', async (t) => {
  const f = await fixture(t);
  await f.submit();
  assert.equal((await f.submit({ action: 'cancel', requestId: 'another-request' })).error.code, 'request_not_pending');
  assert.equal(f.state().submission.status, 'dispatched');
  assert.equal(f.calls.length, 1);
});

test('#74 r2: a restored dispatching request without a Host lock can be cancelled and reconciled', async (t) => {
  const f = await fixture(t);
  f.record(await f.workflow.track({ attempt_id: 41, submission_state: 'created' }, f.exec));
  f.setState({ ...f.state(), submission: { requestId: 'persisted-request', status: 'dispatching', attemptId: 41 } });
  const cancelled = await f.submit({ action: 'cancel', requestId: 'persisted-request' });
  assert.equal(cancelled.ok, true);
  assert.equal(f.state().submission.status, 'not_created');
  assert.equal(f.state().submission.recovery.status, 'dispatching');
  assert.equal(f.state().receipt.attemptId, 41);
  assert.deepEqual(f.state().attemptIds, [41]);
  assert.equal(f.calls.length, 0);
  const next = await f.submit();
  assert.equal(next.status, 'dispatched');
  assert.deepEqual(next.submission.attemptIds, [41]);
  assert.match(f.calls[0].content[0].text, /先核对上次请求是否已在服务器创建提交/);
});

test('#74 r2: browser cancellation cannot reset a dispatch running in this Host instance', async (t) => {
  const f = await fixture(t);
  let entered;
  let finish;
  const started = new Promise((resolve) => { entered = resolve; });
  f.ctx.sessionController.prompt = (request) => {
    f.calls.push(request);
    return new Promise((resolve) => { finish = resolve; entered(); });
  };
  const running = f.submit();
  await started;
  const cancelled = f.submit({ action: 'cancel', requestId: f.state().submission.requestId });
  finish({ accepted: true });
  const result = await cancelled;
  await running;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'request_in_progress');
  assert.equal(f.state().submission.status, 'dispatched');
  assert.equal(f.state().submission.recovery, undefined);
  assert.equal(f.calls.length, 1);
});

test('#74 r2: not_created with an attempt ID is refused without dropping or tracking the ID', async (t) => {
  const f = await fixture(t);
  await f.submit();
  const before = f.state();
  f.client.getAttempt = () => assert.fail('a contradictory progress report must not query or track');
  const result = await f.workflow.reportSubmission({ attempt_id: 41, submission_state: 'not_created' }, f.exec);
  assert.equal(result.ok, false);
  assert.equal(result.error.message, '已取得编号时请先用 track 记录真实编号。');
  f.record(result);
  assert.deepEqual(f.state(), before);
});

test('#74 r1: binding ignores a legacy card for another challenge and preserves matching receipts', async (t) => {
  for (const receipt of [null, { attemptId: 41, challengeId: 'challenge-a', ok: true }]) {
    const f = await fixture(t);
    f.setState({ ...workflowProjection.init(), prepared: { challenge: { id: 'challenge-b' }, checkId: 'legacy-card' },
      receipt, attemptIds: receipt ? [41] : [] });
    const bound = await f.workflow.bind({ challenge_id: 'challenge-a' }, f.exec);
    assert.equal(bound.ok, true, bound.error?.message);
    f.record(bound);
    assert.equal(f.state().task.challengeId, 'challenge-a');
    assert.equal(f.state().prepared, null);
    assert.equal(f.state().receipt, receipt);
    assert.deepEqual(f.state().attemptIds, receipt ? [41] : []);
    assert.equal(f.calls.length, 0);
    assert.doesNotMatch(bound.note, /待确认|检查卡/);
  }
});

test('binding and replay preserve a historical receipt on its original platform', async (t) => {
  const f = await fixture(t);
  const original = f.client.baseUrl;
  const other = 'https://other.example/api';
  const receipt = { attemptId: 41, challengeId: 'challenge-a', baseUrl: original, ok: true };
  const saved = { ...workflowProjection.init(), receipt, attemptIds: [41] };
  f.setState(saved);
  f.client.baseUrl = other;
  const refused = await f.workflow.bind({ challenge_id: 'challenge-a' }, f.exec);
  assert.equal(refused.error?.code, 'platform_changed');
  f.record(refused);
  assert.deepEqual(f.state(), saved);

  f.record({ workflow: { kind: 'bind', task: { challengeId: 'challenge-a', baseUrl: other } } });
  assert.deepEqual(f.state(), saved);

  f.client.baseUrl = original;
  const bound = await f.workflow.bind({ challenge_id: 'challenge-a' }, f.exec);
  assert.equal(bound.ok, true);
  f.record(bound);
  assert.equal(f.state().task.baseUrl, original);
  assert.deepEqual(f.state().receipt, receipt);
  assert.deepEqual(f.state().attemptIds, [41]);
  assert.equal((await f.workflow.results({}, f.exec)).ok, true);
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
  assert.equal((await f.workflow.command({ ...f.exec, rawInput: '{"action":"cancel"}' })).kind, 'error');
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

