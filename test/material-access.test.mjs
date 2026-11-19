import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createMaterialAccess } from '../lib/material-access.js';
import { createTokenResolver, presentationMeta } from '../index.js';
import { createWorkflow, workflowProjection } from '../lib/workflow.js';
import { registerWorkbenchQueries } from '../lib/queries.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'playground-access-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'workspace');
  const outside = join(root, 'outside');
  await Promise.all([mkdir(cwd), mkdir(outside)]);
  for (const dir of [cwd, outside]) {
    await writeFile(join(dir, 'bundle.zip'), await readFile(new URL('./fixtures/cli-bundle.zip', import.meta.url)));
    await writeFile(join(dir, 'trace.json'), '[{"type":"tool_result","content":"synthetic"}]');
  }
  const agent = { id: 'task', session: { id: 'task' } };
  const exec = { agent, signal: new AbortController().signal };
  let state = { ...workflowProjection.init(), task: { challengeId: 'challenge-a', cwd, mode: 'participate' } };
  let directory = cwd;
  const events = new Map();
  const browserPeer = { principal: { kind: 'owner' }, signal: new AbortController().signal };
  const ctx = {
    on: (event, listener) => events.set(event, listener),
    workingDirectory: { get: () => directory },
    workspaceRegistry: { archivedSessionIds: [], resolveByPath: async (path) => ({ id: path, path }) },
    sessionProjections: { stateOf: () => state },
    agents: { get: (id) => id === agent.id ? agent : undefined },
    get: (key) => key === 'connection' ? { browserPeer } : undefined,
    invocation: { peer: browserPeer },
    provide: (_key, value) => { ctx.queries = value; },
    typert: { register: (value) => { ctx.descriptors = value.invocations; } },
  };
  const calls = [];
  const client = { baseUrl: 'http://127.0.0.1:1/api',
    getCurrentUser: async () => ({ authenticated: true, user: { id: 1, name: 'Synthetic user' } }),
    getChallenge: async (id) => ({ id, title: id, content: 'Synthetic challenge.' }),
    createAttempt: async () => { calls.push('create'); return { attempt: { id: 7, challengeId: 'challenge-a' } }; },
    uploadBundle: async () => { calls.push('upload'); return { bundleStatus: 'ready' }; },
  };
  const workflow = createWorkflow({ ctx, client, presentationMeta });
  registerWorkbenchQueries(ctx, workflow);
  return { root, cwd, outside, ctx, exec, events, calls, workflow, browserPeer, client,
    args: { bundle_path: 'bundle.zip', trace_path: 'trace.json' },
    record: (value) => { state = workflowProjection.apply(state, { type: 'tool/result', data: { meta: presentationMeta({}, value) } }); },
    setState: (value) => { state = value; }, setDirectory: (value) => { directory = value; },
    authorize: (requestId, scope = 'operation', recursive = false) => ctx.queries.materials({ action: 'authorize', sessionId: agent.id, requestId, scope, recursive }, exec.signal),
  };
}

test('workspace materials are checked without authorization and an unknown task never falls back to process.cwd', async (t) => {
  const f = await fixture(t);
  const result = await f.workflow.setMaterials(f.args, f.exec);
  assert.equal(result.ok, true, result.error?.message);
  assert.deepEqual(f.calls, []);
  assert.deepEqual((await f.workflow.materialAccess.status(f.exec)).requests, []);
  const nested = join(f.cwd, 'nested');
  await mkdir(nested);
  f.setDirectory(nested);
  assert.equal((await f.workflow.setMaterials({ ...f.args, bundle_path: '../bundle.zip', trace_path: '../trace.json' }, f.exec)).ok, true);
  f.setState(workflowProjection.init());
  const stopped = await f.workflow.setMaterials(f.args, f.exec);
  assert.equal(stopped.error.code, 'workspace_required');
  assert.deepEqual(f.calls, []);

});

test('#74 r1: material permissions resolve an unloaded Agent and expire when its session object changes', async (t) => {
  const f = await fixture(t);
  const blocked = await f.workflow.setMaterials({ ...f.args, bundle_path: join(f.outside, 'bundle.zip') }, f.exec);
  const resolved = [];
  f.ctx.agents.get = () => undefined;
  f.ctx.sessionController = { resolveAgent: async (id) => { resolved.push(id); return { agent: f.exec.agent }; } };
  const approved = await f.authorize(blocked.workflow.request.requestId, 'task');
  assert.equal(approved.ok, true, approved.error?.message);
  assert.deepEqual(resolved, ['task']);
  assert.equal((await f.workflow.setMaterials(approved.input, f.exec)).ok, true);
  assert.equal((await f.ctx.queries.materials({ action: 'status', sessionId: 'task' })).grants.length, 1);
  const reloadedAgent = { ...f.exec.agent, session: { id: f.exec.agent.id } };
  f.ctx.sessionController.resolveAgent = async () => ({ agent: reloadedAgent });
  assert.equal((await f.ctx.queries.materials({ action: 'status', sessionId: 'task' })).grants.length, 0);
});







