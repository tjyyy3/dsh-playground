// Local, fully offline demo of the Playground plugin.
//
// Starts a mock Playground API on 127.0.0.1, then drives the same client and
// submission code the plugin uses. No request leaves the machine, and nothing
// is uploaded to play.bohrium.com.
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createPlaygroundClient } from '../lib/api.js';
import {
  formatAttempt,
  formatAttemptList,
  formatChallenge,
  formatList,
  formatSubmission,
} from '../lib/format.js';
import { createSubmitTool } from '../index.js';
import { createMaterialAccess } from '../lib/material-access.js';

const requests = [];
const uploads = [];

function summarize(form) {
  return [...form.entries()].map(([key, value]) => (
    typeof value === 'string'
      ? `${key}=${value.length > 70 ? `${value.slice(0, 70)}…` : value}`
      : `${key}=<file ${value.name}, ${value.size} bytes>`
  ));
}

async function readForm(req) {
  const request = new Request(`http://127.0.0.1${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: 'half',
  });
  return request.formData();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  requests.push(`${req.method} ${url.pathname}${url.search}`);
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  try {
    if (req.method === 'GET' && url.pathname === '/api/challenges') {
      return send(200, {
        items: [{
          id: 'demo-challenge',
          title: 'Demo Challenge',
          disc: 'demo',
          difficulty: 2,
          attempts: 2,
          origin: 'community',
          status: 'open',
          hasContent: true,
        }],
        total: 1,
        page: 1,
        per_page: 10,
        pages: 1,
        has_more: false,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/challenges/demo-challenge') {
      return send(200, {
        id: 'demo-challenge',
        title: 'Demo Challenge',
        content: '# Demo\n\nThis problem statement comes from the local mock.',
        resources: [{ kind: 'dataset', name: 'demo.csv', description: 'local fixture' }],
        contentGated: false,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/challenges/demo-challenge/attempts') {
      return send(200, {
        attempts: [
          {
            id: 101,
            challengeId: 'demo-challenge',
            authorId: 'local',
            author_name: 'Local Tester',
            status: 'scored',
            score: 88,
            bundleStatus: 'ready',
            createdAt: '2026-10-27T00:00:00+00:00',
            scoringState: { state: 'final', scoreIsFinal: true, displayScore: 88, actionNeeded: false },
          },
          {
            id: 102,
            challengeId: 'demo-challenge',
            authorId: 'local',
            author_name: 'Local Tester',
            status: 'submitted',
            score: 0,
            createdAt: '2026-10-27T00:05:00+00:00',
            scoringState: { state: 'queued', scoreIsFinal: false },
          },
        ],
        total: 2,
        totalNonDraft: 2,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/attempts/101') {
      return send(200, {
        id: 101,
        challengeId: 'demo-challenge',
        authorId: 'local',
        author_name: 'Local Tester',
        status: 'scored',
        score: 88,
        bundleStatus: 'ready',
        modelTag: 'local-model',
        harness: 'Local Harness',
        createdAt: '2026-10-27T00:00:00+00:00',
        scoringState: {
          state: 'final',
          scoreIsFinal: true,
          displayScore: 88,
          actionNeeded: false,
          workerStatus: 'succeeded',
        },
        scorecard: { dimensions: { reproduction: 0.9, evidence: 0.8 }, total: 88 },
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/challenges/demo-challenge/attempts') {
      const form = await readForm(req);
      uploads.push({ endpoint: url.pathname, parts: summarize(form) });
      return send(201, {
        id: 202,
        challengeId: 'demo-challenge',
        status: 'submitted',
        bundleStatus: null,
        bundlePath: null,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/attempts/202/bundle') {
      const form = await readForm(req);
      uploads.push({ endpoint: url.pathname, parts: summarize(form) });
      return send(200, {
        bundleStatus: 'ready',
        validation: { valid: true },
        violations: [],
        attempt: {
          id: 202,
          challengeId: 'demo-challenge',
          status: 'submitted',
          bundleStatus: 'ready',
        },
      });
    }

    return send(404, { error: 'not found' });
  } catch (error) {
    return send(500, { error: error instanceof Error ? error.message : String(error) });
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;
const dir = await mkdtemp(join(tmpdir(), 'dsh-playground-demo-'));
const bundlePath = join(dir, 'demo-bundle.zip');
const tracePath = join(dir, 'demo-trace.json');
await writeFile(bundlePath, 'PK\u0003\u0004local-demo-bundle');
await writeFile(tracePath, JSON.stringify([
  { type: 'thought', text: 'Read the local challenge.' },
  { type: 'tool_call', tool: 'playground_get_challenge', input: { id: 'demo-challenge' } },
]));
const client = createPlaygroundClient({ baseUrl, token: 'local-demo-token', timeoutMs: 5000 });

try {
  console.log(`mock base: ${baseUrl}\n`);

  console.log('=== 1. 赛题列表（GET /api/challenges） ===');
  const challenges = await client.listChallenges({ search: 'demo' });
  console.log(formatList(challenges));

  console.log('\n=== 2. 题面详情（GET /api/challenges/demo-challenge） ===');
  const detail = await client.getChallenge('demo-challenge');
  console.log(formatChallenge(detail));

  console.log('\n=== 3. 提交列表（GET /api/challenges/demo-challenge/attempts） ===');
  const attempts = await client.listAttempts('demo-challenge', { limit: 10, sort: 'score' });
  console.log(formatAttemptList({ ...attempts, challengeId: 'demo-challenge' }));

  console.log('\n=== 4. 单条结果（GET /api/attempts/101） ===');
  console.log(formatAttempt(await client.getAttempt(101)));

  console.log('\n=== 5. 提交评测（本地 mock，不访问真实平台） ===');
  const submitTool = createSubmitTool(client);
  const exec = { agent: { id: 'demo-task', session: { id: 'demo-task' } }, signal: new AbortController().signal };
  const access = createMaterialAccess({
    workingDirectory: { get: () => dir },
    sessionProjections: { stateOf: () => ({ task: { cwd: dir, challengeId: 'demo-challenge' } }) },
    workspaceRegistry: { resolveByPath: async () => ({ id: 'demo-workspace', path: dir }) },
  });
  const args = {
    challenge_id: 'demo-challenge',
    bundle_path: bundlePath,
    trace_path: tracePath,
    method: 'local-demo',
    model: 'local-model',
    harness: 'Local Harness',
    detail: 'Demonstration submission against the local mock.',
  };
  const submitted = await submitTool.execute(args, exec, { access: await access.begin(exec, args, 'confirm') });
  console.log(formatSubmission(submitted));

  console.log('\n=== mock 收到的 multipart（这就是真实平台会收到的内容） ===');
  for (const upload of uploads) {
    console.log(`- ${upload.endpoint}`);
    for (const part of upload.parts) console.log(`    ${part}`);
  }

  console.log('\n=== 请求记录（全部指向本地 mock） ===');
  for (const line of requests) console.log(`- ${line}`);
  console.log(`\nall requests went to ${new URL(baseUrl).host}; play.bohrium.com was not contacted.`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
