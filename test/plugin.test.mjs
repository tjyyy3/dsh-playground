import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { apply, createSubmitTool, inject, name, presentationMeta } from '../index.js';

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
