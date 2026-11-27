import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  createPlaygroundClient,
  normalizeApiBase,
  normalizeAttempt,
  PlaygroundApiError,
} from '../lib/api.js';
import {
  formatAttempt,
  formatAttemptList,
  formatChallenge,
  formatList,
} from '../lib/format.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function chunkedResponse(chunks, { status = 200, headers, read = () => {}, cancel = () => {} } = {}) {
  let index = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (index === chunks.length) controller.close();
      else {
        read();
        controller.enqueue(chunks[index++]);
      }
    },
    cancel,
  }, { highWaterMark: 0 }), { status, headers });
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

test('#79: API bases reject userinfo before fetching or resolving a token without echoing credentials', () => {
  let fetches = 0;
  let tokenLookups = 0;
  for (const userinfo of ['api-user:password-secret', 'api-user', ':password-secret', 'encoded%2Duser:password%2Dsecret']) {
    const baseUrl = `https://${userinfo}@example.test/path?token=query-secret#fragment-secret`;
    for (const normalize of [
      () => normalizeApiBase(baseUrl),
      () => createPlaygroundClient({
        baseUrl,
        resolveToken: async () => { tokenLookups += 1; return '{{SECRET_gcw5aydp}}'; },
        fetchImpl: async () => { fetches += 1; return jsonResponse({ id: 4 }); },
      }),
    ]) {
      assert.throws(normalize, (error) => {
        assert.ok(error instanceof PlaygroundApiError);
        assert.equal(error.code, 'invalid_config');
        assert.doesNotMatch(String(error) + JSON.stringify(error), /api-user|password-secret|query-secret|fragment-secret|encoded|password%2Dsecret/);
        return true;
      });
    }
  }
  assert.equal(fetches, 0);
  assert.equal(tokenLookups, 0);
});

test('#79: invalid and unsupported API URLs do not echo the input or its secrets', () => {
  for (const baseUrl of [
    'bad URL api-user:password-secret?token=query-secret',
    'https://api-user:password-secret@/?token=query-secret',
    'http2://api-user:password-secret@example.test/?token=query-secret',
    'ftp://example.test/?token=query-secret',
  ]) {
    assert.throws(() => normalizeApiBase(baseUrl), (error) => {
      assert.ok(error instanceof PlaygroundApiError);
      assert.equal(error.code, 'invalid_config');
      assert.doesNotMatch(String(error) + JSON.stringify(error), /api-user|password-secret|query-secret|token=/);
      return true;
    });
  }
});

test('#79: returned API bases and identity results omit query strings and fragments', async () => {
  const baseUrl = 'https://example.test/path/?token=query-secret#fragment-secret';
  const expected = 'https://example.test/path/api';
  assert.equal(normalizeApiBase(baseUrl), expected);
  for (const token of [undefined, '{{SECRET_nscqxmdb}}']) {
    const client = createPlaygroundClient({
      baseUrl, token,
      fetchImpl: async (url) => {
        assert.equal(url.toString(), `${expected}/auth/me`);
        return jsonResponse({ id: 4 });
      },
    });
    assert.equal(client.baseUrl, expected);
    const identity = await client.getCurrentUser();
    assert.equal(identity.baseUrl, expected);
    assert.doesNotMatch(JSON.stringify(identity), /query-secret|fragment-secret|token=/);
  }
});

test('#76: HTTPS API bases preserve paths and send a synthetic token on reads', async () => {
  for (const [baseUrl, expected] of [
    [undefined, 'https://play.bohrium.com/api'],
    ['https://example.test:8443/playground/?discard=1#fragment', 'https://example.test:8443/playground/api'],
    ['https://example.test/playground/API/', 'https://example.test/playground/API'],
  ]) {
    const client = createPlaygroundClient({
      baseUrl,
      token: 'synthetic-https-token',
      fetchImpl: async (url, init) => {
        assert.equal(url.toString(), `${expected}/auth/me`);
        assert.equal(init.headers.authorization, 'Bearer synthetic-https-token');
        assert.equal(init.redirect, 'error');
        return jsonResponse({ id: 4, name: 'Ada' });
      },
    });
    assert.equal(client.baseUrl, expected);
    assert.equal((await client.getCurrentUser()).authenticated, true);
  }
});

test('#76: each documented loopback HTTP host supports ports and authenticated reads', async () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const baseUrl = `http://${host}:15000/api`;
    const client = createPlaygroundClient({
      baseUrl,
      token: 'synthetic-loopback-token',
      fetchImpl: async (url, init) => {
        assert.equal(url.toString(), `${baseUrl}/auth/me`);
        assert.equal(init.headers.authorization, 'Bearer synthetic-loopback-token');
        return jsonResponse({ id: 4, name: 'Ada' });
      },
    });
    assert.equal((await client.getCurrentUser()).authenticated, true);
  }
});

