# Changelog

## Unreleased

### Fixed
- A one-time handler can no longer process two concurrent requests when an async matcher is used.
- A failing one-time handler (e.g. a failed assertion inside it) now responds with status 500 and the error message instead of an empty 404, so the tested code sees the real cause.
- `waitForNext()` awaited after the request already arrived now waits for the handler to finish and reflects its result; previously a late handler error could be lost.
- A checker called while its handler is still running now throws an explanatory error instead of passing silently.
- With `testRunner: 'none'`, a failed server start (e.g. port already in use) no longer crashes the process with an unhandled promise rejection; the error is reported on stderr and `readyPromise` rejects.
- `runAllCheckers()` now runs all pending checks and reports all failures (as an `AggregateError` when more than one check fails); previously it stopped at the first failure and skipped the rest.
- Server shutdown no longer hangs on idle keep-alive connections (Node.js >= 18.2).
- TypeScript: object matchers accept any subset of the supported props — `route.matching({ query: { … } })` now compiles.

### Added
- Constructor options: `new MockServer(port, { testRunner: 'jest' })` overrides the package.json configuration.
- Public `start()` and `close()` methods; `start()` is idempotent. Together with the new `port` getter and support for port `0` (random free port), the server can be used with any test runner via `testRunner: 'none'`.
- URLs with default ports (`http://…` / `https://…` without an explicit port) are now accepted.

### Changed
- Routing now uses the maintained `@koa/router` (v13) instead of the abandoned `koa-router` (v10). The route syntax is unchanged (both use path-to-regexp v6).
- Upgraded `koa` to 2.16 and `debug` to 4.4.
- Node.js >= 18 is required (declared in `engines`).
- The npm package now ships only `dist` (plus README and LICENSE).
