export interface ServerConfig { host: string; port: number; }

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const rawPort = env['PORT'] ?? '3000';
  if (!/^[0-9]+$/.test(rawPort)) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const host = env['HOST'] ?? '127.0.0.1';
  if (host.trim().length === 0) throw new Error('HOST must not be empty');
  return { host, port };
}