test('#76: direct clients reject remote HTTP before token lookup or any read request', async () => {
  let fetches = 0;
  let tokenLookups = 0;
  const token = 'synthetic-http-token';
  for (const host of [
    'example.test', 'localhost.example.test', '127.0.0.1.example.test',
    'localhost@remote.example.test', '192.168.1.20', '10.0.0.2', '[::2]',
  ]) {
    for (const read of [
      (client) => client.getCurrentUser(),
      (client) => client.getAttempt(42),
      (client) => client.listChallenges(),
    ]) {
      await assert.rejects(async () => read(createPlaygroundClient({
        baseUrl: `http://${host}:5000/?token=${token}`,
        token,
        resolveToken: async () => { tokenLookups += 1; return token; },
        fetchImpl: async () => { fetches += 1; return jsonResponse({ id: 4, items: [] }); },
      })), (error) => {
        assert.ok(error instanceof PlaygroundApiError);
        assert.equal(error.code, 'invalid_config');
        assert.match(error.message, /HTTPS/i);
        assert.doesNotMatch(String(error) + JSON.stringify(error), new RegExp(token));
        return true;
      });
    }
  }
  assert.equal(tokenLookups, 0);
  assert.equal(fetches, 0);
});

test('#76: native fetch refuses every redirect without requesting its target', async () => {
  const token = 'synthetic-redirect-token';
  let status = 302;
  let sourceRequests = 0;
  let targetRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/redirect-target') {
      targetRequests += 1;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ id: 4, items: [] }));
      return;
    }
    sourceRequests += 1;
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    response.writeHead(status, { location: `http://127.0.0.1:${server.address().port}/redirect-target` });
    response.end(token);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const client = createPlaygroundClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, token });
    for (status of [301, 302, 303, 307, 308]) {
      for (const read of [
        () => client.getCurrentUser(),
        () => client.getAttempt(42),
        () => client.listChallenges(),
      ]) {
        await assert.rejects(read, (error) => {
          assert.ok(error instanceof PlaygroundApiError);
          assert.equal(error.code, 'redirect_refused');
          assert.match(error.message, /API answered with a redirect/);
          assert.match(error.message, /does not follow/);
          assert.match(error.message, /final HTTPS API endpoint/);
          assert.doesNotMatch(String(error) + JSON.stringify(error), new RegExp(token));
          return true;
        });
      }
    }
    assert.equal(sourceRequests, 15);
    assert.equal(targetRequests, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
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

test('#78: a fetchImpl response without a body property is invalid', async () => {
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  await assert.rejects(() => client.listChallenges(), (error) => {
    assert.equal(error.code, 'invalid_response');
    assert.equal(error.status, 200);
    assert.match(error.message, /fetchImpl/);
    return true;
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

for (const status of [200, 503]) {
  for (const contentLength of [undefined, '1', 'invalid', '1000000']) {
    test(`#78: oversized HTTP ${status} body stops and cancels with Content-Length ${contentLength}`, async () => {
      const chunks = ['{"items":[]}', ' ', 'body-secret-never-returned', 'unread-tail'].map((text) => new TextEncoder().encode(text));
      let reads = 0;
      let cancelled = false;
      const response = chunkedResponse(chunks, {
        status,
        headers: contentLength === undefined ? {} : { 'content-length': contentLength },
        read: () => { reads += 1; },
        cancel: () => { cancelled = true; },
      });
      let fetches = 0;
      const client = createPlaygroundClient({
        baseUrl: 'https://example.test',
        maxResponseBytes: chunks[0].byteLength + chunks[1].byteLength,
        fetchImpl: async () => { fetches += 1; return response; },
      });
      await assert.rejects(() => client.listChallenges(), (error) => {
        assert.ok(error instanceof PlaygroundApiError);
        assert.equal(error.code, 'response_too_large');
        assert.equal(error.status, status);
        assert.match(error.message, /too large.*read completely/);
        assert.doesNotMatch(String(error) + JSON.stringify(error), /body-secret|unread-tail|items/);
        return true;
      });
      assert.equal(reads, 3);
      assert.equal(cancelled, true);
      assert.equal(response.body.locked, false);
      assert.equal(fetches, 1);
    });
  }
}

test('#78: the byte budget allows its exact UTF-8 boundary and rejects one byte over it', async () => {
  const body = { id: 'demo', content: '中文🙂' };
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const split = bytes.indexOf(0xe4) + 1;
  for (const headroom of [0, 1, -1]) {
    let cancelled = false;
    const client = createPlaygroundClient({
      baseUrl: 'https://example.test',
      maxResponseBytes: bytes.byteLength + headroom,
      fetchImpl: async () => chunkedResponse([bytes.slice(0, split), bytes.slice(split, split + 3), bytes.slice(split + 3)], {
        cancel: () => { cancelled = true; },
      }),
    });
    if (headroom < 0) {
      await assert.rejects(() => client.getChallenge('demo'), (error) => error.code === 'response_too_large');
      assert.equal(cancelled, true);
    } else {
      assert.equal((await client.getChallenge('demo')).content, body.content);
      assert.equal(cancelled, false);
    }
  }
});

test('#78: a large declared Content-Length cannot prevent reading a small complete body', async () => {
  const bytes = new TextEncoder().encode('{"items":[]}');
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    maxResponseBytes: bytes.byteLength,
    fetchImpl: async () => chunkedResponse([bytes], { headers: { 'content-length': '1000000' } }),
  });
  assert.deepEqual((await client.listChallenges()).items, []);
});

test('#78: a cancellation failure cannot hide the response-too-large error', async () => {
  const response = chunkedResponse([new TextEncoder().encode('body-secret')], {
    status: 502,
    cancel() { throw new Error('cleanup failed'); },
  });
  const client = createPlaygroundClient({ baseUrl: 'https://example.test', maxResponseBytes: 1, fetchImpl: async () => response });
  await assert.rejects(() => client.getAttempt(42), (error) => error.code === 'response_too_large' && error.status === 502);
  assert.equal(response.body.locked, false);
});

test('#78: identity and result reads propagate oversized bodies without interpreting the status or retrying', async () => {
  for (const status of [200, 401, 403, 429]) {
    for (const read of [(client) => client.getChallenge('demo'), (client) => client.getCurrentUser(), (client) => client.getAttempt(42)]) {
      const requests = [];
      const client = createPlaygroundClient({
        baseUrl: 'https://example.test', token: 'synthetic-token', maxResponseBytes: 1,
        fetchImpl: async (url, init) => {
          requests.push({ url, method: init.method });
          return jsonResponse({ error: 'body-secret', id: 42, status: 'scored' }, status);
        },
      });
      await assert.rejects(() => read(client), (error) => error.code === 'response_too_large' && error.status === status);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, 'GET');
    }
  }
});

test('#78: the default budget admits long challenge, paged list, and scoring bodies', async () => {
  const content = '研究笔记 '.repeat(100000);
  const responses = [
    { id: 'demo', content, title: 'Long challenge' },
    { items: Array.from({ length: 50 }, (_, index) => ({ id: `demo-${index}`, title: '长标题'.repeat(400) })), total: 50 },
    { id: 42, scorecard: { analysis: content }, status: 'scored', score: 0.87 },
  ];
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => {
      const bytes = new TextEncoder().encode(JSON.stringify(responses.shift()));
      return chunkedResponse(Array.from({ length: Math.ceil(bytes.byteLength / 1024) }, (_, index) => bytes.slice(index * 1024, (index + 1) * 1024)));
    },
  });
  assert.equal((await client.getChallenge('demo')).content, content);
  assert.equal((await client.listChallenges({ perPage: 50 })).items.length, 50);
  const result = await client.getAttempt(42);
  assert.equal(result.status, 'scored');
  assert.equal(result.score, 0.87);
  assert.equal(result.scorecardTruncated, true);
});