test('absolute and .. external paths stop before content reads, hashes and CLI precheck', async (t) => {
  const f = await fixture(t);
  for (const bundle_path of [join(f.outside, 'bundle.zip'), relative(f.cwd, join(f.outside, 'bundle.zip'))]) {
    const result = await f.workflow.setMaterials({ ...f.args, bundle_path }, f.exec);
    assert.equal(result.error.code, 'material_authorization_required');
    assert.deepEqual(result.workflow.request.scopes, [{ path: join(f.outside, 'bundle.zip'), kind: 'file', recursive: false }]);
    assert.deepEqual(f.calls, []);
    assert.equal(result.files, undefined);
  }
});

test('a browser grant completes one full check, cannot be replayed concurrently and does not submit', async (t) => {
  const f = await fixture(t);
  const args = { ...f.args, bundle_path: join(f.outside, 'bundle.zip'), trace_path: join(f.outside, 'trace.json') };
  const blocked = await f.workflow.setMaterials(args, f.exec);
  assert.equal(blocked.workflow.request.scopes.length, 2);
  const approved = await f.authorize(blocked.workflow.request.requestId);
  const results = await Promise.all([f.workflow.setMaterials(approved.input, f.exec), f.workflow.setMaterials(approved.input, f.exec)]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.find((result) => !result.ok).error.code, 'material_authorization_expired');
  assert.equal(Object.keys(results.find((result) => result.ok).workflow.materials).length, 2);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.workflow.setMaterials(args, f.exec)).error.code, 'material_authorization_required');
});

test('an operation grant cannot change the input, purpose, session or become a directory grant', async (t) => {
  const f = await fixture(t);
  const args = { ...f.args, bundle_path: join(f.outside, 'bundle.zip') };
  const blocked = await f.workflow.setMaterials(args, f.exec);
  const approved = await f.authorize(blocked.workflow.request.requestId);
  const access = f.workflow.materialAccess;
  await assert.rejects(access.begin(f.exec, { ...approved.input, bundle_path: join(f.outside, 'other.zip') }), { code: 'material_authorization_expired' });
  await assert.rejects(access.begin(f.exec, approved.input, 'submit'), { code: 'material_authorization_expired' });
  await assert.rejects(access.begin(f.exec, approved.input, 'login'), { code: 'material_purpose_invalid' });
  await assert.rejects(access.begin({ ...f.exec, agent: { id: 'other', session: { id: 'other' } } }, approved.input), { code: 'material_authorization_expired' });
  const operation = await access.begin(f.exec, approved.input);
  assert.equal((await operation.resolve(args.bundle_path)).length > 0, true);
  assert.equal((await operation.resolve(args.bundle_path)).length > 0, true);
  await assert.rejects(operation.resolve(join(f.outside, 'trace.json')), { code: 'material_authorization_required' });
});



test('task grants are reusable and revoke, workspace changes, task end and restart invalidate them', async (t) => {
  for (const action of ['revoke', 'workspace', 'ended', 'archive', 'restart']) {
    const f = await fixture(t);
    const args = { ...f.args, bundle_path: join(f.outside, 'bundle.zip') };
    const blocked = await f.workflow.setMaterials(args, f.exec);
    const approved = await f.authorize(blocked.workflow.request.requestId, 'task');
    assert.equal((await f.workflow.setMaterials(approved.input, f.exec)).ok, true);
    assert.equal((await f.workflow.setMaterials(args, f.exec)).ok, true);
    if (action === 'revoke') await f.ctx.queries.materials({ action: 'revoke', sessionId: 'task' });
    if (action === 'workspace') {
      f.events.get('session/event')(f.exec.agent.session, { type: 'working-directory/change', data: { cwd: f.outside } });
      f.setDirectory(f.outside);
      assert.equal((await f.workflow.setMaterials(args, f.exec)).error.code, 'workspace_required');
      f.setDirectory(f.cwd);
    }
    if (action === 'ended') f.events.get('session/disposed')(f.exec.agent.session);
    if (action === 'archive') f.events.get('domain/changed')({ domain: 'workspace', table: '', operation: 'put', value: { archivedSessionIds: ['task'] } });
    const access = action === 'restart' ? createMaterialAccess(f.ctx) : f.workflow.materialAccess;
    const operation = await access.begin(f.exec, args);
    await assert.rejects(operation.resolve(args.bundle_path), { code: 'material_authorization_required' }, action);
  }
});

