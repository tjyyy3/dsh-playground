import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { apply, createSubmitTool, presentationMeta, readBundle, readTrace, readManifest } from '../index.js';
import { createWorkflow, workflowProjection } from '../lib/workflow.js';

const directories = [];
test.after(async () => { await Promise.all(directories.map((path) => rm(path, { recursive: true, force: true }))); });

async function fixture(cli) {
  const cwd = await mkdtemp(join(tmpdir(), 'playground-workflow-'));
  directories.push(cwd);
  // A real ZIP fixture, not a renamed text file.
  await writeFile(join(cwd, 'bundle.zip'), await readFile(new URL('./fixtures/minimal.zip', import.meta.url)));
  await writeFile(join(cwd, 'trace.json'), JSON.stringify([{ type: 'tool_result', content: 'synthetic run' }]));
  const states = new Map();
  const agents = new Map();
  const exec = { agent: { id: 'source', session: { id: 'source' } }, signal: new AbortController().signal };
  states.set('source', workflowProjection.init());
  agents.set('source', exec.agent);
  const calls = [];
  const ctx = {
    workingDirectory: { get: () => cwd },
    sessionProjections: { stateOf: (session) => states.get(session.id) },
    workspaceRegistry: { list: () => [{ id: 'workspace', path: cwd }] },
    agents: { get: (id) => agents.get(id) },
    sessionController: {
      async create(request) {
        calls.push(['new', request]);
        agents.set('new-task', { id: 'new-task', session: { id: 'new-task' } });
        states.set('new-task', workflowProjection.init());
        return { sessionId: 'new-task' };
      },
      async rename(request) { calls.push(['rename', request]); },
      async prompt(request) { calls.push(['prompt', request]); },
    },
  };
  let workflow;
  const record = (value, agent = exec.agent) => states.set(agent.id, workflowProjection.apply(states.get(agent.id), {
    type: 'tool/result', data: { meta: presentationMeta({}, value) },
  }));
  ctx.commands = { async execute(agent, line, attachments, signal) {
    const result = await workflow.command({ agent, rawInput: line.slice('/playground'.length), signal });
    states.set(agent.id, workflowProjection.apply(states.get(agent.id), { type: 'command/done', data: result }));
    return { result };
  } };
  const client = {
    baseUrl: 'http://127.0.0.1:15000/api',
    async getCurrentUser() { return { authenticated: true, baseUrl: 'http://127.0.0.1:15000/api', user: { id: 5, name: 'Test user', email: 'test@example.test' } }; },
    async listCompetitions() { return { total: 1, items: [{ slug: 'spring', name: 'Spring challenge' }] }; },
    async listChallenges(params) { return { total: 1, page: params.page || 1, perPage: params.perPage || 12, items: [{ id: 'challenge-a', title: 'Synthetic challenge', status: 'open' }] }; },
    async getChallenge(id) { return { id, title: 'Synthetic challenge', content: 'Use the fixture.', resources: [] }; },
    async createAttempt(id) { calls.push(['create', id]); return { attempt: { id: 7, challengeId: id } }; },
    async uploadBundle(id) { calls.push(['upload', id]); return { bundleStatus: 'ready', attempt: { id, status: 'submitted', score: 0, scoringState: { state: 'queued', scoreIsFinal: false } }, violations: [] }; },
    async getAttempt(id) { return { id, challengeId: 'challenge-a', score: 0, scoringState: { state: 'queued', scoreIsFinal: false } }; },
  };
  workflow = createWorkflow({ ctx, client, cli, submit: createSubmitTool(client, { workingDirectory: ctx.workingDirectory }), readBundle, readTrace, readManifest, presentationMeta });
  return { cwd, workflow, states, exec, calls, record, client, ctx };
}

test('creating a task uses a new native session and preserves the exploration session', async () => {
  const f = await fixture();
  const result = await f.workflow.start({ challenge_id: 'challenge-a', cwd: f.cwd }, f.exec);
  assert.equal(result.sessionId, 'new-task');
  assert.equal(f.states.get('source').task, null);
  assert.equal(f.states.get('new-task').task.challengeId, 'challenge-a');
  assert.deepEqual(f.calls[0], ['new', { workspaceId: 'workspace' }]);
  assert.match(f.calls.find(([kind]) => kind === 'prompt')[1].content[0].text, /不是操作授权/);
  assert.equal(f.calls.some(([kind]) => kind === 'create' || kind === 'upload'), false);
});

