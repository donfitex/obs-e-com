import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { platform } from 'node:os';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import express from 'express';
import { createApp, type RequestLog } from '../src/app.js';
import { errorHandler } from '../src/http/errors.js';
import { observability } from '../src/http/observability.js';
import { withServer } from './helpers/http.js';

interface User {
  id: number;
  name: string;
  email: string;
}
const seed: User = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUser(value: unknown): asserts value is User {
  assert.ok(value !== null && typeof value === 'object');
  assert.ok('id' in value && typeof value.id === 'number');
  assert.ok(Number.isSafeInteger(value.id) && value.id > 0);
  assert.ok('name' in value && typeof value.name === 'string');
  assert.ok('email' in value && typeof value.email === 'string');
}
async function readUser(response: Response): Promise<User> {
  const body: unknown = await response.json();
  assertUser(body);
  return body;
}
function json(base: string, path: string, method: string, body: unknown): Promise<Response> {
  return fetch(base + path, {
    method, headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body) ?? 'null',
  });
}
async function expectError(response: Response, status: number, code: string): Promise<void> {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json(?:;|$)/);
  const body: unknown = await response.json();
  assert.ok(body !== null && typeof body === 'object');
  assert.ok('error' in body && body.error !== null && typeof body.error === 'object');
  assert.ok('code' in body.error);
  assert.equal(body.error.code, code);
  assert.ok('message' in body.error && typeof body.error.message === 'string');
  assert.ok(body.error.message.length > 0);
  assert.ok('requestId' in body && typeof body.requestId === 'string');
  assert.match(body.requestId, uuid);
  assert.equal(response.headers.get('x-request-id'), body.requestId);
}

test('Express welcome and health return JSON with runtime metadata', async () => {
  await withServer(createServer(createApp({ logger: () => {} })), async (base) => {
    const welcome = await fetch(base + '/');
    assert.equal(welcome.status, 200);
    assert.match(welcome.headers.get('content-type') ?? '', /^application\/json(?:;|$)/);
    const body: unknown = await welcome.json();
    assert.deepEqual(body, { message: 'obs-e-com API' });
    const before = Date.now();
    const response = await fetch(base + '/api/health');
    const health: unknown = await response.json();
    const after = Date.now();
    assert.equal(response.status, 200);
    assert.ok(health !== null && typeof health === 'object');
    assert.ok('status' in health);
    assert.equal(health.status, 'ok');
    assert.ok('uptime' in health && typeof health.uptime === 'number');
    assert.ok(Number.isFinite(health.uptime) && health.uptime >= 0);
    assert.ok('platform' in health);
    assert.equal(health.platform, platform());
    assert.ok('timestamp' in health && typeof health.timestamp === 'string');
    assert.equal(new Date(health.timestamp).toISOString(), health.timestamp);
    assert.ok(Date.parse(health.timestamp) >= before && Date.parse(health.timestamp) <= after);
  });
});

test('CRUD creates, lists, reads, replaces and deletes a user', async () => {
  await withServer(createServer(createApp({ logger: () => {} })), async (base) => {
    const initialResponse = await fetch(base + '/api/users');
    const initial: unknown = await initialResponse.json();
    assert.equal(initialResponse.status, 200);
    assert.deepEqual(initial, [seed]);
    const response = await json(base, '/api/users', 'POST', {
      name: 'Grace Hopper', email: 'grace@example.com',
    });
    assert.equal(response.status, 201);
    const created = await readUser(response);
    assert.ok(created.id > 1);
    assert.equal(created.name, 'Grace Hopper');
    assert.equal(created.email, 'grace@example.com');
    const path = '/api/users/' + created.id;
    assert.equal(response.headers.get('location'), path);
    const get = await fetch(base + path);
    assert.equal(get.status, 200);
    assert.deepEqual(await readUser(get), created);
    const listResponse = await fetch(base + '/api/users');
    const list: unknown = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.deepEqual(list, [seed, created]);
    const update = await json(base, path, 'PUT', {
      name: 'Rear Admiral Hopper', email: 'hopper@example.com',
    });
    assert.equal(update.status, 200);
    const changed = { id: created.id, name: 'Rear Admiral Hopper', email: 'hopper@example.com' };
    assert.deepEqual(await readUser(update), changed);
    assert.deepEqual(await readUser(await fetch(base + path)), changed);
    const removed = await fetch(base + path, { method: 'DELETE' });
    assert.equal(removed.status, 204);
    assert.equal(await removed.text(), '');
    await expectError(await fetch(base + path), 404, 'USER_NOT_FOUND');
    await expectError(await fetch(base + path, { method: 'DELETE' }), 404, 'USER_NOT_FOUND');
    const finalResponse = await fetch(base + '/api/users');
    const finalUsers: unknown = await finalResponse.json();
    assert.deepEqual(finalUsers, [seed]);
  });
});

