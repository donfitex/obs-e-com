import type { ApiErrorHandler, ApiHandler } from './types.js';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}
function parserError(error: unknown): HttpError | undefined {
  if (error instanceof URIError) {
    return new HttpError(400, 'INVALID_REQUEST', 'Invalid request path');
  }
  if (typeof error !== 'object' || error === null || !('type' in error)) {
    return undefined;
  }
  switch (error.type) {
    case 'entity.parse.failed':
      return new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
    case 'entity.too.large':
      return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 16kb');
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return new HttpError(415, 'UNSUPPORTED_ENCODING', 'Unsupported request encoding');
    case 'request.aborted':
    case 'request.size.invalid':
      return new HttpError(400, 'INVALID_REQUEST', 'Invalid request body');
    default:
      return undefined;
  }
}
export const notFound: ApiHandler = (_request, _response, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
};
export const errorHandler: ApiErrorHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  const failure = error instanceof HttpError ? error
    : parserError(error) ?? new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  response.status(failure.status).json({
    error: { code: failure.code, message: failure.message },
    requestId: response.locals.requestId,
  });
};
