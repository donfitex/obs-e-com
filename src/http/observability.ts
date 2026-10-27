import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { ApiHandler } from './types.js';

export interface RequestLog {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  elapsedMs: number;
}
export type RequestLogger = (entry: RequestLog) => void;
export const defaultLogger: RequestLogger = (entry) => {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
};
export function observability(logger: RequestLogger): ApiHandler {
  return (request, response, next) => {
    const started = performance.now();
    const requestId = randomUUID();
    const method = request.method;
    const path = request.path;
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.once('finish', () => {
      const entry: RequestLog = {
        timestamp: new Date().toISOString(), requestId, method, path,
        status: response.statusCode,
        elapsedMs: Number((performance.now() - started).toFixed(3)),
      };
      try {
        logger(entry);
      } catch {
        // A failed logging sink must not crash the HTTP server.
      }
    });
    next();
  };
}
