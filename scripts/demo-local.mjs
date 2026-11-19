// Local, fully offline demo of the Playground plugin.
//
// Starts a mock Playground API on 127.0.0.1, then drives the same client and
// task handoff code the plugin uses. No request leaves the machine, and nothing
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
} from '../lib/format.js';
import { presentationMeta } from '../index.js';
import { createWorkflow, workflowProjection } from '../lib/workflow.js';

const requests = [];
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

  console.log('\n=== 5. 交给当前任务 Agent（假会话，不提交） ===');
  const agent = { id: 'demo-task', session: { id: 'demo-task' } };
  let state = { ...workflowProjection.init(), task: { challengeId: 'demo-challenge', title: 'Demo', cwd: dir, mode: 'participate' } };
  const ctx = {
    workingDirectory: { get: () => dir },
    workspaceRegistry: { resolveByPath: async () => ({ id: 'demo-workspace', path: dir }) },
    sessionProjections: { stateOf: () => state },
    sessionController: { prompt: async (request) => { console.log('Fake Agent received one request for ' + request.sessionId); return { accepted: true }; } },
  };
  const workflow = createWorkflow({ ctx, client: { ...client,
    getCurrentUser: async () => ({ authenticated: true, user: { id: 'local', name: 'Local Tester' } }),
    listMyAttempts: async () => ({ items: [] }), listMyAgents: async () => ({ items: [] }),
  }, presentationMeta });
  ctx.commands = { execute: async (target, command, _attachments, signal) => {
    const result = await workflow.command({ agent: target, rawInput: command.slice('/playground '.length), signal });
    state = workflowProjection.apply(state, { type: 'command/done', data: result });
    return { result };
  } };
  const exec = { agent, signal: new AbortController().signal };
  const dispatched = await workflow.requestSubmission({ action: 'request', bundle_path: bundlePath, trace_path: tracePath }, exec);
  console.log(dispatched.note);
  const tracked = await workflow.track({ attempt_id: 101 }, exec);
  console.log(tracked.note);

  console.log('\n=== 请求记录（全部指向本地 mock） ===');
  for (const line of requests) console.log(`- ${line}`);
  console.log(`\nall requests went to ${new URL(baseUrl).host}; play.bohrium.com was not contacted.`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