test('#78: response byte budgets must be positive safe integers', () => {
  for (const maxResponseBytes of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10']) {
    assert.throws(() => createPlaygroundClient({ baseUrl: 'https://example.test', maxResponseBytes }), (error) => error.code === 'invalid_config');
  }
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
  assert.equal(result.items[0].titleZh, '演示');
});

test('listChallenges sends the tag filter and leaves it out when empty', async () => {
  const requests = [];
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async (url) => { requests.push(url); return jsonResponse({ items: [{ id: 'demo-1', title: 'Demo' }], total: 1 }); },
  });
  await client.listChallenges({ tag: ' 追光者计划·招募赛 ', season: 's2' });
  await client.listChallenges({ tag: '' });
  await client.listChallenges({});
  assert.equal(requests[0].searchParams.get('tag'), '追光者计划·招募赛');
  assert.equal(requests[0].searchParams.get('season'), 's2');
  assert.equal(requests[1].searchParams.has('tag'), false);
  assert.equal(requests[2].searchParams.has('tag'), false);
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
  assert.equal(detail.agentPrompt, undefined);
  assert.equal(detail.hackathonSeasonId, undefined);
});

test('#67: getChallenge keeps a non-empty agentPrompt and an integer hackathonSeasonId', async () => {
  const detail = (raw) => createPlaygroundClient({ baseUrl: 'https://example.test',
    fetchImpl: async () => jsonResponse({ id: 'demo-1', title: 'Demo', content: '', ...raw }) }).getChallenge('demo-1');
  const kept = await detail({ agentPrompt: 'Own prompt', hackathonSeasonId: 4 });
  assert.equal(kept.agentPrompt, 'Own prompt');
  assert.equal(kept.hackathonSeasonId, 4);
  const dropped = await detail({ agentPrompt: '  ', hackathonSeasonId: '4' });
  assert.equal(dropped.agentPrompt, undefined);
  assert.equal(dropped.hackathonSeasonId, undefined);
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
  assert.deepEqual(await client.getCurrentUser(), { authenticated: false, baseUrl: 'https://example.test/api', reason: 'no_token' });
});

