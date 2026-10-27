import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregatePublicData, type FetchClient } from '../src/aggregation/engine.js';

const user = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' };
const post = { id: 10, userId: 1, title: 'First post', body: 'Example body' };

function deferredResponse(): {
  promise: Promise<Response>; resolve: (response: Response) => void;
} {
  let settle: (response: Response) => void = () => { throw new Error('Not initialized'); };
  const promise = new Promise<Response>((resolve) => { settle = resolve; });
  return { promise, resolve: (response) => settle(response) };
}

test('starts requests concurrently and projects validated domain fields', async () => {
  const users = deferredResponse();
  const posts = deferredResponse();
  const requested: string[] = [];
  const client: FetchClient = (url) => {
    requested.push(url);
    return url.endsWith('/users') ? users.promise : posts.promise;
  };
  const pending = aggregatePublicData(client);
  assert.deepEqual(requested, [
    'https://jsonplaceholder.typicode.com/users',
    'https://jsonplaceholder.typicode.com/posts',
  ]);
  posts.resolve(Response.json([{ ...post, ignored: true }]));
  users.resolve(Response.json([{ ...user, ignored: true }]));
  assert.deepEqual(await pending, { users: [user], posts: [post], errors: [] });
});

test('preserves successful posts when users fail', async () => {
  const client: FetchClient = async (url) => {
    if (url.endsWith('/users')) throw new Error('offline');
    return Response.json([post]);
  };
  const result = await aggregatePublicData(client);
  assert.deepEqual(result.users, []);
  assert.deepEqual(result.posts, [post]);
  assert.deepEqual(result.errors, [{
    source: 'users', url: 'https://jsonplaceholder.typicode.com/users',
    code: 'NETWORK_ERROR', message: 'Endpoint request failed: offline',
  }]);
});

test('total failure returns structured errors without unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  try {
    const client: FetchClient = async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      throw new Error('upstream unavailable');
    };
    const result = await aggregatePublicData(client);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(result.users, []);
    assert.deepEqual(result.posts, []);
    assert.deepEqual(result.errors.map(({ source, code }) => ({ source, code })), [
      { source: 'users', code: 'NETWORK_ERROR' },
      { source: 'posts', code: 'NETWORK_ERROR' },
    ]);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('HTTP failures include status and cancel unread bodies', async () => {
  let canceled = false;
  const client: FetchClient = async (url) => url.endsWith('/users') ? Response.json([user]) : {
    ok: false, status: 503,
    body: { cancel: async () => { canceled = true; } },
    json: async () => { throw new Error('Do not read HTTP error bodies'); },
  };
  const result = await aggregatePublicData(client);
  assert.equal(canceled, true);
  assert.deepEqual(result.users, [user]);
  assert.deepEqual(result.posts, []);
  assert.deepEqual(result.errors, [{
    source: 'posts', url: 'https://jsonplaceholder.typicode.com/posts',
    code: 'HTTP_ERROR', message: 'Endpoint returned HTTP 503', status: 503,
  }]);
});

test('cleanup failures preserve the original HTTP failure', async () => {
  const client: FetchClient = async () => ({
    ok: false, status: 503,
    body: { cancel: async () => { throw new Error('cleanup failed'); } },
    json: async () => { throw new Error('Do not read HTTP error bodies'); },
  });
  const result = await aggregatePublicData(client);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every(({ code, status }) =>
    code === 'HTTP_ERROR' && status === 503));
});

test('isolates syntactically invalid JSON', async () => {
  const client: FetchClient = async (url) => url.endsWith('/users')
    ? new Response('{', { headers: { 'content-type': 'application/json' } })
    : Response.json([post]);
  const result = await aggregatePublicData(client);
  assert.deepEqual(result.users, []);
  assert.deepEqual(result.posts, [post]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.code, 'INVALID_JSON');
  assert.equal(result.errors[0]?.source, 'users');
});

test('rejects malformed users as a source instead of unchecked rows', async () => {
  const payloads: unknown[] = [
    null, { users: [user] }, [user, { ...user, id: '2' }],
    [{ ...user, id: -1 }], [{ ...user, name: '  ' }], [{ ...user, email: null }],
  ];
  for (const payload of payloads) {
    const client: FetchClient = async (url) =>
      Response.json(url.endsWith('/users') ? payload : [post]);
    const result = await aggregatePublicData(client);
    assert.deepEqual(result.users, []);
    assert.deepEqual(result.posts, [post]);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.source, 'users');
    assert.equal(result.errors[0]?.code, 'INVALID_RESPONSE');
  }
});

test('validates post identifiers, title, and body', async () => {
  const payloads: unknown[] = [
    null, [{ ...post, id: 1.5 }], [{ ...post, userId: 0 }],
    [{ ...post, title: null }], [{ id: 10, userId: 1, title: 'Missing body' }],
  ];
  for (const payload of payloads) {
    const client: FetchClient = async (url) =>
      Response.json(url.endsWith('/users') ? [user] : payload);
    const result = await aggregatePublicData(client);
    assert.deepEqual(result.users, [user]);
    assert.deepEqual(result.posts, []);
    assert.equal(result.errors[0]?.source, 'posts');
    assert.equal(result.errors[0]?.code, 'INVALID_RESPONSE');
  }
});

test('accepts empty datasets and configurable URLs', async () => {
  const requested: string[] = [];
  const client: FetchClient = async (url) => {
    requested.push(url);
    return Response.json([]);
  };
  const result = await aggregatePublicData(client, {
    usersUrl: 'https://example.test/people', postsUrl: 'https://example.test/articles',
  });
  assert.deepEqual(requested, [
    'https://example.test/people', 'https://example.test/articles',
  ]);
  assert.deepEqual(result, { users: [], posts: [], errors: [] });
});

test('aborts slow clients and records timeouts per source', async () => {
  const client: FetchClient = (_url, { signal }) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json([])), 1_000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const reason: unknown = signal.reason;
        reject(reason);
      }, { once: true });
    });
  const result = await aggregatePublicData(client, { timeoutMs: 5 });
  assert.deepEqual(result.users, []);
  assert.deepEqual(result.posts, []);
  assert.deepEqual(result.errors.map(({ source, code }) => ({ source, code })), [
    { source: 'users', code: 'TIMEOUT' }, { source: 'posts', code: 'TIMEOUT' },
  ]);
});

test('times out a JSON body still downloading after headers arrive', async () => {
  const client: FetchClient = async (_url, { signal }) => ({
    ok: true, status: 200,
    json: () => new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => resolve([]), 1_000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const reason: unknown = signal.reason;
        reject(reason);
      }, { once: true });
    }),
  });
  const result = await aggregatePublicData(client, { timeoutMs: 5 });
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every(({ code }) => code === 'TIMEOUT'));
});

test('handles synchronous throws and non-Error rejections', async () => {
  const client: FetchClient = (url) => {
    if (url.endsWith('/users')) throw new Error('synchronous failure');
    return Promise.reject('offline');
  };
  const result = await aggregatePublicData(client);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every(({ code }) => code === 'NETWORK_ERROR'));
});

test('rejects invalid timeout configuration', async () => {
  const client: FetchClient = async () => Response.json([]);
  for (const timeoutMs of [0, -1, 1.5, Number.NaN, 2_147_483_648]) {
    await assert.rejects(aggregatePublicData(client, { timeoutMs }), RangeError);
  }
});