test('normalization detects duplicate emails without mutating users on conflicts', async () => {
  await withServer(createServer(createApp({ logger: () => {} })), async (base) => {
    await expectError(await json(base, '/api/users', 'POST', {
      name: 'Another Ada', email: '  ADA@EXAMPLE.COM  ',
    }), 409, 'EMAIL_CONFLICT');
    const response = await json(base, '/api/users', 'POST', {
      name: '  Grace Hopper  ', email: ' GRACE@EXAMPLE.COM ',
    });
    assert.equal(response.status, 201);
    const created = await readUser(response);
    assert.equal(created.name, 'Grace Hopper');
    assert.equal(created.email, 'grace@example.com');
    const path = '/api/users/' + created.id;
    await expectError(await json(base, path, 'PUT', {
      name: 'Changed', email: 'ADA@EXAMPLE.COM',
    }), 409, 'EMAIL_CONFLICT');
    assert.deepEqual(await readUser(await fetch(base + path)), created);
    const sameEmail = await json(base, path, 'PUT', {
      name: 'Updated Grace', email: 'GRACE@EXAMPLE.COM',
    });
    assert.equal(sameEmail.status, 200);
    assert.deepEqual(await readUser(sameEmail), {
      id: created.id, name: 'Updated Grace', email: 'grace@example.com',
    });
  });
});

const invalidBodies: unknown[] = [
  null, [], true, 123, 'text', {}, { name: 'Missing email' },
  { email: 'missing@example.com' }, { name: '', email: 'user@example.com' },
  { name: '   ', email: 'user@example.com' }, { name: 123, email: 'user@example.com' },
  { name: 'User', email: 123 }, { name: 'User', email: '' },
  { name: 'User', email: 'invalid-email' }, { name: 'User', email: 'user @example.com' },
  { name: 'x'.repeat(101), email: 'user@example.com' },
  { name: 'User', email: 'x'.repeat(243) + '@example.com' },
  { name: 'User', email: 'user@example.com', role: 'admin' },
];
for (const method of ['POST', 'PUT']) {
  test(method + ' validates all unknown JSON inputs and preserves the store', async () => {
    await withServer(createServer(createApp({ logger: () => {} })), async (base) => {
      const path = method === 'POST' ? '/api/users' : '/api/users/1';
      for (const body of invalidBodies) {
        await expectError(await json(base, path, method, body), 400, 'VALIDATION_ERROR');
      }
      await expectError(await fetch(base + path, { method }), 400, 'VALIDATION_ERROR');
      const response = await fetch(base + '/api/users');
      const users: unknown = await response.json();
      assert.deepEqual(users, [seed]);
    });
  });
}

test('documented maximum field lengths are accepted', async () => {
  await withServer(createServer(createApp({ logger: () => {} })), async (base) => {
    const input = { name: 'x'.repeat(100), email: 'x'.repeat(242) + '@example.com' };
    assert.equal(input.email.length, 254);
    const response = await json(base, '/api/users', 'POST', input);
    assert.equal(response.status, 201);
    const created = await readUser(response);
    assert.equal(created.name, input.name);
    assert.equal(created.email, input.email);
  });
});

test('routes distinguish invalid IDs and malformed paths from absent users', async () => {
  await withServer(createServer(createApp({ logger: () => {} })), async (base) => {
    for (const id of ['0', '-1', '1.5', 'abc', '01', '1x', '9007199254740992']) {
      await expectError(await fetch(base + '/api/users/' + id), 400, 'VALIDATION_ERROR');
    }
    await expectError(await fetch(base + '/api/users/%ZZ'), 400, 'INVALID_REQUEST');
    await expectError(await fetch(base + '/api/users/999999'), 404, 'USER_NOT_FOUND');
    await expectError(await json(base, '/api/users/999999', 'PUT', {
      name: 'Missing User', email: 'missing@example.com',
    }), 404, 'USER_NOT_FOUND');
    await expectError(await fetch(base + '/api/users/999999', { method: 'DELETE' }), 404, 'USER_NOT_FOUND');
    await expectError(await fetch(base + '/missing'), 404, 'NOT_FOUND');
  });
});

