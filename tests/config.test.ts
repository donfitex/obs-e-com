import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.js';

test('configuration defaults to a local development listener', () => {
  assert.deepEqual(readConfig({}), { host: '127.0.0.1', port: 3000 });
});
test('configuration accepts explicit host and port', () => {
  assert.deepEqual(readConfig({ HOST: '0.0.0.0', PORT: '8080' }), {
    host: '0.0.0.0', port: 8080,
  });
});
for (const port of ['', '0', '-1', '3.5', '65536', '3000oops', 'Infinity']) {
  test(`configuration rejects invalid port "${port}"`, () => {
    assert.throws(() => readConfig({ PORT: port }), /PORT must/);
  });
}
test('configuration rejects an empty host', () => {
  assert.throws(() => readConfig({ HOST: ' ' }), /HOST must/);
});
