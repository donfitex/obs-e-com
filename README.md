# obs-e-com

A tested, secured, observable e-commerce API with asynchronous order processing,
semantic product search, and a production deployment path.

Stages 0–2 provide a strict TypeScript foundation, isolated native HTTP server,
and fault-tolerant typed async data engine.

## Local setup

Use Node.js 24 LTS and npm 11. The supported major is recorded in `.nvmrc`,
package engines and CI.

```sh
npm ci
cp .env.example .env
npm run dev
```

The environment file is optional. Defaults: `HOST=127.0.0.1`, `PORT=3000`.
The default entry point starts the native HTTP server.
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
`dist/`. See [architecture decisions](docs/architecture.md) and
[repository reconnaissance](docs/reconnaissance.md).

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
