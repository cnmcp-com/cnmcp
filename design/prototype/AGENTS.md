# Final Prototype Instructions

## Source of truth

Use ../PRD.md, ../UI-SPEC.md, ../ARCHITECTURE.md and ../database/README.md. These are the only current design definitions. Do not reintroduce earlier draft decisions.

## Product boundaries

- Ordinary users only. No operator/admin roles, role switching, management routes or classification UI. Authors edit only their own topics.
- Fixed columns 全部 / 主题 / 资源发现 beside the logo. All is a domain-only overview with separate recent-topic (up to 6) and resource (up to 3) sections, no mixed feed or facets.
- Topics use domain + one flat node; resources use multiple domains and applicable tags. Node/tag directories share horizontal styling below domain. No left tag sidebar or resource inline search; global header search remains.
- Video/game are domains, never parent nodes. Shared nodes have one global identity via domain_nodes; resource tags bind valid resource-domain and domain-tag pairs.
- Publishing is title, optional body, domain and node. Incomplete classification may be saved privately as a draft; public posting requires a valid pair. Shared @/button reference editor is used in bodies, replies and comments.
- Topics/resources are independent references. Replies and resource comments never merge counts. Repeated references from the same topic deduplicate.
- New HTTPS links are resources immediately; metadata completion is not admission. No verification tiers, synthetic quality scores, adopted-count claims or fabricated GitHub Stars.
- Common sidebar includes account, participation, domain-scoped demo daily hot and actual local recent history. History is cross-domain, deduplicated, limited20/display5 and locally persisted; unavailable targets are omitted.
- Production daily boundary is Asia/Shanghai. Fixture dates in this preview remain explicitly simulated. Sidebar sits right at >=780px and follows main content below that width.
- This is local frontend simulation. Do not claim production OAuth, businessAPI, database integration or MCP deployment.
- cnmcp owns website/BFF/contracts; cnmcp-server owns the authoritative backend, DB, auth, jobs and P1 MCP. Design-only SQL lives in ../database until a one-time handoff to the backend migration chain.

## Runtime and maintenance

- Build UI in src/. Preserve .openai/hosting.json, worker/index.js, scripts/prepare-sites-build.mjs and tests/sites-worker.test.mjs so this project remains locally runnable and Sites-ready.
- Run the preview yourself and verify it when changing the UI. Do not give the user server-start instructions when you can run it.
- npm run build must produce dist/client/index.html, dist/server/index.js and dist/.openai/hosting.json. Run npm run test:model and npm run test:sites as appropriate.
- Current screenshot references are ../screenshots/overview.jpg and ../screenshots/login.jpg. Retain only final evidence; update design-qa.md with the latest verified outcome rather than accumulating version folders.
- No production writes, data resets, deployment or external messages are implied by prototype maintenance.
