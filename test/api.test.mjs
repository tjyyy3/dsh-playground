import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPlaygroundClient,
  normalizeApiBase,
  PlaygroundApiError,
} from '../lib/api.js';
import {
  formatAttempt,
  formatAttemptList,
  formatChallenge,
  formatList,
  formatSubmission,
} from '../lib/format.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('normalizeApiBase accepts root and api URLs', () => {
  assert.equal(normalizeApiBase('https://play.bohrium.com'), 'https://play.bohrium.com/api');
  assert.equal(normalizeApiBase('https://play.bohrium.com/'), 'https://play.bohrium.com/api');
  assert.equal(normalizeApiBase('https://play.bohrium.com/api'), 'https://play.bohrium.com/api');
  assert.equal(normalizeApiBase('http://127.0.0.1:5000/api/'), 'http://127.0.0.1:5000/api');
});

test('normalizeApiBase rejects relative and empty values', () => {
  assert.throws(() => normalizeApiBase(''), PlaygroundApiError);
  assert.throws(() => normalizeApiBase('play.bohrium.com'), PlaygroundApiError);
});

['timeout', 'cancelled'].forEach((code) => {
  test(`request reports ${code} while reading the response body`, async () => {
    const caller = new AbortController();
    let bodyAborted = false;
    const client = createPlaygroundClient({
      baseUrl: 'https://example.test',
      timeoutMs: code === 'timeout' ? 20 : 1000,
      fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
        start(controller) {
          const finish = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            controller.enqueue(new TextEncoder().encode('{"items":[]}'));
            controller.close();
          }, 200);
          const abort = () => {
            bodyAborted = true;
            clearTimeout(finish);
            controller.error(new DOMException('Response body aborted', 'AbortError'));
          };
          signal.addEventListener('abort', abort, { once: true });
        },
      })),
    });
    const cancel = code === 'cancelled' ? setTimeout(() => caller.abort(), 20) : undefined;
    try {
      await assert.rejects(
        () => client.listChallenges({}, { signal: caller.signal }),
        (error) => error instanceof PlaygroundApiError && error.code === code,
      );
      assert.equal(bodyAborted, true);
    } finally {
      clearTimeout(cancel);
    }
  });
});

test('request reports a response body read failure as a network error', async () => {
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.error(new Error('connection reset while reading body'));
      },
    })),
  });
  await assert.rejects(
    () => client.listChallenges(),
    (error) => error instanceof PlaygroundApiError && error.code === 'network_error'
      && /connection reset/.test(error.message),
  );
});

test('listChallenges sends filters and normalizes cards', async () => {
  let requested;
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async (url) => {
      requested = url;
      return jsonResponse({
        items: [
          {
            id: 'demo-1',
            title: 'Demo',
            title_zh: '演示',
            disc: 'hep',
            difficulty: 2,
            attempts: 7,
            origin: 'community',
            status: 'open',
            tags: [{ name: 'tag-a' }],
            hasContent: true,
          },
          { id: 'demo-2', title: 'Second' },
        ],
        total: 42,
        page: 2,
        per_page: 2,
        pages: 21,
        has_more: true,
      });
    },
  });

  const result = await client.listChallenges({ search: 'demo', discipline: 'hep', page: 2, perPage: 2 });
  assert.equal(requested.origin + requested.pathname, 'https://example.test/api/challenges');
  assert.equal(requested.searchParams.get('search'), 'demo');
  assert.equal(requested.searchParams.get('disc'), 'hep');
  assert.equal(requested.searchParams.get('page'), '2');
  assert.equal(requested.searchParams.get('per_page'), '2');
  assert.equal(requested.searchParams.get('sort'), 'newest');
  assert.equal(result.total, 42);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.items[0].tags, ['tag-a']);
  assert.equal(result.items[0].titleZh, 'CI 失败验证');
});

