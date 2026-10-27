import type { ErrorRequestHandler, RequestHandler } from 'express';

export interface RequestContext {
  requestId: string;
}
export type ApiHandler = RequestHandler<
  Record<string, string>, unknown, unknown, Record<string, unknown>, RequestContext
>;
export type ApiErrorHandler = ErrorRequestHandler<
  Record<string, string>, unknown, unknown, Record<string, unknown>, RequestContext
>;
