import assert from 'node:assert/strict';
import { platform } from 'node:os';
import test from 'node:test';
import { createNativeServer } from '../src/native/server.js';
import { withServer } from './helpers/http.js';

test('native welcome and users have stable JSON payloads and ignore queries', async () => {
  await withServer(createNativeServer(), async (baseUrl) => {
    for (const [path, expected] of [
      ['/', { message: 'obs-e-com API' }],
      ['/api/users', [{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com' }]],
      ['/api/users?limit=1', [{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com' }]],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`);
      const body: unknown = await response.json();
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /^application\/json(?:;|$)/);
      assert.deepEqual(body, expected);
    }
  });
});

test('native health includes uptime, OS platform and an ISO timestamp', async () => {
  await withServer(createNativeServer(), async (baseUrl) => {
    const before = Date.now();
    const response = await fetch(`${baseUrl}/api/health`);
    const body: unknown = await response.json();
    const after = Date.now();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json(?:;|$)/);
    assert.ok(body !== null && typeof body === 'object');
    assert.ok('status' in body);
    assert.equal(body.status, 'ok');
    assert.ok('uptime' in body && typeof body.uptime === 'number');
    assert.ok(Number.isFinite(body.uptime) && body.uptime >= 0);
    assert.ok('platform' in body);
    assert.equal(body.platform, platform());
    assert.ok('timestamp' in body && typeof body.timestamp === 'string');
    assert.equal(new Date(body.timestamp).toISOString(), body.timestamp);
    assert.ok(Date.parse(body.timestamp) >= before && Date.parse(body.timestamp) <= after);
  });
});

for (const request of [
  { method: 'GET', path: '/missing' },
  { method: 'GET', path: '/api/users/1' },
  { method: 'POST', path: '/api/users' },
  { method: 'DELETE', path: '/' },
]) {
  test(`native ${request.method} ${request.path} returns JSON 404`, async () => {
    await withServer(createNativeServer(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}${request.path}`, { method: request.method });
      const body: unknown = await response.json();
      assert.equal(response.status, 404);
      assert.match(response.headers.get('content-type') ?? '', /^application\/json(?:;|$)/);
      assert.deepEqual(body, { error: { code: 'NOT_FOUND', message: 'Route not found' } });
    });
  });
}

test('native server starts independently and closes cleanly', async () => {
  const server = createNativeServer();
  assert.equal(server.listening, false);
  await withServer(server, async (baseUrl) => {
    assert.equal(server.listening, true);
    const response = await fetch(`${baseUrl}/api/health`);
    await response.json();
    assert.equal(response.status, 200);
  });
  assert.equal(server.listening, false);
});
