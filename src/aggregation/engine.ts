export interface RemoteUser { id: number; name: string; email: string; }
export interface RemotePost { id: number; userId: number; title: string; body: string; }
export type AggregationErrorCode =
  | 'HTTP_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_JSON' | 'INVALID_RESPONSE';

export interface AggregationError {
  source: 'users' | 'posts';
  url: string;
  code: AggregationErrorCode;
  message: string;
  status?: number;
}
export interface AggregatedData {
  users: RemoteUser[];
  posts: RemotePost[];
  errors: AggregationError[];
}
export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body?: { cancel(): Promise<void> } | null;
  json(): Promise<unknown>;
}
/** Injected clients must honor the signal for requests and body reads, as fetch does. */
export type FetchClient = (
  url: string, init: { signal: AbortSignal },
) => Promise<FetchResponse>;
export interface AggregationOptions {
  usersUrl?: string;
  postsUrl?: string;
  timeoutMs?: number;
}

class EndpointFailure extends Error {
  readonly status: number | undefined;
  constructor(readonly code: AggregationErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'EndpointFailure';
    this.status = status;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function parseUsers(body: unknown): RemoteUser[] {
  if (!isUnknownArray(body)) {
    throw new EndpointFailure('INVALID_RESPONSE', 'Expected an array of users');
  }
  const users: RemoteUser[] = [];
  for (const row of body) {
    if (!isRecord(row) || !isPositiveInteger(row['id']) ||
        !isNonEmptyString(row['name']) || !isNonEmptyString(row['email'])) {
      throw new EndpointFailure('INVALID_RESPONSE',
        'Each user must have a positive integer id, non-empty name, and email');
    }
    users.push({ id: row['id'], name: row['name'], email: row['email'] });
  }
  return users;
}
function parsePosts(body: unknown): RemotePost[] {
  if (!isUnknownArray(body)) {
    throw new EndpointFailure('INVALID_RESPONSE', 'Expected an array of posts');
  }
  const posts: RemotePost[] = [];
  for (const row of body) {
    if (!isRecord(row) || !isPositiveInteger(row['id']) ||
        !isPositiveInteger(row['userId']) || typeof row['title'] !== 'string' ||
        typeof row['body'] !== 'string') {
      throw new EndpointFailure('INVALID_RESPONSE',
        'Each post must have positive integer id and userId, string title and body');
    }
    posts.push({
      id: row['id'], userId: row['userId'], title: row['title'], body: row['body'],
    });
  }
  return posts;
}
function failureMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Request failed';
}
function timeoutFailure(timeoutMs: number): EndpointFailure {
  return new EndpointFailure('TIMEOUT', `Endpoint exceeded ${timeoutMs} ms`);
}
async function fetchValidated<T>(
  fetchClient: FetchClient, url: string, timeoutMs: number, parse: (body: unknown) => T,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: FetchResponse;
  try {
    response = await fetchClient(url, { signal });
  } catch (reason: unknown) {
    if (signal.aborted) throw timeoutFailure(timeoutMs);
    throw new EndpointFailure('NETWORK_ERROR',
      `Endpoint request failed: ${failureMessage(reason)}`);
  }
  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // Cleanup must not replace the original HTTP failure.
    }
    throw new EndpointFailure(
      'HTTP_ERROR', `Endpoint returned HTTP ${response.status}`, response.status,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (signal.aborted) throw timeoutFailure(timeoutMs);
    throw new EndpointFailure('INVALID_JSON', 'Endpoint returned invalid JSON');
  }
  return parse(body);
}
function toAggregationError(
  source: AggregationError['source'], url: string, reason: unknown,
): AggregationError {
  if (reason instanceof EndpointFailure) {
    return {
      source, url, code: reason.code, message: reason.message,
      ...(reason.status !== undefined ? { status: reason.status } : {}),
    };
  }
  return { source, url, code: 'NETWORK_ERROR', message: failureMessage(reason) };
}
export async function aggregatePublicData(
  fetchClient: FetchClient = fetch, options: AggregationOptions = {},
): Promise<AggregatedData> {
  const usersUrl = options.usersUrl ?? 'https://jsonplaceholder.typicode.com/users';
  const postsUrl = options.postsUrl ?? 'https://jsonplaceholder.typicode.com/posts';
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError('timeoutMs must be an integer between 1 and 2147483647');
  }
  const [usersResult, postsResult] = await Promise.allSettled([
    fetchValidated(fetchClient, usersUrl, timeoutMs, parseUsers),
    fetchValidated(fetchClient, postsUrl, timeoutMs, parsePosts),
  ] as const);
  const errors: AggregationError[] = [];
  if (usersResult.status === 'rejected') {
    errors.push(toAggregationError('users', usersUrl, usersResult.reason));
  }
  if (postsResult.status === 'rejected') {
    errors.push(toAggregationError('posts', postsUrl, postsResult.reason));
  }
  return {
    users: usersResult.status === 'fulfilled' ? usersResult.value : [],
    posts: postsResult.status === 'fulfilled' ? postsResult.value : [],
    errors,
  };
}