test('#12: getCurrentUser tells a missing token from a refused one, and a 403 does not throw', async () => {
  let status = 401;
  const client = createPlaygroundClient({ baseUrl: 'https://example.test', token: 'test-token',
    fetchImpl: async () => jsonResponse({ error: 'invalid token test-token' }, status) });
  assert.deepEqual(await client.getCurrentUser(), { authenticated: false, baseUrl: 'https://example.test/api', reason: 'rejected' });
  status = 403;
  assert.deepEqual(await client.getCurrentUser(), { authenticated: false, baseUrl: 'https://example.test/api', reason: 'forbidden' });
  // Other failures still throw, so a caller can tell an unreachable platform from a refused token.
  status = 503;
  await assert.rejects(() => client.getCurrentUser(), (error) => error.status === 503);
  const offline = createPlaygroundClient({ baseUrl: 'https://example.test', token: 'test-token',
    fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(() => offline.getCurrentUser(), (error) => error.code === 'network_error');
});

test('#12: getCurrentUser keeps Agent identity fields in camelCase, snake_case and a { user } wrapper', async () => {
  let body;
  const client = createPlaygroundClient({ baseUrl: 'https://example.test', token: 'test-token', fetchImpl: async () => jsonResponse(body) });
  const read = async (value) => { body = value; return (await client.getCurrentUser()).user; };
  assert.deepEqual(await read({ id: 4, name: 'Ada', email: 'ada@example.test', user_type: 'human' }),
    { id: 4, name: 'Ada', email: 'ada@example.test', userType: 'human' });
  assert.deepEqual(await read({ id: 9, name: 'deepseek', userType: 'agent', operatorId: 4, operatorName: 'Ada', operatorConfirmed: true, agentFramework: 'dsh' }),
    { id: 9, name: 'deepseek', userType: 'agent', operatorId: 4, operatorName: 'Ada', operatorConfirmed: true, agentFramework: 'dsh' });
  assert.deepEqual(await read({ id: 9, name: 'deepseek', user_type: 'agent', operator_id: '4', operator_name: 'Ada', operator_confirmed: false, agent_framework: 'codex' }),
    { id: 9, name: 'deepseek', userType: 'agent', operatorId: 4, operatorName: 'Ada', operatorConfirmed: false, agentFramework: 'codex' });
  // The CLI accepts `{ user }` too; fields that sit only on the envelope are kept.
  assert.deepEqual(await read({ user: { id: 9, name: 'deepseek', user_type: 'agent' }, operator_id: 4, operator_confirmed: true }),
    { id: 9, name: 'deepseek', userType: 'agent', operatorId: 4, operatorConfirmed: true });
  assert.deepEqual(await read({ id: 9, name: 'deepseek', userType: 'agent', operator: { id: 'op-1', name: 'Ada' } }),
    { id: 9, name: 'deepseek', userType: 'agent', operatorId: 'op-1', operatorName: 'Ada' });
  for (const id of ['agent-5', '0005']) assert.equal((await read({ id, name: 'Agent' })).id, id);
  assert.deepEqual(await read({ id: 'envelope', user: { profile: { id: 'agent-5', name: 'Alex', user_type: 'agent' } } }),
    { id: 'agent-5', name: 'Alex', userType: 'agent' });
  assert.equal((await read({ user: { id: 'account', profile: { id: 'profile' } } })).id, 'account');
  // Odd values are dropped rather than shown.
  assert.deepEqual(await read({ id: 9, name: 'deepseek', operatorId: -1, operatorConfirmed: 'maybe', agentFramework: 7 }), { id: 9, name: 'deepseek' });
});

test('personal history reads the authenticated unpaginated array and rejects other shapes', async () => {
  let body = [{ attemptId: 3, challengeId: 'demo', time: '2026-11-06T16:30:00Z', authorId: 'user-5' }];
  const client = createPlaygroundClient({ baseUrl: 'https://example.test', token: 'fixture',
    fetchImpl: async (url, init) => {
      assert.equal(url.pathname, '/api/user-submissions');
      assert.equal(url.search, '');
      assert.equal(init.headers.authorization, 'Bearer fixture');
      return jsonResponse(body);
    } });
  assert.deepEqual(await client.getUserSubmissions(), body);
  body = { items: [] };
  await assert.rejects(() => client.getUserSubmissions(), { code: 'invalid_response' });
});

const normalizeListRows = (items) => items.map((item) => normalizeAttempt(item, { detailed: false }));

test('list rows with a snake_case scoring_state treat only final and late_scored as a final score', async () => {
  const rows = normalizeListRows([
    { id: 1, status: 'scored', score: 12, scoring_state: 'final' },
    // Observed platform shape: late_scored is a submission status paired with scoring state final.
    { id: 2, status: 'late_scored', score: 64, scoring_state: 'final' },
    { id: 3, status: 'scored', score: 0, scoring_state: 'final' },
    // Assumed shape, not observed on the platform: late_scored as a scoring state.
    { id: 4, status: 'late_scored', score: 64, scoring_state: 'late_scored' },
  ]);
  assert.deepEqual(rows.map((row) => row.scoringState), [
    { state: 'final', scoreIsFinal: true, displayScore: 12 },
    { state: 'final', scoreIsFinal: true, displayScore: 64 },
    { state: 'final', scoreIsFinal: true, displayScore: 0 },
    { state: 'late_scored', scoreIsFinal: true, displayScore: 64 },
  ]);
  assert.deepEqual(rows.map((row) => row.score), [12, 64, 0, 64]);
});

test('personal submissions only accept a real number as the score of a final snake_case state', async () => {
  const rows = normalizeListRows([
    { id: 1, status: 'scored', score: true, scoring_state: 'final' },
    { id: 2, status: 'scored', score: ' ', scoring_state: 'final' },
    { id: 3, status: 'scored', score: '12', scoring_state: 'final' },
  ]);
  for (const row of rows) assert.deepEqual(row.scoringState, { state: 'final', scoreIsFinal: false }, `attempt ${row.id}`);
});

test('personal submissions normalise an object under scoring_state like scoringState', async () => {
  const rows = normalizeListRows([
    { id: 1, status: 'scored', score: 12, scoring_state: { state: 'final', scoreIsFinal: true, displayScore: 12 } },
    { id: 2, status: 'submitted', score: 0, scoring_state: { state: 'queued', scoreIsFinal: false, provisionalScore: 0 } },
  ]);
  assert.deepEqual(rows[0].scoringState, { state: 'final', scoreIsFinal: true, displayScore: 12 });
  assert.deepEqual(rows[1].scoringState, { state: 'queued', scoreIsFinal: false, provisionalScore: 0 });
});

test('list rows with a snake_case queued, evaluating or pending state never carry a final score', async () => {
  const rows = normalizeListRows([
    { id: 1, status: 'submitted', score: 0, scoring_state: 'queued' },
    { id: 2, status: 'submitted', score: 7, scoring_state: 'queued' },
    { id: 3, status: 'submitted', score: 41, scoring_state: 'evaluating' },
    { id: 4, status: 'pending_review', score: 0, scoring_state: 'pending_review' },
  ]);
  for (const row of rows) {
    assert.equal(row.scoringState.scoreIsFinal, false, `attempt ${row.id}`);
    assert.equal(row.scoringState.displayScore, undefined, `attempt ${row.id}`);
    assert.equal(row.scoringState.provisionalScore, undefined, `attempt ${row.id}`);
  }
  assert.deepEqual(rows.map((row) => row.scoringState.state), ['queued', 'queued', 'evaluating', 'pending_review']);
  assert.deepEqual(rows.map((row) => row.score), [0, 7, 41, 0]);
});

test('list rows with a snake_case failed or rejected state are not final even with a score', async () => {
  const rows = normalizeListRows([
    { id: 1, status: 'scored', score: 0, scoring_state: 'failed' },
    { id: 2, status: 'scored', score: 72, scoring_state: 'rejected' },
  ]);
  assert.deepEqual(rows.map((row) => row.scoringState), [
    { state: 'failed', scoreIsFinal: false },
    { state: 'rejected', scoreIsFinal: false },
  ]);
});

test('personal submissions with a final state and no numeric score are not final', async () => {
  const rows = normalizeListRows([{ id: 1, status: 'scored', score: null, scoring_state: 'final' }]);
  assert.deepEqual(rows[0].scoringState, { state: 'final', scoreIsFinal: false });
});

test('personal submissions with no scoring state and a numeric score get no scoring state, so the score is never final', async () => {
  const rows = normalizeListRows([{ id: 1, status: 'submitted', score: 0 }, { id: 2, status: 'scored', score: 55 }]);
  assert.equal(rows[0].scoringState, undefined);
  assert.equal(rows[1].scoringState, undefined);
  assert.deepEqual(rows.map((row) => row.score), [0, 55]);
});

test('personal submissions keep an explicit camelCase scoringState with its scoreIsFinal flag unchanged', async () => {
  const rows = normalizeListRows([
    { id: 1, status: 'scored', score: 12, scoringState: { state: 'final', scoreIsFinal: true, displayScore: 12 } },
    { id: 2, status: 'submitted', score: 0, scoringState: { state: 'queued', scoreIsFinal: false, provisionalScore: 0 } },
    { id: 3, status: 'submitted', score: 9, scoringState: { state: 'evaluating', scoreIsFinal: false, provisionalScore: 9 } },
    { id: 4, status: 'submitted', score: 5, scoring_state: 'queued', scoringState: { state: 'final', scoreIsFinal: true, displayScore: 5 } },
  ]);
  assert.deepEqual(rows[0].scoringState, { state: 'final', scoreIsFinal: true, displayScore: 12 });
  assert.deepEqual(rows[1].scoringState, { state: 'queued', scoreIsFinal: false, provisionalScore: 0 });
  assert.deepEqual(rows[2].scoringState, { state: 'evaluating', scoreIsFinal: false, provisionalScore: 9 });
  assert.deepEqual(rows[3].scoringState, { state: 'final', scoreIsFinal: true, displayScore: 5 });
});

test('personal submissions refuse anonymous requests before accessing the network', async () => {
  const client = createPlaygroundClient({ baseUrl: 'https://example.test', fetchImpl: () => assert.fail('must not fetch') });
  await assert.rejects(() => client.getUserSubmissions(), (error) => error.code === 'authentication_required');
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
    resources: [
      { name: 'data', kind: 'dataset' },
      { name: 'weights', kind: 'model', role: 'input', description: 'pretrained', source: 'https://example.test/weights.bin' },
    ],
    contentGated: false,
  }, { maxContentChars: 50 });
  assert.match(detail, /truncated/);
  assert.match(detail, /## Resources/);
  const resourceLines = detail.split('\n').filter((line) => line.startsWith('- '));
  assert.equal(resourceLines[0], '- dataset · data');
  assert.equal(resourceLines[1], '- model · weights (input) — pretrained [source: https://example.test/weights.bin]');
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


});

test('getChallengeFacets reads the discipline counts and rejects a response without them', async () => {
  const requested = [];
  let body = { attempts: 48415, total: 6985, unclassified: 2354, formalDisciplines: { materials: 1411, ' physics ': 1307, zero: 0, '': 2 }, subDisciplines: {},
    disciplines: { materials: 1411, ' physics ': 1307, '': 5, ['x'.repeat(101)]: 9, zero: 0, half: 1.5, text: '3' } };
  const client = createPlaygroundClient({ baseUrl: 'https://example.test', fetchImpl: async (url) => { requested.push(url); return jsonResponse(body); } });
  assert.deepEqual(await client.getChallengeFacets(), { total: 6985, unclassified: 2354, disciplines: { materials: 1411, physics: 1307 },
    formalDisciplines: { materials: 1411, physics: 1307 } });
  assert.equal(requested[0].origin + requested[0].pathname, 'https://example.test/api/challenges/facets');
  assert.equal(requested[0].search, '');
  // A missing or malformed formal set is left out; the disciplines still answer.
  for (const formalDisciplines of [undefined, null, [], 'materials']) {
    body = { disciplines: { materials: 1411 }, ...(formalDisciplines === undefined ? {} : { formalDisciplines }) };
    assert.deepEqual(await client.getChallengeFacets(), { disciplines: { materials: 1411 } }, JSON.stringify(formalDisciplines));
  }
  for (body of [null, [], { total: 1 }, { disciplines: [] }, { disciplines: null }]) {
    await assert.rejects(() => client.getChallengeFacets(), (error) => error instanceof PlaygroundApiError && error.code === 'invalid_response', JSON.stringify(body));
  }
});



// #58: the shapes GET /attempts/<id> returned on 2026-11-05 for #63167 (queued, owner view, bundle never
// arrived), #63116 (closed by the platform as bundle missing) and #63179 (failed for another reason).
test('#58: normalizeAttempt keeps execStatus, the owner-only scoringQueue facts and the platform\'s "bundle missing" closure, never its text', () => {
  const marker = '[未评测 · 未收到提交包] 我们没有收到你的提交包（上传未完成），本次没有评分，也不会自动重评。请重新提交。 / [Not evaluated - bundle missing] Your submission bundle never reached the evaluation worker, so nothing was scored. Please re-submit.';
  const queued = normalizeAttempt({ id: 63167, status: 'submitted', execStatus: null, changelog: null,
    scoringState: { state: 'queued', scoreIsFinal: false },
    scoringQueue: { notReceivedAfterMinutes: 30, queuePosition: null, stage: 'awaiting_receipt', submittedAt: '2026-11-05T06:41:22+00:00', waitingSeconds: 310, workerReceivedAt: null, extra: 'dropped' } });
  assert.deepEqual(queued.scoringQueue, { stage: 'awaiting_receipt', submittedAt: '2026-11-05T06:41:22+00:00', notReceivedAfterMinutes: 30, waitingSeconds: 310 });
  assert.equal(queued.execStatus, undefined);
  assert.equal(queued.bundleNotReceived, undefined);
  for (const [label, raw] of [
    ['detail', { id: 63116, status: 'pending_review', execStatus: 'failed', changelog: marker, execLog: `${marker} (attempt 63116, 20261105T051511Z)`, scoringQueue: null, scoringState: { state: 'failed', scoreIsFinal: false } }],
    ['list item, English marker only', { id: 63116, status: 'pending_review', execStatus: 'failed', changelog: '[Not evaluated - bundle missing] gone', scoringQueue: null }],
    ['snake_case list item, Chinese marker only', { id: 62912, status: 'pending_review', scoring_state: 'failed', exec_status: 'failed', exec_log: '[未评测 · 未收到提交包] …' }],
  ]) {
    const closed = normalizeAttempt(raw, { detailed: false });
    assert.equal(closed.bundleNotReceived, true, label);
    assert.equal(closed.execStatus, 'failed', label);
    assert.equal(closed.scoringQueue, undefined, label);
    assert.doesNotMatch(JSON.stringify(closed), /未收到提交包|bundle missing|re-submit/, label);
  }
  // A failure for another reason, or the marker on an attempt that did not fail, is not this closure.
  assert.equal(normalizeAttempt({ id: 63179, status: 'pending_review', execStatus: 'failed', changelog: null, scoringState: { state: 'failed' } }).bundleNotReceived, undefined);
  assert.equal(normalizeAttempt({ id: 1, status: 'scored', execStatus: 'completed', changelog: marker, scoringState: { state: 'final', scoreIsFinal: true } }).bundleNotReceived, undefined);
  // The Worker's receipt time is kept: it is the platform's evidence that the bundle arrived.
  assert.equal(normalizeAttempt({ id: 2, scoringQueue: { stage: 'queued', workerReceivedAt: '2026-11-05T06:50:00+00:00' } }).scoringQueue.workerReceivedAt, '2026-11-05T06:50:00+00:00');
  // The agent's text view of one submission says both.
  const closedText = formatAttempt(normalizeAttempt({ id: 63116, status: 'pending_review', execStatus: 'failed', changelog: marker, scoringState: { state: 'failed' } }));
  assert.match(closedText, /closed by the platform: bundle not received（未收到评测包）.*only a new submission, confirmed by the user, helps/);
  assert.doesNotMatch(closedText, /re-submit|我们没有收到/);
  assert.match(formatAttempt(queued), /- queue stage: awaiting_receipt · Worker receipt: not yet/);
});

test('#62: listMyAgents reads the account\'s Agent accounts with the token, and attempts keep the quota and Agent flags', async () => {
  const requests = [];
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test', token: 'synthetic-token-62',
    fetchImpl: async (url, init) => {
      requests.push([String(url), init.headers.authorization]);
      if (String(url).endsWith('/agent/register')) {
        return jsonResponse([
          { agentUser: { id: 'opencode-glm', name: 'opencode-glm', agentFramework: 'opencode', operatorConfirmed: true, operatorId: '1', userType: 'agent' }, persona: null },
          { agentUser: { id: 'pending-agent', name: 'Pending', agentFramework: 'Codex', operatorConfirmed: false }, persona: null },
          { agentUser: { name: 'no id' } },
        ]);
      }
      return jsonResponse({ attempts: [{ id: 9, authorId: 'opencode-glm', author_name: 'opencode-glm', authorIsAgent: true, countsTowardQuota: false, created_at: '2026-11-06T00:00:00Z', status: 'scored' }], total: 1 });
    },
  });
  assert.deepEqual(await client.listMyAgents(), { items: [
    { id: 'opencode-glm', name: 'opencode-glm', framework: 'opencode', confirmed: true },
    { id: 'pending-agent', name: 'Pending', framework: 'Codex', confirmed: false },
  ] });
  assert.deepEqual(requests[0], ['https://example.test/api/agent/register', 'Bearer synthetic-token-62']);
  const listed = await client.listAttempts('challenge-a', { sort: 'newest', limit: 100 });
  assert.equal(listed.items[0].authorId, 'opencode-glm');
  assert.equal(listed.items[0].authorName, 'opencode-glm');
  assert.equal(listed.items[0].authorIsAgent, true);
  assert.equal(listed.items[0].countsTowardQuota, false);
  assert.equal(listed.items[0].createdAt, '2026-11-06T00:00:00Z');
  const anonymous = createPlaygroundClient({ baseUrl: 'https://example.test', fetchImpl: () => assert.fail('must not fetch') });
  await assert.rejects(() => anonymous.listMyAgents(), (error) => error.code === 'authentication_required');
});

