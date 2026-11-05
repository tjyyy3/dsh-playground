import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { apply, createSubmitTool, createTokenResolver, inject, name, normalizeSettings, presentationMeta } from '../index.js';
import { displayCredentialsPath } from '../lib/cli.js';
import { workflowProjection } from '../lib/workflow.js';

function mount(config = {}) {
  const registered = [];
  const ctx = {
    tools: {
      register(definition) {
        registered.push(definition);
        return () => {};
      },
    },
    get() {
      return undefined;
    },
  };
  apply(ctx, config);
  return registered;
}

test('plugin declares the tools service and a stable name', () => {
  assert.deepEqual(inject, ['tools']);
  assert.equal(name, 'playground-competition');
});

test('apply registers all eight tools with schemas and persisted UI metadata', () => {
  const tools = mount();
  assert.deepEqual(tools.map((tool) => tool.name), [
    'playground_list_challenges',
    'playground_get_challenge',
    'playground_list_attempts',
    'playground_get_attempt',
    'playground_submit_attempt',
    'playground_list_competitions',
    'playground_get_competition',
    'playground_list_my_attempts',
  ]);
  for (const tool of tools) {
    assert.equal(tool.parameters.type, 'object');
    assert.equal(tool.output.schema.type, 'object');
    assert.equal(typeof tool.output.render, 'function');
    assert.equal(typeof tool.output.presentationMeta, 'function');
    assert.equal(typeof tool.execute, 'function');
  }
});

test('UI metadata is bounded, excludes full content, and preserves a final zero', () => {
  const result = presentationMeta({}, {
    ok: true, id: 7, content: 'private problem statement',
    score: 0, scoringState: { state: 'final', scoreIsFinal: true, displayScore: 0 },
    scorecard: JSON.stringify({ dimensions: { accuracy: 0, fidelity: 0.9, note: 'not numeric' } }),
    items: Array.from({ length: 8 }, (_, index) => ({ id: index, title: `challenge ${index}`, content: 'large content' })),
  });
  assert.equal(result.playground.score, 0);
  assert.equal(result.playground.scoringState.scoreIsFinal, true);
  assert.equal(result.playground.items.length, 5);
  assert.equal(result.playground.hasMore, true);
  assert.deepEqual(result.playground.metrics, [{ label: 'accuracy', score: 0 }, { label: 'fidelity', score: 0.9 }]);
  assert.ok(!JSON.stringify(result).includes('content'));
  assertLossless(result);
  assert.equal(presentationMeta({}, { ok: true, scorecard: '{partial', scorecardTruncated: true }).playground.metrics, undefined);
});

test('submission render does not present an initial zero as a score', () => {
  const text = mount()[4].output.render({}, {
    ok: true, attemptId: 8, created: true, bundleStatus: 'ready', score: 0,
    scoringState: { state: 'queued', scoreIsFinal: false },
  })[0].text;
  assert.match(text, /pending \(queued\)/);
  assert.doesNotMatch(text, /score: 0/);
});

