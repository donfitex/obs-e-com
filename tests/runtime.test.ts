import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`native runtime drains and exits cleanly on ${signal}`, { timeout: 15_000 }, async () => {
    const entry = `
      import { createNativeServer } from './src/native/server.ts';
      import { startServer } from './src/runtime.ts';
      const server = createNativeServer();
      server.once('listening', () => {
        const address = server.address();
        process.send({ port: address.port });
      });
      startServer(server, { host: '127.0.0.1', port: 0 });
    `;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', entry], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stdout.resume();
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    const exited = once(child, 'exit');
    const timer = setTimeout(() => child.kill('SIGKILL'), 12_000);
    try {
      const ready = await Promise.race([
        once(child, 'message'),
        exited.then(() => { throw new Error('Server exited before readiness: ' + stderr); }),
      ]);
      const message: unknown = ready[0];
      assert.ok(typeof message === 'object' && message !== null);
      assert.ok('port' in message && typeof message.port === 'number');
      const response = await fetch(`http://127.0.0.1:${message.port}/api/health`);
      assert.equal(response.status, 200);
      await response.json();
      child.kill(signal);
      const [code, terminatingSignal] = await exited;
      assert.equal(code, 0, stderr);
      assert.equal(terminatingSignal, null);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    }
  });
}