test('#112: listTaggedChallengeTags reads every page the contest tag selects anonymously and keeps the other tags of each challenge', async () => {
  const requests = [];
  const authorizations = [];
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test', token: 'synthetic-token-62',
    fetchImpl: async (url, init) => {
      requests.push(url);
      authorizations.push(init.headers.authorization);
      const page = Number(url.searchParams.get('page'));
      if (page === 1) {
        return jsonResponse({
          items: [
            { id: 'c-1', tags: [{ name: '追光者计划·招募赛' }, { name: '材料' }] },
            { id: 'c-2', tags: ['追光者计划·招募赛', ' 生物 '] },
            { id: '', tags: ['追光者计划·招募赛', '材料'] },
            'not an object',
          ],
          has_more: true,
        });
      }
      return jsonResponse({ items: [{ id: 'c-4', tags: [{ name: '' }, 42, { name: '追光者计划·招募赛' }, { name: '物理' }] }], has_more: false });
    },
  });

  assert.deepEqual(await client.listTaggedChallengeTags(' 追光者计划·招募赛 '), { rows: [
    { id: 'c-1', tags: ['追光者计划·招募赛', '材料'] },
    { id: 'c-2', tags: ['追光者计划·招募赛', '生物'] },
    { id: 'c-4', tags: ['追光者计划·招募赛', '物理'] },
  ] });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].origin + requests[0].pathname, 'https://example.test/api/challenges');
  // Only the contest's own tag selects the read, so a challenge outside it never reaches a group.
  assert.equal(requests[0].searchParams.get('tag'), '追光者计划·招募赛');
  assert.equal(requests[0].searchParams.get('per_page'), '50');
  assert.deepEqual(requests.map((url) => url.searchParams.get('page')), ['1', '2']);
  assert.equal(requests[1].searchParams.get('tag'), '追光者计划·招募赛');
  // A public grouping is read without the account's token, so one account's answer is never cached for another.
  assert.deepEqual(authorizations, [undefined, undefined]);

  await assert.rejects(
    () => client.listTaggedChallengeTags('   '),
    (error) => error instanceof PlaygroundApiError && error.code === 'invalid_argument',
  );
});