test('render produces markdown for list and detail values', async () => {
  const [listTool, detailTool] = mount();

  const listContent = listTool.output.render({}, {
    ok: true,
    baseUrl: 'https://play.bohrium.com/api',
    total: 1,
    page: 1,
    perPage: 1,
    pages: 1,
    hasMore: false,
    items: [{ id: 'demo', title: 'Demo' }],
  });
  assert.equal(listContent[0].type, 'text');
  assert.match(listContent[0].text, /`demo`/);

  const detailContent = detailTool.output.render({}, {
    ok: true,
    baseUrl: 'https://play.bohrium.com/api',
    id: 'demo',
    title: 'Demo',
    content: '# Task\n\nSolve it.',
    contentGated: false,
    resources: [{ kind: 'tool', name: 'python', description: 'runtime' }],
  });
  assert.match(detailContent[0].text, /## Problem statement/);
  assert.match(detailContent[0].text, /Solve it/);
});

test('render handles attempt lists, attempt detail, and submissions', () => {
  const tools = mount();
  const listAttempts = tools[2];
  const getAttempt = tools[3];
  const submit = tools[4];

  const listContent = listAttempts.output.render({}, {
    ok: true,
    challengeId: 'demo',
    total: 1,
    totalNonDraft: 1,
    page: 1,
    limit: 20,
    items: [{
      id: 7,
      authorName: 'Ada',
      status: 'scored',
      score: 12,
      bundleStatus: 'ready',
      scoringState: { state: 'final', scoreIsFinal: true, displayScore: 12 },
    }],
  });
  assert.match(listContent[0].text, /Submissions for `demo`/);
  assert.match(listContent[0].text, /Ada/);

  const detailContent = getAttempt.output.render({}, {
    ok: true,
    id: 7,
    challengeId: 'demo',
    status: 'scored',
    score: 12,
    scoringState: { state: 'final', scoreIsFinal: true, displayScore: 12, actionNeeded: false },
  });
  assert.match(detailContent[0].text, /# Submission 7/);
  assert.match(detailContent[0].text, /final score: 12/);

  const submitContent = submit.output.render({}, {
    ok: true,
    attemptId: 99,
    challengeId: 'demo',
    created: true,
    bundleStatus: 'ready',
    note: 'The bundle was accepted and scoring was triggered.',
  });
  assert.match(submitContent[0].text, /Submission 99 created/);
});

test('render reports errors instead of crashing on failed reads', () => {
  const [, , listAttempts, getAttempt] = mount();
  for (const tool of [listAttempts, getAttempt]) {
    const content = tool.output.render({}, {
      ok: false,
      error: { code: 'not_found', message: 'Not found' },
    });
    assert.match(content[0].text, /Playground request failed/);
  }
});

async function withFixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-playground-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assertLossless(value, path = 'value') {
  if (value === undefined) assert.fail(`${path} is undefined`);
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertLossless(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) assertLossless(entry, `${path}.${key}`);
}

test('submit tool creates a submission, sends the trajectory, and uploads the bundle', async () => {
  await withFixture(async (dir) => {
    const bundlePath = join(dir, 'arm.zip');
    const tracePath = join(dir, 'trace.json');
    await writeFile(bundlePath, 'PK-zip-bytes');
    await writeFile(tracePath, JSON.stringify([{ type: 'thought', text: 'step one' }]));

    let createdArgs;
    let uploadedArgs;
    const client = {
      baseUrl: 'https://example.test/api',
      async createAttempt(challengeId, fields, files) {
        createdArgs = { challengeId, fields, files };
        return {
          attempt: { id: 99, status: 'submitted', challengeId },
          idempotentReuse: false,
          hasBundle: false,
        };
      },
      async uploadBundle(attemptId, bundle) {
        uploadedArgs = { attemptId, bundle };
        return {
          attempt: { id: 99, status: 'submitted', challengeId: 'demo', bundleStatus: 'ready' },
          bundleStatus: 'ready',
          violations: [],
          validation: '{"valid":true}',
        };
      },
    };

    const tool = createSubmitTool(client);
    const result = await tool.execute({
      challenge_id: 'demo',
      bundle_path: bundlePath,
      trace_path: tracePath,
      method: 'unit-test',
      model: 'deepseek-v4',
    }, { signal: new AbortController().signal });

    assert.equal(result.ok, true);
    assert.equal(result.attemptId, 99);
    assert.equal(result.created, true);
    assert.equal(result.bundleUploaded, true);
    assertLossless(result);
    assert.equal(createdArgs.challengeId, 'demo');
    assert.equal(createdArgs.fields.type, 'agent');
    assert.equal(createdArgs.fields.status, 'submitted');
    assert.equal(createdArgs.fields.method, 'unit-test');
    assert.equal(createdArgs.fields.trace, JSON.stringify([{ type: 'thought', text: 'step one' }]));
    assert.equal(createdArgs.files[0].field, 'raw_messages');
    assert.match(await createdArgs.files[0].data.text(), /^\{.*session_start.*\}\n/);
    assert.equal(uploadedArgs.attemptId, 99);
    assert.equal(uploadedArgs.bundle.filename, 'arm.zip');
    assert.equal(await uploadedArgs.bundle.data.text(), 'PK-zip-bytes');
  });
});

test('submit tool retries only the upload when attempt_id is given', async () => {
  await withFixture(async (dir) => {
    const bundlePath = join(dir, 'arm.zip');
    await writeFile(bundlePath, 'PK-zip-bytes');

    let createCalls = 0;
    let uploadedAttemptId;
    const client = {
      baseUrl: 'https://example.test/api',
      async createAttempt() {
        createCalls += 1;
        throw new Error('must not create another submission');
      },
      async uploadBundle(attemptId) {
        uploadedAttemptId = attemptId;
        return { bundleStatus: 'ready', violations: [] };
      },
    };

    const result = await createSubmitTool(client).execute({
      challenge_id: 'demo',
      bundle_path: bundlePath,
      attempt_id: 55,
    }, { signal: new AbortController().signal });

    assert.equal(result.ok, true);
    assert.equal(result.attemptId, 55);
    assert.equal(result.created, false);
    assert.equal(createCalls, 0);
    assert.equal(uploadedAttemptId, 55);
  });
});

test('submit tool requires a trajectory for a new submission', async () => {
  await withFixture(async (dir) => {
    const bundlePath = join(dir, 'arm.zip');
    await writeFile(bundlePath, 'PK-zip-bytes');

    const result = await createSubmitTool({
      baseUrl: 'https://example.test/api',
      async createAttempt() {
        throw new Error('must not reach createAttempt');
      },
    }).execute({
      challenge_id: 'demo',
      bundle_path: bundlePath,
    }, { signal: new AbortController().signal });

    assert.equal(result.ok, false);
    assert.equal(result.stage, 'trace');
    assert.equal(result.error.code, 'invalid_argument');
    assertLossless(result);
  });
});

['not json', 'null', '[]', '42', '"message"'].forEach((invalidLine) => {
  test(`submit tool rejects invalid JSONL line ${invalidLine} before creating a submission`, async () => {
    await withFixture(async (dir) => {
      await writeFile(join(dir, 'arm.zip'), 'PK-zip-bytes');
      await writeFile(join(dir, 'trace.jsonl'), `{"type":"session_start"}\r\n\r\n${invalidLine}\r\n`);
      let createCalls = 0;
      let uploadCalls = 0;
      const result = await createSubmitTool({
        async createAttempt() {
          createCalls += 1;
          return { attempt: { id: 1 } };
        },
        async uploadBundle() {
          uploadCalls += 1;
          return { bundleStatus: 'ready', violations: [] };
        },
      }).execute({
        challenge_id: 'demo',
        bundle_path: join(dir, 'arm.zip'),
        trace_path: join(dir, 'trace.jsonl'),
      }, {});

      assert.equal(result.ok, false);
      assert.equal(result.stage, 'trace');
      assert.equal(result.error.code, 'invalid_argument');
      assert.match(result.error.message, /line 3/);
      assert.equal(createCalls, 0);
      assert.equal(uploadCalls, 0);
    });
  });
});

test('submit tool accepts JSONL objects and preserves an existing session header', async () => {
  await withFixture(async (dir) => {
    await writeFile(join(dir, 'arm.zip'), 'PK-zip-bytes');
    await writeFile(join(dir, 'trace.jsonl'), '\r\n{"type":"session_start"}\r\n\r\n{"type":"message","content":"hi"}\r\n');
    let rawMessages;
    const result = await createSubmitTool({
      baseUrl: 'https://example.test/api',
      async createAttempt(_challengeId, fields, files) {
        assert.deepEqual(fields.trace, undefined);
        rawMessages = await files[0].data.text();
        return { attempt: { id: 1 } };
      },
      async uploadBundle() {
        return { bundleStatus: 'ready', violations: [] };
      },
    }).execute({
      challenge_id: 'demo',
      bundle_path: join(dir, 'arm.zip'),
      trace_path: join(dir, 'trace.jsonl'),
    }, {});

    assert.equal(result.ok, true);
    assert.equal(rawMessages, '{"type":"session_start"}\n{"type":"message","content":"hi"}\n');
  });
});

test('submit tool reports a rejected bundle with its violations', async () => {
  await withFixture(async (dir) => {
    const bundlePath = join(dir, 'arm.zip');
    const tracePath = join(dir, 'trace.jsonl');
    await writeFile(bundlePath, 'PK-zip-bytes');
    await writeFile(tracePath, '{"type":"message","role":"user","content":"hi"}\n');

    let rawMessages = '';
    const client = {
      baseUrl: 'https://example.test/api',
      async createAttempt() {
        return {
          attempt: { id: 77, status: 'submitted', challengeId: 'demo' },
          idempotentReuse: false,
          hasBundle: false,
        };
      },
      async uploadBundle() {
        return {
          bundleStatus: 'failed',
          violations: [{ rule: 'invalid_bundle', message: 'arm_manifest.json is missing' }],
          validation: '{"valid":false}',
        };
      },
    };

    const tool = createSubmitTool(client);
    const originalCreate = client.createAttempt;
    client.createAttempt = async (_challengeId, _fields, files) => {
      rawMessages = await files[0].data.text();
      return originalCreate();
    };
    const result = await tool.execute({
      challenge_id: 'demo',
      bundle_path: bundlePath,
      trace_path: tracePath,
    }, { signal: new AbortController().signal });

    assert.match(rawMessages, /^\{.*session_start.*\}\n\{"type":"message"/);
    assert.equal(result.ok, false);
    assert.equal(result.attemptId, 77);
    assert.equal(result.error.code, 'bundle_invalid');
    assert.equal(result.violations[0].rule, 'invalid_bundle');
  });
});


test('M-01: confirmation command returns an error when the workflow throws', async () => {
  const commands = [];
  const scope = {
    tools: { register() {} },
    commands: { register: (command) => commands.push(command) },
    sessionProjections: { register() {} },
    inject() {},
  };
  apply({ tools: scope.tools, get: () => undefined, inject: (_services, callback) => callback(scope) });
  const command = commands.find((item) => item.name === 'playground-confirm');
  const agent = { get id() { throw new Error('Session unavailable'); } };
  for (const rawInput of ['checked', undefined]) {
    const result = await command.handler({ rawInput, agent, signal: new AbortController().signal });
    assert.deepEqual(result, { kind: 'error', text: 'Session unavailable' });
  }
});

test('native task creation tool requires an explicit target directory in its schema', () => {
  const tools = [];
  const scope = {
    tools: { register: (tool) => tools.push(tool) },
    commands: { register() {} }, sessionProjections: { register() {} }, inject() {},
  };
  apply({ tools: scope.tools, get: () => undefined, inject: (_services, callback) => callback(scope) });
  const tool = tools.find((item) => item.name === 'playground_start_task');
  assert.deepEqual(tool.parameters.required, ['challenge_id', 'cwd']);
  assert.match(tool.parameters.properties.cwd.description, /absolute path of a registered DSH workspace/);
  // Without this guidance the model tends to solve challenges in place, so they never reach the task list.
  // #25: in place now means binding the current conversation; a new one only on explicit request.
  assert.match(tool.description, /when the user explicitly asks to work on, solve or submit a specific Playground challenge in this conversation, call playground_bind_task to bind this conversation instead of creating a new one/);
  assert.match(tool.description, /before preparing materials for submission in this conversation, bind it/);
  assert.match(tool.description, /Reading, browsing, explaining or comparing challenges needs neither tool/);
  assert.doesNotMatch(tool.description, /never work on a challenge in a conversation that is not bound to it/);
  assert.match(tool.description, /Call this tool only when the user explicitly asks for a new or separate task conversation\./);
  // A refused bind is no reason to create a conversation the user did not ask for.
  assert.doesNotMatch(tool.description, /refuses/);
  assert.match(tool.description, /If this conversation already has a Playground task, continue working here/);
  assert.match(tool.description, /Only create another task when the user explicitly requests a new task/);
});

test('#25: the bind tool takes a challenge and an optional mode, never a directory', () => {
  const { tools } = mountWorkflowScope({ task: null, prepared: null, receipt: null });
  const tool = tools.find((item) => item.name === 'playground_bind_task');
  assert.ok(tool);
  assert.deepEqual(tool.parameters.required, ['challenge_id']);
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ['challenge_id', 'mode']);
  assert.deepEqual(tool.parameters.properties.mode.enum, ['participate', 'author']);
  assert.equal(typeof tool.output.presentationMeta, 'function');
  assert.match(tool.description, /CURRENT conversation/);
  assert.match(tool.description, /Creates no conversation, sends no prompt and writes nothing to the platform/);
  assert.match(tool.description, /this conversation's own working directory, which must be a registered DSH workspace/);
  assert.match(tool.description, /use playground_start_task only when the user explicitly asks for a new task/);
  assert.match(tool.description, /Call it only when the user explicitly asks to work on, solve or submit a specific challenge in this conversation; reading, browsing, explaining or comparing challenges must not bind/);
  assert.match(tool.description, /A binding cannot be undone/);
  assert.doesNotMatch(tool.description, /start, do or solve/);
  assert.match(tool.description, /explain that to the user and wait; do not create a task conversation on your own/);
});

test('#25: playground_bind_task binds the calling conversation through its tool result', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'playground-bind-')));
  try {
    await withSyntheticPlatform(async () => {
      // Mutated in place, so the strict stateOf stub keeps checking the session and key the tools read.
      const state = workflowProjection.init();
      const { tools, scope, exec } = mountWorkflowScope(state, { config: SYNTHETIC_CONFIG, cwd: directory });
      const resolved = [];
      scope.workspaceRegistry = { list: () => [{ id: 'workspace', path: directory }],
        async resolveByPath(path) { resolved.push(path); return (await realpath(path)) === directory ? { id: 'workspace', path: directory } : undefined; } };
      const tool = tools.find((item) => item.name === 'playground_bind_task');
      // A directory argument is ignored: the workspace is the conversation's own.
      const args = { challenge_id: 'challenge-a', cwd: tmpdir() };
      const value = await tool.execute(args, exec);
      assert.equal(value.ok, true);
      assert.deepEqual(resolved, [directory]);
      const meta = tool.output.presentationMeta(args, value);
      assert.equal(meta.playgroundWorkflow.kind, 'bind');
      Object.assign(state, workflowProjection.apply(state, { type: 'tool/result', data: { meta } }));
      assert.equal(state.task.challengeId, 'challenge-a');
      assert.equal(state.task.cwd, directory);
      assert.equal(state.task.mode, 'participate');
      assert.equal(state.task.sourceSessionId, 'synthetic-agent');
      // The status tool now reports the bound task.
      const status = await tools.find((item) => item.name === 'playground_task').execute({ action: 'status' }, exec);
      assert.deepEqual(status.task, { challengeId: 'challenge-a', title: 'Synthetic challenge', mode: 'participate', cwd: directory });
      const refused = await tool.execute({ challenge_id: 'challenge-b' }, exec);
      assert.equal(refused.ok, false);
      assert.match(refused.error.message, /如需做另一道题，请新开任务对话/);
      assert.match(renderedText(tool, { challenge_id: 'challenge-b' }, refused), /如需做另一道题/);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI timeouts: submission defaults to at least the login timeout and both are clamped', () => {
  const timeouts = (config) => {
    const { cliTimeoutMs, cliSubmitTimeoutMs } = normalizeSettings(config);
    return [cliTimeoutMs, cliSubmitTimeoutMs];
  };
  assert.deepEqual(timeouts(undefined), [120000, 600000]);
  assert.deepEqual(timeouts({ cliTimeoutMs: 900000 }), [900000, 900000]);
  assert.deepEqual(timeouts({ cliTimeoutMs: 900000, cliSubmitTimeoutMs: 300000 }), [900000, 300000]);
  assert.deepEqual(timeouts({ cliSubmitTimeoutMs: '450000' }), [120000, 450000]);
  for (const invalid of [0, -1, 'slow', NaN, Infinity]) {
    assert.deepEqual(timeouts({ cliTimeoutMs: invalid, cliSubmitTimeoutMs: invalid }), [120000, 600000]);
  }
  // setTimeout fires after 1 ms for delays above 2^31 - 1 ms.
  assert.deepEqual(timeouts({ cliTimeoutMs: 3e9, cliSubmitTimeoutMs: 3e9 }), [2147483647, 2147483647]);
  assert.deepEqual(timeouts({ cliTimeoutMs: 3e9 }), [2147483647, 2147483647]);
});

// `stateOf` is strict: the tools must read the projection of the calling agent's session under the
// `playgroundTask` key, so reading another session or key fails the test.
function mountWorkflowScope(state, { config, cwd = '/synthetic/workspace', credentials } = {}) {
  const tools = [];
  const contexts = [];
  const session = { id: 'synthetic-session' };
  const commands = [];
  const scope = {
    tools: { register: (tool) => tools.push(tool) },
    commands: { register: (command) => commands.push(command) },
    sessionProjections: {
      register() {},
      stateOf(requestedSession, key) {
        assert.equal(requestedSession, session);
        assert.equal(key, 'playgroundTask');
        return state;
      },
    },
    workingDirectory: { get: (requestedSession) => { assert.equal(requestedSession, session); return cwd; } },
    systemPrompt: { context: (entry) => contexts.push(entry), getContextOrder: () => 0 },
    inject: (services, callback) => { if (services.includes('systemPrompt') || services.includes('typert')) callback(scope); },
    // The session-free workbench queries register here.
    typert: { register() {} },
    provide: (key, value) => { scope.provided = { ...scope.provided, [key]: value }; },
  };
  apply({ tools: scope.tools, get: (key) => (key === 'credentials' ? credentials : undefined), inject: (_services, callback) => callback(scope) }, config);
  const exec = { agent: { id: 'synthetic-agent', session }, signal: new AbortController().signal };
  return { tools, contexts, scope, session, exec, commands };
}

const CHECK_ID = '5f3c1a52-0d6e-4d6e-9a53-1f0a7c2b9e11';

function pendingState(overrides = {}) {
  return {
    task: { challengeId: 'challenge-a', mode: 'participate', title: 'Synthetic challenge', cwd: '/synthetic/workspace' },
    receipt: { attemptId: 7, challengeId: 'challenge-a', status: 'submitted', scoringState: { state: 'queued', scoreIsFinal: false } },
    prepared: {
      checkId: CHECK_ID, checkedAt: '2026-11-02T00:00:00.000Z', baseUrl: 'http://127.0.0.1:15000/api', cwd: '/synthetic/workspace',
      challenge: { id: 'challenge-a', title: 'Synthetic challenge' },
      files: [{ kind: 'bundle', path: '/synthetic/workspace/bundle.zip', bytes: 12, sha256: 'abc' }],
      args: { challenge_id: 'challenge-a', bundle_path: '/synthetic/workspace/bundle.zip' }, traceCount: 1,
    },
    ...overrides,
  };
}

const renderedText = (tool, args, value) => tool.output.render(args, value).map((part) => part.text).join('\n');

/** Run `body` with a synthetic platform behind `globalThis.fetch`; the client binds fetch when apply() runs. */
async function withSyntheticPlatform(body) {
  const originalFetch = globalThis.fetch;
  const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url) => {
    const { pathname } = new URL(url);
    if (pathname.endsWith('/auth/me')) return json({ id: 5, name: 'Test user', email: 'test@example.test' });
    if (pathname.endsWith('/challenges/challenge-a')) return json({ id: 'challenge-a', title: 'Synthetic challenge', content: 'Use the fixture.' });
    if (pathname.endsWith('/attempts/7')) return json({ id: 7, challengeId: 'challenge-a', status: 'submitted', score: 0 });
    return new Response('not found', { status: 404 });
  };
  try { return await body(); } finally { globalThis.fetch = originalFetch; }
}

// A CLI that is never installed, so the material check skips the CLI precheck on every machine
// instead of running whatever playground command the developer has.
const SYNTHETIC_CONFIG = { baseUrl: 'http://127.0.0.1:15000/api', token: 'synthetic-token', cliPath: `playground-not-installed-${process.pid}` };

const forbiddenGuidance = /playground-confirm|slash command/i;

test('D10a: playground_task status never returns the one-time checkId to the model', async () => {
  const state = pendingState({
    task: {
      challengeId: 'challenge-a', mode: 'participate', title: 'Synthetic challenge', cwd: '/synthetic/workspace',
      sourceSessionId: 'source-session', baseUrl: 'http://127.0.0.1:15000/api',
    },
    receipt: {
      ok: true, attemptId: 7, challengeId: 'challenge-a', challengeTitle: 'Synthetic challenge', status: 'submitted',
      bundleStatus: 'ready', score: 0, scoringState: { state: 'queued', scoreIsFinal: false }, traceCount: 1,
      args: { challenge_id: 'challenge-a' }, baseUrl: 'http://127.0.0.1:15000/api', note: 'Fix the violations and retry.',
      attempt: { id: 7, raw: 'cli-output' }, bundleResponse: { raw: 'cli-output' },
    },
  });
  const { tools, exec } = mountWorkflowScope(state);
  const tool = tools.find((item) => item.name === 'playground_task');
  const value = await tool.execute({ action: 'status' }, exec);
  const rendered = renderedText(tool, { action: 'status' }, value);
  assert.equal(JSON.stringify(value).includes(CHECK_ID), false);
  assert.equal(rendered.includes(CHECK_ID), false);
  assert.equal('checkId' in value.prepared, false);
  assert.equal(value.ok, true);
  assert.equal(value.prepared.awaitingConfirmation, true);
  assert.deepEqual(value.prepared.challenge, state.prepared.challenge);
  assert.deepEqual(value.prepared.files, state.prepared.files);
  assert.equal(value.prepared.checkedAt, state.prepared.checkedAt);
  assert.deepEqual(value.prepared.args, state.prepared.args);
  // Only whitelisted prepared members are exposed; baseUrl, cwd and traceCount stay out.
  assert.deepEqual(Object.keys(value.prepared).sort(), ['args', 'awaitingConfirmation', 'challenge', 'checkedAt', 'files']);
  // task and receipt are whitelisted too: raw CLI/platform payloads and host-internal ids stay out.
  assert.deepEqual(value.task, { challengeId: 'challenge-a', title: 'Synthetic challenge', mode: 'participate', cwd: '/synthetic/workspace' });
  assert.deepEqual(Object.keys(value.receipt).sort(), [
    'args', 'attemptId', 'bundleStatus', 'challengeId', 'challengeTitle', 'note', 'ok', 'score', 'scoringState', 'status', 'traceCount',
  ]);
  assert.deepEqual(value.receipt.scoringState, state.receipt.scoringState);
  assert.equal(value.receipt.attemptId, 7);
  // The tool value stays JSON-clean: no undefined members for absent keys.
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
});

test('D10a: playground_task status keeps the receipt error fields and omits absent keys', async () => {
  const { tools, exec } = mountWorkflowScope({
    task: { challengeId: 'challenge-a', mode: 'participate' }, prepared: null,
    receipt: { ok: false, attemptId: 7, stage: 'upload', error: { code: 'bundle_invalid', message: 'bad zip' }, violations: [{ rule: 'invalid_bundle' }] },
  });
  const value = await tools.find((item) => item.name === 'playground_task').execute({ action: 'status' }, exec);
  assert.deepEqual(value.receipt, {
    ok: false, attemptId: 7, stage: 'upload', error: { code: 'bundle_invalid', message: 'bad zip' }, violations: [{ rule: 'invalid_bundle' }],
  });
  assert.deepEqual(value.task, { challengeId: 'challenge-a', mode: 'participate' });
  assert.equal(Object.values(value.receipt).includes(undefined), false);
});

test('D10a: playground_task status passes attemptIds through as an array of numbers when present', async () => {
  // `attemptIds` is written by the task attempt history branch; this base only passes it through.
  const { tools, exec } = mountWorkflowScope({ ...pendingState(), attemptIds: [3, 7] });
  const value = await tools.find((item) => item.name === 'playground_task').execute({ action: 'status' }, exec);
  assert.deepEqual(value.attemptIds, [3, 7]);
  assert.ok(Array.isArray(value.attemptIds) && value.attemptIds.every((id) => typeof id === 'number'));
  assert.equal(JSON.stringify(value).includes(CHECK_ID), false);
});

test('D10a: playground_task status without a pending check reports no prepared submission', async () => {
  const { tools, exec } = mountWorkflowScope({ task: { challengeId: 'challenge-a', mode: 'participate' }, prepared: null, receipt: null });
  const value = await tools.find((item) => item.name === 'playground_task').execute({ action: 'status' }, exec);
  // The exact key set guards the shape: no attemptIds when absent, nothing added by accident.
  assert.deepEqual(Object.keys(value).sort(), ['ok', 'prepared', 'receipt', 'task']);
  assert.deepEqual(value, { ok: true, task: { challengeId: 'challenge-a', mode: 'participate' }, receipt: null, prepared: null });
});

test('D10a: playground_task mode and results actions never contain the checkId', async () => {
  await withSyntheticPlatform(async () => {
    const { tools, exec } = mountWorkflowScope(pendingState(), { config: SYNTHETIC_CONFIG });
    const tool = tools.find((item) => item.name === 'playground_task');
    for (const args of [{ action: 'mode', mode: 'author' }, { action: 'results' }]) {
      const value = await tool.execute(args, exec);
      assert.equal(value.ok, true, args.action);
      assert.equal(JSON.stringify(value).includes(CHECK_ID), false, args.action);
      assert.equal(renderedText(tool, args, value).includes(CHECK_ID), false, args.action);
    }
  });
});

test('D10a: playground_check_materials renders without the checkId; the structured value still carries it (known residual)', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'playground-check-'));
  try {
    await writeFile(join(directory, 'bundle.zip'), await readFile(new URL('./fixtures/minimal.zip', import.meta.url)));
    await writeFile(join(directory, 'trace.json'), JSON.stringify([{ type: 'tool_result', content: 'synthetic run' }]));
    await withSyntheticPlatform(async () => {
      const { tools, exec } = mountWorkflowScope(
        { task: { challengeId: 'challenge-a', mode: 'participate' }, prepared: null, receipt: null },
        { config: SYNTHETIC_CONFIG, cwd: directory },
      );
      const tool = tools.find((item) => item.name === 'playground_check_materials');
      const args = { challenge_id: 'challenge-a' };
      const value = await tool.execute(args, exec);
      assert.equal(value.ok, true);
      assert.equal(value.status, 'awaiting_confirmation');
      // The configured CLI does not exist, so the precheck is skipped and the card says so.
      assert.equal(value.cliPrecheck.status, 'skipped');
      assert.match(value.cliPrecheck.note, /未找到 Playground CLI，未经 CLI 预检/);
      const checkId = value.workflow.prepared.checkId;
      assert.match(checkId, /^[0-9a-f-]{36}$/);
      const rendered = renderedText(tool, args, value);
      assert.equal(rendered.includes(checkId), false);
      assert.match(rendered, /确认目标并提交/);
      assert.match(rendered, /无需输入任何命令/);
      assert.equal(JSON.stringify({ ...value, workflow: undefined }).includes(checkId), false);
      // KNOWN RESIDUAL, pinned on purpose: the structured value still carries `workflow.prepared.checkId`.
      // The session projection (and so the workbench confirm button) is fed only through
      // `presentationMeta(args, value)`, which receives nothing but this value, so the code has to ride
      // in it. It is a stale-click guard, not a credential: only the human `/playground-confirm`
      // command can confirm and no tool runs commands. Removing it needs a host-side change, so any
      // change here must be deliberate.
      assert.equal(presentationMeta(args, value).playgroundWorkflow.prepared.checkId, checkId);
      assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('D10a: submission tool descriptions tell the agent to point at the button, not a command', () => {
  const { tools } = mountWorkflowScope({ task: null, prepared: null, receipt: null });
  for (const name of ['playground_submit_attempt', 'playground_check_materials']) {
    const { description } = tools.find((item) => item.name === name);
    assert.match(description, /clicking "确认目标并提交"/, name);
    assert.match(description, /"前往工作台确认提交"/, name);
    assert.match(description, /Never ask the user to type a command/, name);
    assert.match(description, /never run `playground submit` in the terminal/, name);
    assert.doesNotMatch(description, forbiddenGuidance, name);
  }
});

test('D10a: the task context prompt tells the agent how confirmation works', () => {
  const { contexts, exec } = mountWorkflowScope({
    task: { challengeId: 'challenge-a', mode: 'participate' }, prepared: { checkId: 'synthetic-check' }, receipt: null,
  });
  const context = contexts.find((entry) => entry.name === 'playground-task:current');
  assert.ok(context);
  const text = context.text({ agent: exec.agent });
  assert.match(text, /clicking "确认目标并提交"/);
  assert.match(text, /"前往工作台确认提交"/);
  assert.match(text, /Never ask the user to type a command/);
  assert.match(text, /never run `playground submit` in the terminal/);
  assert.doesNotMatch(text, forbiddenGuidance);
  assert.equal(text.includes('synthetic-check'), false);
  assert.equal(context.text({}), '');
});

test('#45: the material-check description names the CLI precheck, the accepted trace formats and the self-check', () => {
  const { tools } = mountWorkflowScope({ task: null, prepared: null, receipt: null });
  for (const name of ['playground_submit_attempt', 'playground_check_materials']) {
    const tool = tools.find((item) => item.name === name);
    assert.match(tool.description, /--dry-run/, name);
    assert.match(tool.parameters.properties.trace_path.description, /\{"role", "content"\}/, name);
    assert.match(tool.parameters.properties.trace_path.description, /\{"steps": \[\.\.\.\]\}/, name);
    assert.match(tool.parameters.properties.trace_path.description, /playground trace validate --trace <path>/, name);
  }
  const { description } = tools.find((item) => item.name === 'playground_check_materials');
  assert.match(description, /native session JSONL/);
  assert.match(description, /one \{"role": \.\.\., "content": \.\.\.\} object per line/);
  assert.match(description, /\{"steps": \[\.\.\.\]\} JSON/);
  assert.match(description, /playground trace validate --trace <path>/);
  assert.match(description, /generated only when the CLI accepts the materials/);
  // The dry run is not described as free of platform requests: it creates and uploads nothing.
  for (const name of ['playground_submit_attempt', 'playground_check_materials']) {
    const text = tools.find((item) => item.name === name).description;
    assert.match(text, /creates and uploads nothing/, name);
    assert.doesNotMatch(text, /no platform request|before any platform request/, name);
  }
});

// Token values below are synthetic; a test fails if any of them reaches a result.
async function withoutAmbientToken(body) {
  const previous = process.env.PLAYGROUND_TOKEN;
  delete process.env.PLAYGROUND_TOKEN;
  try { return await body(); } finally {
    if (previous === undefined) delete process.env.PLAYGROUND_TOKEN;
    else process.env.PLAYGROUND_TOKEN = previous;
  }
}

test('#12: the token resolver reports where the token came from, never the value', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'playground-token-'));
  const file = join(directory, 'credentials.env');
  try {
    await withoutAmbientToken(async () => {
      let stored;
      const store = { resolve: async (name) => { assert.equal(name, 'PLAYGROUND_TOKEN'); if (stored instanceof Error) throw stored; return stored; } };
      const resolver = (config = {}) => createTokenResolver(normalizeSettings({ credentialsPath: file, ...config }), { get: (key) => (key === 'credentials' ? store : undefined) });
      const expect = async (resolve, value, source, cliFileToken, envToken = false) => {
        assert.equal(await resolve(), value, source);
        const status = await resolve.status();
        assert.deepEqual(status, { tokenSource: source, cliFileToken, cliFilePath: displayCredentialsPath(file), envToken }, source);
        assert.doesNotMatch(JSON.stringify(status), /synthetic-/, source);
      };
      await expect(resolver(), '', 'none', false);
      stored = { value: ' synthetic-dsh ', source: 'file' };
      await expect(resolver(), 'synthetic-dsh', 'dsh', false);
      // DSH reports a variable it inherited from its own environment as `env`.
      stored = { value: 'synthetic-inherited', source: 'env' };
      await expect(resolver(), 'synthetic-inherited', 'env', false);
      await writeFile(file, "PLAYGROUND_TOKEN='synthetic-file'\n");
      stored = { value: 'synthetic-dsh', source: 'file' };
      await expect(resolver(), 'synthetic-dsh', 'dsh', true);
      await expect(resolver({ token: 'synthetic-config' }), 'synthetic-config', 'config', true);
      stored = undefined;
      await expect(resolver(), 'synthetic-file', 'cli_file', true);
      await writeFile(file, '');
      stored = new Error('store unavailable');
      process.env.PLAYGROUND_TOKEN = ' synthetic-env ';
      await expect(resolver(), 'synthetic-env', 'env', false, true);
      // A saved token while DSH also inherited the variable: the status says the variable exists (never
      // its value), so the workbench can say that clearing the saved one falls back to it.
      stored = { value: 'synthetic-dsh', source: 'file' };
      await expect(resolver(), 'synthetic-dsh', 'dsh', false, true);
      process.env.PLAYGROUND_TOKEN = '  ';
      await expect(resolver(), 'synthetic-dsh', 'dsh', false, false);
      delete process.env.PLAYGROUND_TOKEN;
      // Only `file` is a confirmed saved value. Anything else is not offered for clearing.
      for (const source of ['store', 'secret', undefined, 'ENV']) {
        stored = { value: 'synthetic-unknown', source };
        await expect(resolver(), 'synthetic-unknown', 'dsh_other', false);
      }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Fake CLI for the wiring test: logs argv and the PLAYGROUND_TOKEN it received, answers the version,
// help and update probes, and accepts every dry run.
const TOKEN_CLI = (log) => `import { appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ argv, token: process.env.PLAYGROUND_TOKEN ?? null, worker: process.env.PLAYGROUND_WORKER_TOKEN ?? null }) + '\\n');
if (argv[0] === '--version') { console.log('0.1.47'); process.exit(0); }
if (argv[0] === 'update-check') { console.log(JSON.stringify({ current: '0.1.47', latest: '0.1.47', update_available: false })); process.exit(0); }
if (argv.includes('--help')) { console.log('playground submit [--dry-run]'); process.exit(0); }
if (argv[0] === 'submit' && !argv.includes('--dry-run')) {
  console.log(JSON.stringify({ attempt_id: 42, attempt: { id: 42, challenge_id: 'challenge-a', status: 'submitted' }, bundle_response: { bundleStatus: 'ready' } }));
  process.exit(0);
}
console.log(JSON.stringify({ status: 'dry_run' }));`;

test('#12: the auth query and the CLI precheck use the token stored in DSH; the CLI gets it as PLAYGROUND_TOKEN, not an argument', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'playground-token-wiring-')));
  const originalFetch = globalThis.fetch;
  try {
    await writeFile(join(directory, 'bundle.zip'), await readFile(new URL('./fixtures/minimal.zip', import.meta.url)));
    await writeFile(join(directory, 'trace.json'), JSON.stringify([{ type: 'tool_result', content: 'synthetic run' }]));
    const credentialsPath = join(directory, 'credentials.env');
    await writeFile(credentialsPath, 'PLAYGROUND_TOKEN=synthetic-file-token\n');
    const log = join(directory, 'calls.log');
    const cliPath = join(directory, 'fake-cli.mjs');
    await writeFile(cliPath, `#!/usr/bin/env node\n${TOKEN_CLI(log)}\n`);
    await chmod(cliPath, 0o755);
    const authorizations = [];
    const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
    globalThis.fetch = async (url, init) => {
      const { pathname } = new URL(url);
      authorizations.push(init?.headers?.authorization);
      if (pathname.endsWith('/auth/me')) return json({ id: 5, name: 'Test user', user_type: 'human' });
      if (pathname.endsWith('/challenges/challenge-a')) return json({ id: 'challenge-a', title: 'Synthetic challenge', content: 'Use the fixture.' });
      return new Response('not found', { status: 404 });
    };
    const credentials = { resolve: async (name) => (name === 'PLAYGROUND_TOKEN' ? { value: 'synthetic-dsh-token', source: 'file' } : undefined) };
    const { tools, exec, scope } = mountWorkflowScope({ task: { challengeId: 'challenge-a', mode: 'participate' }, prepared: null, receipt: null },
      { config: { baseUrl: 'http://127.0.0.1:15000/api', cliPath, credentialsPath }, cwd: directory, credentials });
    const auth = await scope.provided.playgroundQueries.query({ action: 'auth' }, new AbortController().signal);
    assert.equal(auth.authenticated, true);
    assert.equal(auth.tokenSource, 'dsh');
    assert.equal(auth.cliFileToken, true);
    assert.equal(auth.cliFilePath, displayCredentialsPath(credentialsPath));
    const value = await tools.find((item) => item.name === 'playground_check_materials').execute({ challenge_id: 'challenge-a' }, exec);
    assert.equal(value.ok, true);
    assert.equal(value.cliPrecheck.status, 'passed');
    for (const result of [auth, value]) assert.doesNotMatch(JSON.stringify(result), /synthetic-(dsh|file)-token/);
    assert.ok(authorizations.length > 0);
    assert.ok(authorizations.every((header) => header === 'Bearer synthetic-dsh-token'), 'the API client used the DSH token');
    const calls = (await readFile(log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const dryRun = calls.find((call) => call.argv.includes('--dry-run'));
    assert.ok(dryRun, 'the precheck ran a dry run');
    assert.equal(dryRun.token, 'synthetic-dsh-token');
    assert.ok(calls.every((call) => !JSON.stringify(call.argv).includes('synthetic-')), 'no token in any CLI argument');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test('#12: a confirmed submission with a token only in DSH runs the CLI submit with that token and the same identity', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'playground-token-confirm-')));
  const originalFetch = globalThis.fetch;
  const previousWorker = process.env.PLAYGROUND_WORKER_TOKEN;
  try {
    await withoutAmbientToken(async () => {
      // An inherited worker token must not authenticate the upload as someone else.
      process.env.PLAYGROUND_WORKER_TOKEN = 'synthetic-worker-token';
      await writeFile(join(directory, 'bundle.zip'), await readFile(new URL('./fixtures/minimal.zip', import.meta.url)));
      await writeFile(join(directory, 'trace.json'), JSON.stringify([{ type: 'tool_result', content: 'synthetic run' }]));
      // No CLI credentials file: the token exists only in the DSH credential store.
      const credentialsPath = join(directory, 'missing-credentials.env');
      const log = join(directory, 'calls.log');
      const cliPath = join(directory, 'fake-cli.mjs');
      await writeFile(cliPath, `#!/usr/bin/env node\n${TOKEN_CLI(log)}\n`);
      await chmod(cliPath, 0o755);
      const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
      globalThis.fetch = async (url, init) => {
        const { pathname } = new URL(url);
        if (init?.headers?.authorization !== 'Bearer synthetic-dsh-token') return new Response('{}', { status: 401 });
        if (pathname.endsWith('/auth/me')) return json({ id: 5, name: 'Test user' });
        if (pathname.endsWith('/challenges/challenge-a')) return json({ id: 'challenge-a', title: 'Synthetic challenge', content: 'Use the fixture.' });
        return new Response('not found', { status: 404 });
      };
      const credentials = { resolve: async (name) => (name === 'PLAYGROUND_TOKEN' ? { value: 'synthetic-dsh-token', source: 'file' } : undefined) };
      const state = workflowProjection.init();
      const { tools, exec, commands } = mountWorkflowScope(state, { config: { baseUrl: 'http://127.0.0.1:15000/api', cliPath, credentialsPath }, cwd: directory, credentials });
      state.task = { challengeId: 'challenge-a', mode: 'participate' };
      const tool = tools.find((item) => item.name === 'playground_check_materials');
      const args = { challenge_id: 'challenge-a' };
      const checked = await tool.execute(args, exec);
      assert.equal(checked.ok, true);
      assert.equal(checked.cliPrecheck.status, 'passed');
      Object.assign(state, workflowProjection.apply(state, { type: 'tool/result', data: { meta: tool.output.presentationMeta(args, checked) } }));
      assert.equal(state.prepared.submitter, 'id:5');
      const confirm = commands.find((item) => item.name === 'playground-confirm');
      const done = await confirm.handler({ rawInput: state.prepared.checkId, agent: exec.agent, signal: new AbortController().signal });
      assert.equal(done.kind, 'success', done.text);
      const result = JSON.parse(done.text);
      assert.equal(result.attemptId, 42);
      assert.doesNotMatch(done.text, /synthetic-(dsh|worker)-token/);
      const calls = (await readFile(log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
      const submits = calls.filter((call) => call.argv[0] === 'submit' && !call.argv.includes('--help'));
      assert.deepEqual(submits.map((call) => call.argv.includes('--dry-run')), [true, false], 'one dry run, then one submission');
      for (const call of submits) {
        assert.equal(call.token, 'synthetic-dsh-token');
        assert.equal(call.worker, null, 'PLAYGROUND_WORKER_TOKEN is removed');
        // The CLI is told which variable holds the token, so its own tokenEnv config cannot pick another.
        const at = call.argv.indexOf('--token-env');
        assert.deepEqual(call.argv.slice(at, at + 4), ['--token-env', 'PLAYGROUND_TOKEN', '--worker-token-env', 'PLAYGROUND_TOKEN']);
      }
      assert.ok(calls.every((call) => !JSON.stringify(call.argv).includes('synthetic-')), 'no token in any CLI argument');
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousWorker === undefined) delete process.env.PLAYGROUND_WORKER_TOKEN;
    else process.env.PLAYGROUND_WORKER_TOKEN = previousWorker;
    await rm(directory, { recursive: true, force: true });
  }
});

test('#12: a token saved in DSH while the confirmation re-reads the materials does not change who submits', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'playground-token-switch-')));
  const originalFetch = globalThis.fetch;
  try {
    await withoutAmbientToken(async () => {
      await writeFile(join(directory, 'bundle.zip'), await readFile(new URL('./fixtures/minimal.zip', import.meta.url)));
      await writeFile(join(directory, 'trace.json'), JSON.stringify([{ type: 'tool_result', content: 'synthetic run' }]));
      const credentialsPath = join(directory, 'missing-credentials.env');
      const log = join(directory, 'calls.log');
      const cliPath = join(directory, 'fake-cli.mjs');
      await writeFile(cliPath, `#!/usr/bin/env node\n${TOKEN_CLI(log)}\n`);
      await chmod(cliPath, 0o755);
      let stored = 'synthetic-token-a';
      let confirming = false;
      const identities = [];
      const users = { 'Bearer synthetic-token-a': { id: 5, name: 'Account A' }, 'Bearer synthetic-token-b': { id: 9, name: 'Account B' } };
      const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
      globalThis.fetch = async (url, init) => {
        const { pathname } = new URL(url);
        const authorization = init?.headers?.authorization;
        if (pathname.endsWith('/auth/me')) {
          identities.push(authorization);
          return users[authorization] ? json(users[authorization]) : new Response('{}', { status: 401 });
        }
        if (pathname.endsWith('/challenges/challenge-a')) {
          // The confirmation re-reads the challenge inside inspect(): the user saves another token now.
          if (confirming) stored = 'synthetic-token-b';
          return json({ id: 'challenge-a', title: 'Synthetic challenge', content: 'Use the fixture.' });
        }
        return new Response('not found', { status: 404 });
      };
      const credentials = { resolve: async (name) => (name === 'PLAYGROUND_TOKEN' ? { value: stored, source: 'file' } : undefined) };
      const state = workflowProjection.init();
      const { tools, exec, commands } = mountWorkflowScope(state, { config: { baseUrl: 'http://127.0.0.1:15000/api', cliPath, credentialsPath }, cwd: directory, credentials });
      state.task = { challengeId: 'challenge-a', mode: 'participate' };
      const tool = tools.find((item) => item.name === 'playground_check_materials');
      const args = { challenge_id: 'challenge-a' };
      const checked = await tool.execute(args, exec);
      assert.equal(checked.ok, true);
      Object.assign(state, workflowProjection.apply(state, { type: 'tool/result', data: { meta: tool.output.presentationMeta(args, checked) } }));
      assert.equal(state.prepared.submitter, 'id:5');
      identities.length = 0;
      confirming = true;
      const confirm = commands.find((item) => item.name === 'playground-confirm');
      const done = await confirm.handler({ rawInput: state.prepared.checkId, agent: exec.agent, signal: new AbortController().signal });
      assert.equal(done.kind, 'success', done.text);
      assert.equal(stored, 'synthetic-token-b', 'the stored token changed during the confirmation');
      assert.deepEqual(identities, ['Bearer synthetic-token-a'], 'the identity check used the token looked up at the start');
      const calls = (await readFile(log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
      const submitted = calls.filter((call) => call.argv[0] === 'submit' && !call.argv.includes('--dry-run') && !call.argv.includes('--help'));
      assert.equal(submitted.length, 1);
      assert.equal(submitted[0].token, 'synthetic-token-a', 'the CLI submitted under the checked identity');
      assert.doesNotMatch(done.text, /synthetic-token/);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

// #58: the confirmation's result reaches the conversation as a user command, so the agent reads a failure
// through playground_task status and the task context prompt.
const FAILURE_58 = {
  challengeId: 'challenge-a', stage: 'worker_upload', reason: 'bundle_rejected', httpStatus: 400,
  details: ['examples/minimal_demo/input/paper.pdf is not UTF-8 text', 'skill_resources_size：paper.pdf is 819383 bytes', `third ${'y'.repeat(300)}`, 'fourth reason'],
  attemptId: 63167, attemptCreated: true, at: '2026-11-05T06:41:30.000Z',
  bundle: { files: 19, totalBytes: 1003000, largest: [{ name: 'examples/minimal_demo/input/paper.pdf', bytes: 819383 }], nonTextCount: 1,
    nonText: [{ name: 'examples/minimal_demo/input/paper.pdf', bytes: 819383 }], symlinkCount: 0, symlinks: [], extra: 'not listed' },
  nextSteps: '用 playground_get_challenge 读取赛题……用 playground_check_materials 并传 attempt_id=63167 重新检查。',
  stderr: 'raw CLI output that is not a diagnosis field',
};

test('#58: playground_task status gives the agent the latest failure, its receipt diagnosis and the submissions without a bundle', async () => {
  const receipt = { ok: false, attemptId: 63167, challengeId: 'challenge-a', stage: 'upload',
    error: { code: 'upload_failed', reason: 'bundle_rejected', httpStatus: 400, details: FAILURE_58.details, message: '评测包未通过评测 Worker 的校验。' },
    diagnosis: FAILURE_58, attempt: { raw: 'cli-output' } };
  const summary = FAILURE_58.bundle;
  const { tools, exec } = mountWorkflowScope({ ...pendingState({ receipt }), prepared: { ...pendingState().prepared, bundleSummary: summary },
    attemptIds: [63116, 63167], bundleMissingIds: [63116, 63167], lastFailure: FAILURE_58 });
  const value = await tools.find((item) => item.name === 'playground_task').execute({ action: 'status' }, exec);
  const { stderr, bundle: { extra, ...bundle }, ...listed } = FAILURE_58;
  assert.deepEqual(value.lastFailure, { ...listed, bundle });
  assert.deepEqual(value.receipt.diagnosis, { ...listed, bundle });
  assert.deepEqual(value.receipt.error, receipt.error);
  assert.equal('attempt' in value.receipt, false);
  assert.deepEqual(value.bundleMissingIds, [63116, 63167]);
  assert.deepEqual(value.prepared.bundleSummary, bundle);
  assert.doesNotMatch(JSON.stringify(value), /raw CLI output|not listed|cli-output/);
  assert.equal(JSON.stringify(value).includes(CHECK_ID), false);
});

test('#58: the task context names the latest failure briefly and sends the agent to playground_task', () => {
  const { contexts, exec } = mountWorkflowScope({ task: { challengeId: 'challenge-a', mode: 'participate' }, prepared: null,
    receipt: { ok: false, attemptId: 63167, error: { code: 'upload_failed' }, scoringState: { state: 'queued' } }, lastFailure: FAILURE_58 });
  const text = contexts.find((entry) => entry.name === 'playground-task:current').text({ agent: exec.agent });
  const facts = JSON.parse(text.match(/\(facts, not write authorization\): (\{.*?\})\. Use playground_task/)[1]);
  assert.deepEqual(facts.latestFailure, { stage: 'worker_upload', attemptId: 63167, attemptCreated: true, httpStatus: 400,
    details: [FAILURE_58.details[0], FAILURE_58.details[1], `third ${'y'.repeat(153)}…`] });
  assert.match(text, /call playground_task with action "status" and follow lastFailure\.nextSteps/);
  assert.match(text, /re-check with its attempt_id so the bundle goes to the same submission; do not create another/);
  // The bundle summary and the next steps stay in playground_task; the prompt stays short.
  assert.doesNotMatch(text, /nonText|playground_get_challenge 读取赛题|fourth reason|raw CLI output/);
  assert.ok(text.length < 1500, `context is ${text.length} characters`);
  // Without a failure the context has neither the field nor the hint.
  const quiet = mountWorkflowScope({ task: { challengeId: 'challenge-a', mode: 'participate' }, prepared: null, receipt: null });
  const plain = quiet.contexts.find((entry) => entry.name === 'playground-task:current').text({ agent: quiet.exec.agent });
  assert.doesNotMatch(plain, /latestFailure|lastFailure/);
});