test('listChallenges maps 404 to not_found', async () => {
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => jsonResponse({ error: 'Not found' }, 404),
  });
  await assert.rejects(
    () => client.getChallenge('missing'),
    (error) => error instanceof PlaygroundApiError && error.code === 'not_found' && error.status === 404,
  );
});

test('getChallenge returns content and resources', async () => {
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async (url) => {
      assert.match(url.pathname, /\/api\/challenges\/demo-1$/);
      return jsonResponse({
        id: 'demo-1',
        title: 'Demo',
        content: '# Problem\n\nDo the thing.',
        resources: [{ kind: 'tool', name: 'python', description: 'runtime' }],
        contentGated: false,
      });
    },
  });
  const detail = await client.getChallenge('demo-1');
  assert.match(detail.content, /Do the thing/);
  assert.equal(detail.resources[0].name, 'python');
});

test('competition endpoints normalize lifecycle data and discover challenge ids', async () => {
  const requests = [];
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async (url) => {
      requests.push(url.pathname);
      const season = { id: 3, slug: 's3', nameEn: 'Science Cup', nameZh: '科研赛', status: 'active', endAt: '2026-12-01T00:00:00Z' };
      return jsonResponse(url.pathname.endsWith('/3') ? { ...season, challengeIds: ['demo'] } : [season]);
    },
  });
  const list = await client.listCompetitions({ status: 'active' });
  assert.equal(list.total, 1);
  assert.equal(list.items[0].nameZh, '科研赛');
  assert.deepEqual((await client.getCompetition(3)).challengeIds, ['demo']);
  assert.deepEqual(requests, ['/api/hackathon/seasons', '/api/hackathon/seasons/3']);
  await assert.rejects(() => client.listCompetitions({ status: 'typo' }), (error) => error.code === 'invalid_argument');
});

test('getCurrentUser reports the authenticated Playground identity', async () => {
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test', token: 'test-token',
    fetchImpl: async (url, init) => {
      assert.equal(url.pathname, '/api/auth/me');
      assert.equal(init.headers.authorization, 'Bearer test-token');
      return jsonResponse({ id: 4, name: 'Ada Lovelace', email: 'ada@example.test', role: 'user', userType: 'human' });
    },
  });
  assert.deepEqual(await client.getCurrentUser(), {
    authenticated: true,
    baseUrl: 'https://example.test/api',
    user: { id: 4, name: 'Ada Lovelace', email: 'ada@example.test', role: 'user', userType: 'human' },
  });
});

test('getCurrentUser reports unauthenticated without sending an anonymous request', async () => {
  const client = createPlaygroundClient({ baseUrl: 'https://example.test', fetchImpl: () => assert.fail('must not fetch') });
  assert.deepEqual(await client.getCurrentUser(), { authenticated: false, baseUrl: 'https://example.test/api' });
});

test('personal submissions use authentication, preserve cursor filters and do not invent a zero score', async () => {
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test', token: 'test-token',
    fetchImpl: async (url, init) => {
      assert.equal(url.pathname, '/api/me/attempts');
      assert.equal(url.searchParams.get('cursor'), 'opaque.cursor');
      assert.equal(url.searchParams.get('challenge_id'), 'demo');
      assert.equal(url.searchParams.get('status'), 'submitted');
      assert.equal(init.headers.authorization, 'Bearer test-token');
      return jsonResponse({ items: [{ id: 9, challenge_id: 'demo', challenge_title: 'My test', status: 'submitted', score: null, scoring_state: 'queued', created_at: '2026-10-27' }], next_cursor: 'next.cursor', limit: 1 });
    },
  });
  const result = await client.listMyAttempts({ challengeId: 'demo', status: 'submitted', cursor: 'opaque.cursor', limit: 1 });
  assert.equal(result.items[0].challengeTitle, 'My test');
  assert.equal(result.items[0].score, undefined);
  assert.equal(result.items[0].scoringState.scoreIsFinal, false);
  assert.equal(result.nextCursor, 'next.cursor');
});

