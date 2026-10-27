# obs-e-com

A tested, secured, observable e-commerce API with asynchronous order processing,
semantic product search, and a production deployment path.

Implementation proceeds in reviewable stages. Stage 0 establishes a typed backend
foundation. Subsequent stages add native HTTP, data aggregation and Express.

## Local setup

Use Node.js 24 LTS and npm 11. The supported major is recorded in `.nvmrc`,
package engines and CI.

```sh
npm ci
cp .env.example .env
npm run dev
```

The environment file is optional. Defaults: `HOST=127.0.0.1`, `PORT=3000`.
At stage 0, the entry point prints validated configuration.
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