test('#112: a grouping read that cannot be finished or whose filter was ignored fails instead of answering a short list', async () => {
  let pages = 0;
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async (url) => {
      pages += 1;
      return jsonResponse({ items: [{ id: `c-${url.searchParams.get('page')}`, tags: ['材料'] }], has_more: true });
    },
  });
  // A grouping built from an incomplete read would miscount, so the read fails and its caller keeps the
  // grouping it already has.
  await assert.rejects(
    () => client.listTaggedChallengeTags('材料'),
    (error) => error instanceof PlaygroundApiError && error.code === 'incomplete_list',
  );
  assert.equal(pages, 6);

  let emptyPages = 0;
  const emptyPage = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => { emptyPages += 1; return jsonResponse({ items: [], has_more: true }); },
  });
  // A page that answers nothing while the list still says there is more is not an empty grouping either.
  await assert.rejects(
    () => emptyPage.listTaggedChallengeTags('追光者计划·招募赛'),
    (error) => error instanceof PlaygroundApiError && error.code === 'incomplete_list',
  );
  assert.equal(emptyPages, 1);

  const ignoredTag = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => jsonResponse({ items: [{ id: 'other-contest', tags: ['岗位·运营实习生'] }], has_more: false }),
  });
  await assert.rejects(
    () => ignoredTag.listTaggedChallengeTags('追光者计划·招募赛'),
    (error) => error instanceof PlaygroundApiError && error.code === 'invalid_response',
  );

  const broken = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => jsonResponse({ total: 3 }),
  });
  await assert.rejects(
    () => broken.listTaggedChallengeTags('追光者计划·招募赛'),
    (error) => error instanceof PlaygroundApiError && error.code === 'invalid_response',
  );
});