test('personal submissions refuse anonymous requests before accessing the network', async () => {
  const client = createPlaygroundClient({ baseUrl: 'https://example.test', fetchImpl: () => assert.fail('must not fetch') });
  await assert.rejects(() => client.listMyAttempts(), (error) => error.code === 'authentication_required');
});

test('listAttempts sends filters and normalizes rows', async () => {
  let requested;
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async (url) => {
      requested = url;
      return jsonResponse({
        attempts: [{
          id: 7,
          challengeId: 'demo',
          authorId: 'ada',
          author_name: 'Ada',
          status: 'scored',
          score: 12.5,
          bundleStatus: 'ready',
          createdAt: '2026-10-27T02:30:17+00:00',
          scoringState: { state: 'final', scoreIsFinal: true, displayScore: 12.5, actionNeeded: false },
          scorecard: { ignored: true },
        }, {
          id: 8,
          challengeId: 'demo',
          status: 'submitted',
          scoringState: { state: 'queued', scoreIsFinal: false },
        }],
        total: 2,
        totalNonDraft: 2,
      });
    },
  });

  const result = await client.listAttempts('demo', { page: 2, limit: 5, sort: 'newest', outcome: 'success' });
  assert.equal(requested.origin + requested.pathname, 'https://example.test/api/challenges/demo/attempts');
  assert.equal(requested.searchParams.get('page'), '2');
  assert.equal(requested.searchParams.get('limit'), '5');
  assert.equal(requested.searchParams.get('sort'), 'newest');
  assert.equal(requested.searchParams.get('outcome'), 'success');
  assert.equal(result.total, 2);
  assert.equal(result.totalNonDraft, 2);
  assert.equal(result.items[0].authorName, 'Ada');
  assert.equal(result.items[0].scoringState.state, 'final');
  assert.equal(result.items[0].scoringState.actionNeeded, false);
  assert.equal(result.items[0].scorecard, undefined);
  assert.equal(result.items[1].scoringState.scoreIsFinal, false);
});

test('getAttempt returns score, scoring state, and a bounded scorecard', async () => {
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async (url) => {
      assert.match(url.pathname, /\/api\/attempts\/99$/);
      return jsonResponse({
        id: 99,
        challengeId: 'demo',
        author_name: 'Ada',
        status: 'scored',
        score: 42,
        bundleStatus: 'ready',
        scoringState: {
          state: 'final',
          scoreIsFinal: true,
          displayScore: 42,
          workerStatus: 'succeeded',
          zeroReason: null,
        },
        scorecard: { dimensions: { evidence: 1 }, note: 'x'.repeat(8000) },
      });
    },
  });

  const attempt = await client.getAttempt(99);
  assert.equal(attempt.id, 99);
  assert.equal(attempt.scoringState.state, 'final');
  assert.equal(attempt.scoringState.displayScore, 42);
  assert.equal(attempt.scoringState.zeroReason, undefined);
  assert.equal(attempt.scorecardTruncated, true);
  assert.match(attempt.scorecard, /dimensions/);
});

test('createAttempt sends multipart fields and the trajectory file', async () => {
  let captured;
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    token: 'tok-1',
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse({ id: 99, challengeId: 'demo', status: 'submitted', bundleStatus: null }, 201);
    },
  });

  const result = await client.createAttempt('demo', {
    method: 'playground-test',
    model: 'deepseek-v4',
    type: 'agent',
    status: 'submitted',
    trace: '[]',
  }, [{
    field: 'raw_messages',
    filename: 'raw_messages.jsonl',
    data: new Blob(['{"type":"session_start"}\n'], { type: 'application/x-ndjson' }),
  }]);

  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.authorization, 'Bearer tok-1');
  assert.ok(captured.init.body instanceof FormData);
  assert.equal(captured.init.body.get('method'), 'playground-test');
  assert.equal(captured.init.body.get('model'), 'deepseek-v4');
  assert.equal(captured.init.body.get('trace'), '[]');
  const file = captured.init.body.get('raw_messages');
  assert.equal(file.name, 'raw_messages.jsonl');
  assert.match(await file.text(), /session_start/);
  assert.equal(result.attempt.id, 99);
  assert.equal(result.idempotentReuse, false);
});

