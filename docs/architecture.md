# Architecture decisions

- Node.js 24 LTS, npm and ESM TypeScript form the supported platform.
  The lockfile records reproducible dependency resolution.
- Strict typing includes checked indexed access and exact optional properties.
  External JSON stays unknown until boundary validation succeeds.
- node:test and tsx run deterministic offline tests; tsc checks both source and
  tests and builds only source to dist.
- HTTP factories have no listener side effects. A shared runtime handles validated
  configuration, startup errors, SIGINT/SIGTERM and bounded connection draining.
- The native HTTP learning module remains isolated when Express becomes the
  default entry point. Express routes delegate to controllers, which validate
  inputs and call a service owning the in-memory mock user store.
- Aggregation owns remote user/post interfaces, injectable fetch and endpoint
  validation. It does not couple remote public data to the mock CRUD store.
- Persistence, authentication and order processing belong to later supplied stages.
  Mock data resets on restart; the current API is for local learning.