test('#112: listSeasonTracks groups a season by the track of each challenge and skips challenges without one', async () => {
  const requests = [];
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test', token: 'synthetic-token-62',
    fetchImpl: async (url, init) => {
      requests.push(url);
      assert.equal(init.headers.authorization, undefined, 'a public season grouping is read anonymously');
      return jsonResponse({
        items: [
          { id: 'p-1', hackathon: { season: 2, track: 'reproduction', trackZh: ' 复现赛道 ' } },
          { id: 'p-2', hackathon: { season: '2', track: 'innovation' } },
          { id: 'p-3', hackathon: {} },
          { id: 'p-4' },
          { id: 'p-5', hackathon: 'innovation' },
        ],
        has_more: false,
      });
    },
  });

  assert.deepEqual(await client.listSeasonTracks(' s2 '), { rows: [
    { id: 'p-1', track: 'reproduction', trackZh: '复现赛道' },
    { id: 'p-2', track: 'innovation' },
  ] });
  assert.equal(requests[0].searchParams.get('season'), 's2');
  assert.equal(requests[0].searchParams.get('page'), '1');

  for (const season of ['', '  ', 'two words', '../s2', 's'.repeat(41), null]) {
    await assert.rejects(
      () => client.listSeasonTracks(season),
      (error) => error instanceof PlaygroundApiError && error.code === 'invalid_argument',
      JSON.stringify(season),
    );
  }

  // The platform answers an unknown season with the unfiltered list, which would group another season's
  // challenges under this one.
  const ignoredSeason = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => jsonResponse({ items: [{ id: 'q-1', hackathon: { season: 3, track: 's3' } }], has_more: false }),
  });
  await assert.rejects(
    () => ignoredSeason.listSeasonTracks('s2'),
    (error) => error instanceof PlaygroundApiError && error.code === 'invalid_response' && /ignored the season filter "s2"/.test(error.message),
  );
});

