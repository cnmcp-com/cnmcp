# Submission intake v1 — TDD evidence

## Scope

This milestone implements the first-week intake loop: users submit public locators, CNMCP independently retrieves or probes direct evidence, deduplicates the resource, persists static evidence, and schedules dynamic verification. Submission copy is never treated as evidence.

## RED/GREEN report

| Guarantee | Test or command | Result | Evidence |
| --- | --- | --- | --- |
| Submission copy cannot become resource evidence | `submission.test.ts` | RED then PASS | Normalized payload retains only repository, package, endpoint, transport, and type locators. |
| Real credentials are rejected | `submission.test.ts` | RED then PASS | Secret fields and command arguments are rejected; environment placeholders remain valid. |
| GitHub and npm facts come from direct public responses | `submission.test.ts` | RED then PASS | Title, description, author, README, version, and repository are built from mocked upstream responses. |
| Resource deduplication is stable | `submission.test.ts` | RED then PASS | Repository, package, and endpoint identity keys are normalized; the server ID is identity-derived. |
| Endpoint-only submissions require an MCP handshake | `submission.test.ts` | RED then PASS | A successful protocol probe supplies tools and protocol version before the resource can be accepted. |
| D1 schema upgrades from a clean database | isolated `wrangler d1 migrations apply --local` | PASS | Migrations `0001` through `0007` completed successfully. |
| Worker, queues, and bindings package successfully | `wrangler deploy --dry-run --containers-rollout=none` | PASS | Submission producer/consumer, D1, R2, verify queue, and stdio queue bindings were resolved. |
| Repository-wide behavior remains intact | `npm test` and `npm run typecheck` | PASS | 75 tests passed across API, web, checkers, doctor, schema, and data scripts; all workspace type checks passed. |

## Cost and reliability controls

- Submission batches are limited to four messages with concurrency two, three queue retries, and a dead-letter queue.
- D1 records make intake idempotent and recover queued or stale-processing jobs on the six-hour scheduler.
- Transient public-evidence failures stop after five persisted attempts.
- Static checks run once at acceptance; dynamic checks use the existing periodic verification queues.
- Submitted configuration is used only to infer a package locator and is not persisted as trusted configuration.

## Coverage and known gaps

Focused submission tests cover the trust boundary, direct evidence adapters, credential rejection, identity normalization, and endpoint acceptance. Automated line coverage is not available because `@vitest/coverage-v8` is not installed; no dependency was fetched implicitly. Git checkpoint commits were intentionally skipped because the user asked for implementation, not repository-history changes.