test('task creation requires an explicit absolute directory instead of inheriting the source', async () => {
  for (const cwd of [undefined, '', '   ', '.', 'solution']) {
    const f = await fixture();
    const result = await f.workflow.start({ challenge_id: 'challenge-a', cwd }, f.exec);
    assert.equal(result.ok, false);
    assert.match(result.error.message, /工作区/);
    assert.deepEqual(f.calls, []);
  }
});

test('task creation uses the selected workspace for the session, projection and initial prompt', async () => {
  const f = await fixture();
  const target = await mkdtemp(join(tmpdir(), 'playground-target-'));
  directories.push(target);
  f.ctx.workspaceRegistry.list = () => [{ id: 'target-workspace', path: target }];
  f.ctx.workingDirectory.get = () => { throw new Error('must not inherit the source directory'); };
  const result = await f.workflow.start({ challenge_id: 'challenge-a', cwd: target, workspace_id: 'target-workspace' }, f.exec);
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls[0], ['new', { workspaceId: 'target-workspace' }]);
  assert.equal(f.states.get('new-task').task.cwd, target);
  assert.ok(f.calls.find(([kind]) => kind === 'prompt')[1].content[0].text.includes(`工作区：${target}`));
  assert.equal(f.states.get('source').task, null);
});

test('invalid or changed workspace targets never create a session or fall back to the source', async () => {
  const f = await fixture();
  for (const args of [
    { cwd: join(f.cwd, 'missing') },
    { cwd: join(f.cwd, 'bundle.zip') },
    { cwd: f.cwd, workspace_id: 'removed-workspace' },
  ]) {
    const result = await f.workflow.start({ challenge_id: 'challenge-a', ...args }, f.exec);
    assert.equal(result.ok, false);
    assert.deepEqual(f.calls, []);
  }
  f.ctx.workspaceRegistry.list = () => [{ id: 'workspace', path: join(f.cwd, 'another-location') }];
  assert.equal((await f.workflow.start({ challenge_id: 'challenge-a', cwd: f.cwd, workspace_id: 'workspace' }, f.exec)).ok, false);
  assert.deepEqual(f.calls, []);
});

test('task creation is gated by Playground login while catalog reads stay available', async () => {
  const f = await fixture();
  f.client.getCurrentUser = async () => ({ authenticated: false, baseUrl: f.client.baseUrl });
  const result = await f.workflow.start({ challenge_id: 'challenge-a' }, f.exec);
  assert.equal(result.error.code, 'authentication_required');
  assert.equal(f.calls.some(([kind]) => kind === 'new'), false);
  assert.equal((await f.workflow.catalog({ search: 'synthetic' }, f.exec)).ok, true);
});

test('catalog returns readable competitions and challenges without creating a task', async () => {
  const f = await fixture();
  const result = await f.workflow.catalog({ search: 'synthetic', per_page: 12 }, f.exec);
  assert.equal(result.ok, true);
  assert.equal(result.competitions.items[0].slug, 'spring');
  assert.equal(result.challenges.items[0].id, 'challenge-a');
  assert.equal(f.calls.some(([kind]) => kind === 'new'), false);
  const command = await f.workflow.command({ agent: f.exec.agent, signal: f.exec.signal, rawInput: '{"action":"catalog","search":"synthetic"}' });
  assert.equal(command.kind, 'success');
  assert.equal(JSON.parse(command.text).playgroundCatalog.challenges.items[0].title, 'Synthetic challenge');
});

test('auth status returns the current Playground identity without changing task state', async () => {
  const f = await fixture();
  const result = await f.workflow.auth(f.exec);
  assert.equal(result.authenticated, true);
  assert.equal(result.user.name, 'Test user');
  const command = await f.workflow.command({ agent: f.exec.agent, signal: f.exec.signal, rawInput: '{"action":"auth"}' });
  assert.equal(command.kind, 'success');
  assert.equal(JSON.parse(command.text).playgroundAuth.user.email, 'test@example.test');
  assert.equal(f.states.get('source').task, null);
});