test('#73 r1: a transient workspace lookup failure refuses access without losing a task grant', async (t) => {
  const f = await fixture(t);
  const args = { ...f.args, bundle_path: join(f.outside, 'bundle.zip') };
  const blocked = await f.workflow.setMaterials(args, f.exec);
  const approved = await f.authorize(blocked.workflow.request.requestId, 'task');
  assert.equal((await f.workflow.setMaterials(approved.input, f.exec)).ok, true);
  const resolveByPath = f.ctx.workspaceRegistry.resolveByPath;
  f.ctx.workspaceRegistry.resolveByPath = async () => { throw new Error('Workspace registry temporarily unavailable'); };
  const unavailable = await f.ctx.queries.materials({ action: 'status', sessionId: 'task' });
  assert.equal(unavailable.error.code, 'workspace_required');
  f.ctx.workspaceRegistry.resolveByPath = resolveByPath;
  assert.equal((await f.workflow.materialAccess.status(f.exec)).grants.length, 1);
  assert.equal((await f.workflow.setMaterials(args, f.exec)).ok, true);
  assert.deepEqual(f.calls, []);
});



test('recursive directory grants cover descendants but not a nested junction to another directory', async (t) => {
  const f = await fixture(t);
  const elsewhere = join(f.root, 'elsewhere');
  await mkdir(elsewhere);
  await writeFile(join(elsewhere, 'private.json'), '{}');
  await mkdir(join(f.outside, 'nested'));
  await writeFile(join(f.outside, 'nested', 'file.json'), '{}');
  try { await symlink(elsewhere, join(f.outside, 'escape'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('Windows junction privilege is unavailable.'); return; }
    throw error;
  }
  const operation = await f.workflow.materialAccess.begin(f.exec, f.args);
  let request;
  await assert.rejects(operation.resolve(f.outside), (error) => { request = error.materialAccess; return error.code === 'material_authorization_required'; });
  const approved = await f.authorize(request.requestId, 'task', true);
  const allowed = await f.workflow.materialAccess.begin(f.exec, approved.input);
  assert.equal(await allowed.resolve(join(f.outside, 'nested', 'file.json')), join(f.outside, 'nested', 'file.json'));
  await assert.rejects(allowed.resolve(join(f.outside, 'escape', 'private.json')), { code: 'material_authorization_required' });
});

test('a file symlink escape requires external material permission', async (t) => {
  const f = await fixture(t);
  try { await symlink(join(f.outside, 'bundle.zip'), join(f.cwd, 'linked.zip'), 'file'); }
  catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('Windows file symlink privilege is unavailable; junctions are tested separately.'); return; }
    throw error;
  }
  assert.equal((await f.workflow.setMaterials({ ...f.args, bundle_path: 'linked.zip' }, f.exec)).error.code, 'material_authorization_required');
});

test('a workspace prefix sibling is external and Windows casing names the same file', async (t) => {
  const f = await fixture(t);
  const sibling = `${f.cwd}-sibling`;
  await mkdir(sibling);
  await writeFile(join(sibling, 'file.json'), '{}');
  const operation = await f.workflow.materialAccess.begin(f.exec, f.args);
  await assert.rejects(operation.resolve(join(sibling, 'file.json')), { code: 'material_authorization_required' });
  if (process.platform === 'win32') assert.equal((await operation.resolve(join(f.cwd, 'TRACE.JSON'))).toLowerCase(), join(f.cwd, 'trace.json').toLowerCase());
});

test('only the actual browser Peer grants access; owner labels, commands and agent arguments are not proof', async (t) => {
  const f = await fixture(t);
  const args = { ...f.args, bundle_path: join(f.outside, 'bundle.zip'), authorized: true, user_confirmed: true };
  const blocked = await f.workflow.setMaterials(args, f.exec);
  assert.equal(blocked.error.code, 'material_authorization_required');
  for (const invocation of [undefined, { peer: { principal: { kind: 'owner' }, interactions: 'answer' } }]) {
    f.ctx.invocation = invocation;
    assert.equal((await f.authorize(blocked.workflow.request.requestId)).error.code, 'user_action_required');
  }
  const command = await f.workflow.command({ ...f.exec, rawInput: JSON.stringify({ action: 'authorize', requestId: blocked.workflow.request.requestId }) });
  assert.equal(command.kind, 'error');
  f.ctx.invocation = { peer: f.browserPeer };
  assert.equal((await f.authorize(blocked.workflow.request.requestId)).ok, true);
  const schema = f.ctx.descriptors.find((item) => item.method === 'materials').parameters[0].codec.create();
  assert.equal(schema.safeParse({ action: 'authorize', sessionId: 'task', requestId: blocked.workflow.request.requestId, scope: 'operation', authorized: true }).success, false);
});

test('internal credential parsing stays independent and grants no material access', async (t) => {
  const f = await fixture(t);
  const path = join(f.outside, 'credentials.env');
  await writeFile(path, 'PLAYGROUND_TOKEN=synthetic-only-token\n');
  const resolveToken = createTokenResolver({ token: '', credentialsPath: path });
  assert.equal(await resolveToken(), 'synthetic-only-token');
  const operation = await f.workflow.materialAccess.begin(f.exec, f.args);
  await assert.rejects(operation.resolve(path), { code: 'material_authorization_required' });
});
