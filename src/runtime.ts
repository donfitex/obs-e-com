import type { Server } from 'node:http';
import { readConfig, type ServerConfig } from './config.js';

export function startServer(server: Server, config: ServerConfig = readConfig()): void {
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  let stopping = false;
  const cleanup = (): void => {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
  };
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      process.exitCode = 1;
      server.closeAllConnections();
    }, 10_000);
    deadline.unref();
    server.close((error) => {
      clearTimeout(deadline);
      cleanup();
      if (error) {
        process.stderr.write('Server shutdown failed\n');
        process.exitCode = 1;
      }
    });
    server.closeIdleConnections();
  };

  server.once('error', (error: Error) => {
    cleanup();
    process.stderr.write(`Server error: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.once('close', cleanup);
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.listen(config.port, config.host, () => {
    process.stdout.write(JSON.stringify({ event: 'listening', ...config }) + '\n');
  });
}
