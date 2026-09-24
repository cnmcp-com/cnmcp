# Static checker v1 — TDD evidence

## Scope

The journeys and acceptance criteria were derived from the request to assess every current Tencent Plaza catalog entry without executing untrusted third-party packages on the developer machine.

## User journeys

1. As a CNMCP maintainer, I can run one deterministic command and receive one static evidence record for every catalog server.
2. As a directory user, missing evidence remains `unknown` instead of becoming a misleading low trust score.
3. As a security reviewer, I can see prompt-injection, plaintext-secret, unsafe-launch, destructive-capability, deprecation, and dependency-pinning signals without exposing secret values.
4. As a probe operator, I can separate public remote handshakes from local packages that require an isolated stdio runner.
5. As a directory user, the final verdict combines static and dynamic evidence without claiming that a successful handshake is “safe” or “production ready.”

## RED/GREEN report

| Guarantee | Test or command | Type | Result | Evidence |
| --- | --- | --- | --- | --- |
| Static checker module is required by the new behavior | `npm test -w @cnmcp/checkers -- static.test.ts` | Unit / RED | Expected failure | Failed because `./static` did not exist. |
| Complete remote metadata becomes `ready_for_dynamic`, not “safe” | `static.test.ts` | Unit / GREEN | PASS | Risk remains `unknown` until dynamic/security evidence exists. |
| Prompt injection and plaintext secrets block a record | `static.test.ts` | Unit / GREEN | PASS | Secret values are not copied into serialized evidence. |
| Missing tools/config/pricing remain unknown evidence | `static.test.ts` | Unit / GREEN | PASS | Record becomes `metadata_only` with low confidence. |
| Shell-free `${VAR}` arguments are placeholders, not command injection | `npm test -w @cnmcp/checkers -- static.test.ts` | Unit / RED then GREEN | PASS | Initial implementation blocked the entry; corrected implementation emits `UNRESOLVED_PLACEHOLDER`. |
| Deprecated upstreams receive a maintenance warning | `npm test -w @cnmcp/checkers -- static.test.ts` | Unit / RED then GREEN | PASS | Specific repository/project/server wording is required to reduce protocol-deprecation false positives. |
| Tencent ingest creates a deterministic static check | `npm test -w @cnmcp/api -- tencent-plaza.test.ts` | Integration boundary / RED then GREEN | PASS | Ingest maps plaza data to the checker and persists the result in `static_checks`. |
| Every current catalog entry receives a result | `npm run check:tencent-plaza` | Dataset integration | PASS | 994 input entries produced 994 JSONL records. |
| Static and dynamic evidence produce a bounded user verdict | `npm test -w @cnmcp/checkers -- assessment.test.ts` | Unit / RED then GREEN | PASS | Verdicts are limited to unverified, blocked, not recommended, conditional, and verified usable. |

## Full dataset result

- Total: 994
- `ready_for_dynamic`: 393
  - remote handshake: 14
  - isolated stdio: 379
- `metadata_only`: 601
- Medium-risk static signals: 64 entries
- High-risk static signals: 0 entries
- Confidence: 200 high, 370 medium, 424 low

Generated local artifacts:

- `data/tencent-plaza/checks.jsonl`
- `data/tencent-plaza/check-summary.json`

## Coverage and known gaps

The seven focused checker tests and the Tencent ingest test pass. Automated line coverage could not be produced because `@vitest/coverage-v8` is not installed; no dependency was fetched implicitly. Dynamic execution is intentionally excluded from this static-checker milestone. Local stdio packages must run in disposable isolation, not through the existing developer-host probe script.

Git checkpoint commits were intentionally skipped because the worktree already contained staged user changes unrelated to this TDD cycle. No existing staged changes were modified or committed.