test('parser errors produce controlled JSON responses', async () => {
  await withServer(createServer(createApp({ logger: () => {} })), async (base) => {
    await expectError(await fetch(base + '/api/users', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":',
    }), 400, 'INVALID_JSON');
    await expectError(await json(base, '/api/users', 'POST', {
      name: 'x'.repeat(20_000), email: 'large@example.com',
    }), 413, 'PAYLOAD_TOO_LARGE');
  });
});

test('new app instances have independent mock stores', async () => {
  await withServer(createServer(createApp({ logger: () => {} })), async (base) => {
    const response = await json(base, '/api/users', 'POST', {
      name: 'Grace Hopper', email: 'grace@example.com',
    });
    assert.equal(response.status, 201);
    await response.json();
  });
  await withServer(createServer(createApp({ logger: () => {} })), async (base) => {
    const response = await fetch(base + '/api/users');
    const users: unknown = await response.json();
    assert.deepEqual(users, [seed]);
  });
});

test('generated request IDs and completion logs exclude request secrets', async () => {
  const entries: RequestLog[] = [];
  const app = createApp({ logger: (entry) => entries.push(entry) });
  await withServer(createServer(app), async (base) => {
    const before = Date.now();
    const response = await fetch(base + '/api/users?token=private-query-value', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'caller-controlled-request-id',
        'x-api-key': 'private-header-value',
      },
      body: JSON.stringify({ name: 'private-body-value', email: 'private-body@example.com' }),
    });
    await response.json();
    await setImmediate();
    const after = Date.now();
    assert.equal(response.status, 201);
    const requestId = response.headers.get('x-request-id');
    assert.match(requestId ?? '', uuid);
    assert.notEqual(requestId, 'caller-controlled-request-id');
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.ok(entry);
    assert.equal(entry.requestId, requestId);
    assert.equal(entry.method, 'POST');
    assert.equal(entry.path, '/api/users');
    assert.equal(entry.status, 201);
    assert.ok(Number.isFinite(entry.elapsedMs) && entry.elapsedMs >= 0);
    assert.equal(new Date(entry.timestamp).toISOString(), entry.timestamp);
    assert.ok(Date.parse(entry.timestamp) >= before && Date.parse(entry.timestamp) <= after);
    const serialized = JSON.stringify(entries);
    for (const secret of [
      'private-query-value', 'private-header-value', 'private-body-value',
      'private-body@example.com', 'caller-controlled-request-id',
    ]) {
      assert.ok(!serialized.includes(secret));
    }
    const second = await fetch(base + '/api/users');
    await second.json();
    assert.match(second.headers.get('x-request-id') ?? '', uuid);
    assert.notEqual(second.headers.get('x-request-id'), requestId);
    await expectError(await fetch(base + '/missing'), 404, 'NOT_FOUND');
    await setImmediate();
    assert.ok(entries.some((logged) => logged.path === '/missing' && logged.status === 404));
  });
});

test('throwing logging sinks do not break the server', async () => {
  let count = 0;
  const app = createApp({ logger: () => {
    count += 1;
    throw new Error('Logging sink unavailable');
  } });
  await withServer(createServer(app), async (base) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(base + '/api/health');
      assert.equal(response.status, 200);
      await response.json();
    }
    await setImmediate();
    assert.equal(count, 2);
  });
});

test('central error middleware sanitizes unexpected async failures', async () => {
  const app = express();
  app.use(observability(() => {}));
  app.get('/explode', async () => {
    await Promise.resolve();
    throw new Error('sensitive internal detail');
  });
  app.use(errorHandler);
  await withServer(createServer(app), async (base) => {
    const response = await fetch(base + '/explode');
    const raw = await response.clone().text();
    assert.ok(!raw.includes('sensitive internal detail'));
    assert.ok(!raw.includes('stack'));
    await expectError(response, 500, 'INTERNAL_ERROR');
  });
});
