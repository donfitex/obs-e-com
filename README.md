# obs-e-com

A tested, secured, observable e-commerce API with asynchronous order processing,
semantic product search, and a production deployment path.

Stages 0–3 provide a strict TypeScript foundation, an isolated native HTTP server,
a fault-tolerant async data engine, and an observable Express API with mock user CRUD.

## Local setup

Use Node.js 24 LTS and npm 11. The supported major is recorded in `.nvmrc`,
package engines and CI.

```sh
npm ci
cp .env.example .env
npm run dev
```

The environment file is optional. Defaults: `HOST=127.0.0.1`, `PORT=3000`.
The default entry point starts the Express API. The native learning server has separate scripts.
Do not commit real credentials; local environment files are ignored.

```sh
npm run typecheck
npm test
npm run build
npm start
# Or run all verification:
npm run check
```

Source lives in `src/`, automated checks in `tests/`, and generated output in
`dist/`. See [architecture decisions](docs/architecture.md).

## Native HTTP learning server (stage 1)

`npm run dev:native` runs the native-only server. After `npm run build`, use
`npm run start:native`. Do not run two servers on the same port. Stop with Ctrl+C;
SIGINT/SIGTERM drain connections with a ten-second deadline.

| Method | Path | Status | Response |
| --- | --- | --- | --- |
| GET | / | 200 | Welcome message |
| GET | /api/users | 200 | Stable seeded user array |
| GET | /api/health | 200 | Status, process uptime (seconds), OS platform, ISO timestamp |
| Other | Any unsupported route/method | 404 | JSON NOT_FOUND error |

```sh
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3000/api/users
curl -i http://127.0.0.1:3000/api/health
curl -i http://127.0.0.1:3000/missing
```

In Postman, use the same URLs and GET method. Responses use
`application/json; charset=utf-8`. Native server factories do not listen until
started, so tests use ephemeral local ports and close their listeners afterward.

## Typed async aggregation (stage 2)

```sh
npm run data:aggregate
```

The example concurrently requests JSONPlaceholder's public `/users` and `/posts`
endpoints. It prints `{ users, posts, errors }` and exits nonzero when a source
fails. Valid sources survive failures in other sources. Errors identify the source,
URL, code, message and HTTP status when available.

`aggregatePublicData(fetchClient?, options?)` accepts an injected client and
`usersUrl`, `postsUrl`, `timeoutMs` options. Timeout defaults to 5 seconds.
Injected clients must honor the supplied AbortSignal, as native fetch does.
The engine validates unknown JSON and maps only explicit domain fields; a malformed
source is rejected as a unit. Non-success HTTP bodies are canceled to release
connections. Tests use injected fixtures and do not call live public APIs.

Increasing `UV_THREADPOOL_SIZE` does not accelerate native fetch/network I/O.
No thread-pool benchmark is included because this work is network-bound rather
than a libuv thread-pool workload.

## Express API (stage 3)

`npm run dev` starts Express. Production-style local startup is
`npm run build` followed by `npm start`. The native server remains available
through `npm run dev:native` and `npm run start:native`.

| Method | Path | Success | Behavior |
| --- | --- | --- | --- |
| GET | / | 200 | Welcome JSON |
| GET | /api/health | 200 | Status, uptime, platform, ISO timestamp |
| GET | /api/users | 200 | List mock users |
| GET | /api/users/:id | 200 | Read one user |
| POST | /api/users | 201 | Create user; Location header points to its URL |
| PUT | /api/users/:id | 200 | Replace name and email |
| DELETE | /api/users/:id | 204 | Delete user; empty body |

POST and PUT accept only `{ "name": "...", "email": "..." }`. Names are trimmed
and must contain 1–100 characters. Emails are trimmed, lowercased, checked for a
basic email format and limited to 254 characters. Extra fields are rejected.
IDs must be positive safe integers. PUT replaces both fields.

The JSON body limit is 16kb. Invalid inputs or JSON return 400; unknown users and
routes return 404; duplicate email addresses return 409; oversized bodies return
413. Errors use `{ error: { code, message }, requestId }`; unexpected internal
errors return a generic 500 message.

Each request receives a server-generated `X-Request-Id`. Completion logs are JSON
with ISO timestamp, request ID, method, path, response status and elapsed
milliseconds. Headers, bodies and query strings are excluded. Each app has its own
mock user store, which resets on restart. These learning routes have no authentication.
The optional API-key integration route is deferred until an integration is specified.

```sh
curl -i http://127.0.0.1:3000/api/health
curl -i -X POST http://127.0.0.1:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Grace Hopper","email":"grace@example.com"}'
curl -i http://127.0.0.1:3000/api/users/2
curl -i -X PUT http://127.0.0.1:3000/api/users/2 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Rear Admiral Hopper","email":"hopper@example.com"}'
curl -i -X DELETE http://127.0.0.1:3000/api/users/2
```

In Postman, set POST/PUT Body to raw JSON and use the same URLs and payloads.
The examples assume a fresh store, where the first created user has ID 2.

See [checkpoint verification](docs/checkpoints.md) for stage commits and CI runs.
