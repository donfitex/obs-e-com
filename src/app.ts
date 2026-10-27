import { platform } from 'node:os';
import express, { type Express } from 'express';
import { errorHandler, notFound } from './http/errors.js';
import { defaultLogger, observability, type RequestLogger } from './http/observability.js';
import { createUserRouter } from './users/user.routes.js';
import { UserService } from './users/user.service.js';

export type { RequestLog } from './http/observability.js';
export interface AppOptions {
  logger?: RequestLogger;
}
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(observability(options.logger ?? defaultLogger));
  app.use(express.json({ limit: '16kb', strict: false }));
  app.get('/', (_request, response) => {
    response.json({ message: 'obs-e-com API' });
  });
  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok', uptime: process.uptime(), platform: platform(),
      timestamp: new Date().toISOString(),
    });
  });
  app.use('/api/users', createUserRouter(new UserService()));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