test('createAttempt refuses to send without a token', async () => {
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => {
      throw new Error('must not reach the network');
    },
  });
  await assert.rejects(
    () => client.createAttempt('demo', { status: 'submitted' }, []),
    (error) => error instanceof PlaygroundApiError && error.code === 'authentication_required',
  );
});

test('uploadBundle sends the zip and keeps validation on a 400 rejection', async () => {
  let captured;
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    token: 'tok-1',
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse({
        bundleStatus: 'failed',
        violations: [{
          rule: 'invalid_bundle',
          message: 'arm_manifest.json is missing',
          fix: 'Put it at the zip root.',
          docs: '/api/protocol#bundle-layout',
        }],
        validation: { valid: false, errors: ['arm_manifest.json is missing'] },
        attempt: { id: 99, status: 'submitted', challengeId: 'demo' },
      }, 400);
    },
  });

  const result = await client.uploadBundle(99, {
    filename: 'arm.zip',
    data: new Blob(['zip-bytes'], { type: 'application/zip' }),
  });

  assert.equal(captured.init.method, 'POST');
  assert.ok(captured.init.body instanceof FormData);
  const file = captured.init.body.get('bundle');
  assert.equal(file.name, 'arm.zip');
  assert.equal(result.bundleStatus, 'failed');
  assert.equal(result.violations[0].rule, 'invalid_bundle');
  assert.match(result.validation, /missing/);
  assert.equal(result.attempt.id, 99);
});

test('uploadBundle rejects a 400 that is not a bundle verdict', async () => {
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    token: 'tok-1',
    fetchImpl: async () => jsonResponse({ error: 'Not authorized' }, 400),
  });
  await assert.rejects(
    () => client.uploadBundle(99, { filename: 'arm.zip', data: new Blob(['zip-bytes']) }),
    (error) => error instanceof PlaygroundApiError && /Not authorized/.test(error.message),
  );
});

test('formatters produce a table and a bounded problem statement', () => {
  const text = formatList({
    total: 2,
    page: 1,
    pages: 1,
    perPage: 2,
    hasMore: false,
    items: [
      { id: 'a', title: 'Alpha', discipline: 'hep', difficulty: 1, attempts: 3 },
      { id: 'b', title: 'Beta | pipe' },
    ],
  });
  assert.match(text, /\*\*2\*\* challenge/);
  assert.match(text, /`a`/);
  assert.match(text, /Beta \\\| pipe/);

  const detail = formatChallenge({
    id: 'a',
    title: 'Alpha',
    content: 'x'.repeat(200),
    resources: [{ name: 'data', kind: 'dataset' }],
    contentGated: false,
  }, { maxContentChars: 50 });
  assert.match(detail, /truncated/);
  assert.match(detail, /## Resources/);
});

test('attempt formatters show scoring state and submission outcome', () => {
  const list = formatAttemptList({
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
  assert.match(list, /Submissions for `demo`/);
  assert.match(list, /\| 7 \| Ada \|/);
  assert.match(list, /final/);

  const attempt = formatAttempt({
    id: 7,
    challengeId: 'demo',
    status: 'scored',
    score: 12,
    scoringState: { state: 'final', scoreIsFinal: true, displayScore: 12, actionNeeded: false },
    scorecard: '{"dimensions":{}}',
  });
  assert.match(attempt, /# Submission 7/);
  assert.match(attempt, /final score: 12/);
  assert.match(attempt, /## Scorecard/);

  const submitted = formatSubmission({
    ok: true,
    attemptId: 99,
    challengeId: 'demo',
    created: true,
    bundleStatus: 'ready',
    status: 'submitted',
    note: 'The bundle was accepted and scoring was triggered.',
  });
  assert.match(submitted, /Submission 99 created/);
  assert.match(submitted, /playground_get_attempt/);
});