test('#112: getSeasonRounds keeps the order the platform returns its rounds in and drops rounds it could not query', async () => {
  const requests = [];
  const client = createPlaygroundClient({
    baseUrl: 'https://example.test', token: 'synthetic-token-62',
    fetchImpl: async (url, init) => {
      requests.push(url);
      assert.equal(init.headers.authorization, undefined, 'the public round list is read anonymously');
      return jsonResponse({
        currentSeq: 2,
        rounds: [
          { seq: 2, phase: 'running', startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-30T00:00:00Z', challengeCount: 3, challengeIds: ['k-3', 'k-4', ''] },
          { seq: 1, phase: ' ended ', challengeIds: ['k-1', 'k-2'] },
          { seq: 0, challengeIds: ['k-9'] },
          { seq: 3 },
          { challengeIds: ['k-8'] },
          'not an object',
        ],
      });
    },
  });

  const result = await client.getSeasonRounds('knight-s4');
  assert.equal(result.currentSeq, 2);
  // The endpoint lists the rounds in the order of their time windows; `seq` never reorders them here.
  assert.deepEqual(result.rounds, [
    { seq: 2, phase: 'running', startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-30T00:00:00Z', challengeCount: 3, challengeIds: ['k-3', 'k-4'] },
    // Without a `challengeCount` the queried ids are the count, so a group's number matches its rows.
    { seq: 1, phase: 'ended', challengeCount: 2, challengeIds: ['k-1', 'k-2'] },
  ]);
  assert.equal(requests[0].origin + requests[0].pathname, 'https://example.test/api/hackathon/seasons/by-slug/knight-s4/rounds');

  await assert.rejects(
    () => client.getSeasonRounds('not a slug'),
    (error) => error instanceof PlaygroundApiError && error.code === 'invalid_argument',
  );
  const broken = createPlaygroundClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => jsonResponse({ currentSeq: 1 }),
  });
  await assert.rejects(
    () => broken.getSeasonRounds('knight-s4'),
    (error) => error instanceof PlaygroundApiError && error.code === 'invalid_response',
  );
});