test('material check is read-only; only an exact human confirmation uploads checked bytes', async () => {
  const f = await fixture();
  const checked = await f.workflow.prepare({ challenge_id: 'challenge-a' }, f.exec);
  assert.equal(checked.ok, true);
  assert.equal(checked.workflow.prepared.traceCount, 1);
  assert.equal(checked.workflow.prepared.files[0].path, resolve(f.cwd, 'bundle.zip'));
  assert.equal(f.calls.length, 0);
  f.record(checked);
  assert.equal((await f.workflow.confirm('wrong-card', f.exec)).error.code, 'confirmation_required');
  const result = await f.workflow.confirm(checked.workflow.prepared.checkId, f.exec);
  assert.equal(result.attemptId, 7);
  assert.deepEqual(f.calls, [['create', 'challenge-a'], ['upload', 7]]);
  f.record(result);
  assert.equal((await f.workflow.confirm(checked.workflow.prepared.checkId, f.exec)).error.code, 'confirmation_required');
  assert.equal(f.states.get('source').receipt.scoringState.scoreIsFinal, false);
});

test('changed trace invalidates the prior confirmation without platform writes', async () => {
  const f = await fixture();
  const checked = await f.workflow.prepare({ challenge_id: 'challenge-a' }, f.exec);
  f.record(checked);
  await writeFile(join(f.cwd, 'trace.json'), JSON.stringify([{ content: 'changed' }]));
  const result = await f.workflow.confirm(checked.workflow.prepared.checkId, f.exec);
  assert.equal(result.error.code, 'materials_changed');
  assert.equal(f.calls.length, 0);
});

test('missing, ambiguous, malformed and empty material errors never reach create', async () => {
  const f = await fixture();
  assert.equal((await f.workflow.prepare({}, f.exec)).ok, false);
  await writeFile(join(f.cwd, 'other.zip'), 'not a zip');
  assert.match((await f.workflow.prepare({ challenge_id: 'a' }, f.exec)).error.message, /多个候选/);
  assert.match((await f.workflow.prepare({ challenge_id: 'a', bundle_path: 'other.zip' }, f.exec)).error.message, /ZIP/);
  await writeFile(join(f.cwd, 'trace.json'), '{"type":"session_start"}\n');
  assert.match((await f.workflow.prepare({ challenge_id: 'a', bundle_path: 'bundle.zip' }, f.exec)).error.message, /没有执行步骤/);
  assert.equal(f.calls.length, 0);
});

test('retry target mismatch is rejected before upload', async () => {
  const f = await fixture();
  const result = await f.workflow.prepare({ challenge_id: 'challenge-b', attempt_id: 7 }, f.exec);
  assert.match(result.error.message, /属于 challenge-a/);
  assert.equal(f.calls.length, 0);
});

test('failed upload retains the attempt id and retry uploads into that exact attempt', async () => {
  const f = await fixture();
  f.client.uploadBundle = async (id) => { f.calls.push(['rejected', id]); return { bundleStatus: 'failed', violations: [{ message: 'bad bundle' }] }; };
  const checked = await f.workflow.prepare({ challenge_id: 'challenge-a' }, f.exec);
  f.record(checked);
  const result = await f.workflow.confirm(checked.workflow.prepared.checkId, f.exec);
  f.record(result);
  assert.equal(result.ok, false);
  assert.equal(f.states.get('source').receipt.args.attempt_id, 7);
  const retry = await f.workflow.prepare(f.states.get('source').receipt.args, f.exec);
  f.record(retry);
  await f.workflow.confirm(retry.workflow.prepared.checkId, f.exec);
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
});

test('mode switches preserve receipts, clear confirmation and do not grant submission authority', async () => {
  const f = await fixture();
  f.states.set('source', { task: { challengeId: 'challenge-a', mode: 'participate' }, receipt: { attemptId: 7 }, prepared: { checkId: 'old' } });
  const command = await f.workflow.command({ agent: f.exec.agent, signal: f.exec.signal, rawInput: '{"action":"mode","mode":"author"}' });
  const replayed = workflowProjection.apply(f.states.get('source'), { type: 'command/done', data: command });
  f.states.set('source', replayed);
  assert.equal(replayed.task.mode, 'author');
  assert.equal(replayed.receipt.attemptId, 7);
  assert.equal(replayed.prepared, null);
  assert.equal((await f.workflow.prepare({ challenge_id: 'challenge-a' }, f.exec)).ok, false);
});

test('registered agent submission cannot write without native workflow services; no confirmation tool exists', async () => {
  const tools = [];
  apply({ tools: { register: (tool) => tools.push(tool) }, get: () => undefined });
  const result = await tools.find((tool) => tool.name === 'playground_submit_attempt').execute({ challenge_id: 'a', confirmed: true }, {});
  assert.equal(result.error.code, 'workflow_unavailable');
  assert.equal(tools.some((tool) => /confirm/.test(tool.name)), false);
});

test('F-03: API fallback preserves submission ids and bundle failures', async () => {
  for (const bundleStatus of ['ready', 'failed']) {
    const f = await fixture({ submit: async () => { throw Object.assign(new Error('CLI unavailable'), { code: 'ENOENT' }); } });
    const violations = bundleStatus === 'failed' ? [{ message: 'bad bundle' }] : [];
    f.client.uploadBundle = async (id) => ({ bundleStatus, violations, attempt: { id, status: 'submitted' } });
    const checked = await f.workflow.prepare({ challenge_id: 'challenge-a' }, f.exec);
    f.record(checked);
    const result = await f.workflow.confirm(checked.workflow.prepared.checkId, f.exec);
    assert.equal(result.attemptId, 7);
    assert.equal(result.ok, bundleStatus === 'ready');
    assert.equal(result.bundleStatus, bundleStatus);
    assert.deepEqual(result.violations, violations);
    if (bundleStatus === 'failed') assert.equal(result.error.code, 'bundle_invalid');
    f.record(result);
    const receipt = JSON.parse(JSON.stringify(f.states.get('source').receipt));
    assert.equal(receipt.attemptId, 7);
    assert.equal(receipt.args.attempt_id, 7);
    assert.equal(receipt.ok, result.ok);
    assert.deepEqual(receipt.violations, violations);
    const refreshed = await f.workflow.results({}, f.exec);
    assert.equal(refreshed.id, 7);
    assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  }
});

test('F-03: API fallback preserves upload error stage and retry id', async () => {
  const f = await fixture({ submit: async () => { throw Object.assign(new Error('CLI unavailable'), { code: 'ENOENT' }); } });
  f.client.uploadBundle = async () => { throw new Error('upload interrupted'); };
  const checked = await f.workflow.prepare({ challenge_id: 'challenge-a' }, f.exec);
  f.record(checked);
  const result = await f.workflow.confirm(checked.workflow.prepared.checkId, f.exec);
  assert.equal(result.ok, false);
  assert.equal(result.attemptId, 7);
  assert.equal(result.stage, 'upload');
  assert.equal(result.error.message, 'upload interrupted');
  assert.equal(result.workflow.receipt.stage, 'upload');
  assert.equal(result.workflow.receipt.args.attempt_id, 7);
});

test('F-03: CLI receipts preserve successful and failed bundle JSON results', async () => {
  for (const bundleStatus of ['ready', 'failed']) {
    const violations = bundleStatus === 'failed' ? [{ message: 'bad bundle' }] : [];
    const f = await fixture({ submit: async () => ({ attempt_id: '19', attempt: { status: 'submitted', score: 0 }, bundle_response: { bundleStatus, violations } }) });
    const checked = await f.workflow.prepare({ challenge_id: 'challenge-a' }, f.exec);
    f.record(checked);
    const result = await f.workflow.confirm(checked.workflow.prepared.checkId, f.exec);
    assert.equal(result.attemptId, 19);
    assert.equal(result.ok, bundleStatus === 'ready');
    assert.equal(result.bundleStatus, bundleStatus);
    assert.equal(result.score, 0);
    assert.deepEqual(result.violations, violations);
    if (bundleStatus === 'failed') assert.equal(result.error.code, 'bundle_invalid');
    f.record(result);
    assert.equal(f.states.get('source').receipt.args.attempt_id, 19);
    assert.equal(f.states.get('source').receipt.ok, result.ok);
    assert.deepEqual(f.calls, []);
  }
});

test('F-03: CLI receipts clear confirmation on invalid submission ids without retry', async () => {
  for (const attempt_id of [undefined, null, '', 'null', 'bad', 0, -1, 1.5, Infinity, true, [], Number.MAX_SAFE_INTEGER + 1]) {
    let submitCalls = 0;
    const f = await fixture({ submit: async () => { submitCalls++; return { attempt_id }; } });
    const checked = await f.workflow.prepare({ challenge_id: 'challenge-a' }, f.exec);
    f.record(checked);
    const checkId = checked.workflow.prepared.checkId;
    const result = await f.workflow.confirm(checkId, f.exec);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'invalid_response');
    f.record(result);
    assert.equal(f.states.get('source').prepared, null);
    assert.equal(f.states.get('source').receipt, null);
    const retried = await f.workflow.confirm(checkId, f.exec);
    assert.equal(retried.error.code, 'confirmation_required');
    assert.equal(submitCalls, 1);
    assert.deepEqual(f.calls, []);
  }
});
