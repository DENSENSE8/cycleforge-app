# CycleForge V1 Outbound — Hardened Execution Plan and Handoff Ledger

**Owner:** CycleForge Engineering  
**Created:** 2026-09-18  
**Status:** PLAN READY — implementation has not started  
**Canonical research input:** [`docs/research/gemini-deep-research-v1-outbound-native-browser-verification.md`](../research/gemini-deep-research-v1-outbound-native-browser-verification.md)  
**Primary local acceptance platform:** Linux, Tauri AppImage and Debian package  
**Only application origin:** `http://localhost:3050`

This file is the execution contract, progress ledger, and fresh-context handoff for the CycleForge V1 outbound slice. It deliberately separates business-rule verification from native integration verification. A browser must be able to prove the entire hosted workflow with real APIs and a replaceable native adapter; the Linux Tauri package must then prove only the OS capabilities a browser cannot supply.

Do not treat a checked box as evidence. Every completed milestone must also contain the commit SHA, gate output, artifact path, and date in the evidence table.

---

## 1. Definition of done

V1 is done only when all of the following are true:

- The immutable label-ingestion ledger is tenant-isolated by explicit predicates **and** forced PostgreSQL RLS.
- Applying an ingestion is one PostgreSQL transaction: exact logical-order resolution, deterministic row locking, tracking attachment, relational document persistence, `PACKED -> LABELED` serial-unit transitions, ingestion finalization, and audit append either all commit or all roll back.
- `orders.status` is never used for CycleForge lifecycle state and never receives `LABEL_READY` or `LABELED`.
- Unknown, ambiguous, malformed, tracking-only, and multi-package inputs become `QUARANTINED`; none are guessed.
- The hosted `/api/v1` implementation is the only business implementation. Browser fixtures, Tauri, and SwiftUI are clients of that implementation rather than parallel rule engines.
- `/ops/outbound` is browser-testable through `http://localhost:3050`, including B03, B04, and B08.
- Electron and `VendorView` are absent from the new execution path, but legacy routes, `src/lib/shipping/outbound-workflow-cohort.ts`, and the design-MCP server remain intact.
- A Linux AppImage and `.deb` are produced from `apps/desktop`, their SHA-256 hashes are recorded, and the AppImage passes the local folder-watch ingestion smoke test against the supervised app at `http://localhost:3050`.
- The SwiftUI API boundary is generated from the same OpenAPI contract. A Linux run does not claim to prove iOS runtime behavior; SwiftUI/XCUITest release gates run on macOS CI.
- The umbrella command `pnpm verify:v1:linux` is green on the target Linux computer, followed by the repository-wide gates required by `AGENTS.md`.

### Explicit non-goals for V1

- Buying labels from marketplace or carrier APIs.
- Scraping or automating an embedded marketplace browser.
- Fuzzy, address, customer-name, OCR-confidence, or AI-based order matching.
- Multi-package auto-application.
- Silent arbitrary-file printing or arbitrary Tauri filesystem/shell access.
- Replacing the hosted backend with native business logic.
- Deleting legacy routes, mobile web routes, Electron code, governance, evaluation cohorts, or design-MCP infrastructure before the replacement has passed all gates.

---

## 2. Frozen repository facts and red lines

These facts must be rechecked against the frozen baseline before code is written. A discrepancy blocks implementation and requires this plan to be amended; it is not permission to improvise.

| Concern | Frozen decision |
| --- | --- |
| Primary keys | `orders.id`, `documents.id`, and `serial_units.id` are `INTEGER`; `shipment_id` and `desktop_devices.id` are `BIGINT`; `organization_id` is `UUID`. |
| Marketplace status | `orders.status` is external marketplace state. V1 never writes fulfillment lifecycle values into it. |
| Unit lifecycle | Use the existing inventory state machine and caller-owned transaction support for `PACKED -> LABELED`; do not issue a direct `UPDATE serial_units SET current_status`. |
| Transaction wrapper | Use `src/lib/tenancy/db.ts::withTenantTransaction(organizationId, fn)`. The organization ID comes from authenticated server context, never the request body. |
| Lock order | Lock target `orders`, then relevant allocation rows, then `serial_units`, with IDs ascending inside each class. No helper may acquire these locks in a different order. |
| Order identity | One marketplace order can be represented by multiple `orders` rows. The logical identity is `(organization_id, account_source, order_id)` and the complete row set is recorded. Never resolve with `LIMIT 1`. |
| Tracking truth | Preserve the existing shipment model: `orders.shipment_id -> shipping_tracking_numbers`, with `shipment_links` as the current relationship mechanism. Do not revive `order_shipment_links`. |
| Existing tracking helper | `applyOrderTrackingOps` currently owns its transaction. Extract or add a caller-owned-transaction core; do not nest it inside atomic apply and do not use a dogfood tenant fallback. |
| Documents | External blob staging happens before apply. Atomic apply may persist the already-staged document metadata and entity links using a caller-owned PostgreSQL client. No GCS/network call occurs inside the transaction. |
| Existing ingestion table | `outbound_document_ingest_jobs` remains the Ecwid packing-slip lifecycle and is not repurposed as the watched-label ledger. |
| Device identity | `kiosk_devices` remains the kiosk/tablet principal. Desktop enrollment uses a separate `desktop_devices` table. |
| Native parser | Server parsing and resolution are authoritative. Tauri PDF extraction is diagnostic/preflight only and cannot decide or apply an order. |
| UI governance | Before any `src/**/*.{tsx,jsx,css}` change, invoke the repository design-system guards and obtain a fresh stamp. |
| App origin | All browser, Playwright, curl, and Tauri dev requests use `http://localhost:3050`; no lane port or ad hoc Next server is allowed. |

### Forbidden implementation patterns

Reject the change if any of these appear in the V1 path:

- Client-supplied `organization_id` used for authorization or database scoping.
- `orgId ?? DOGFOOD_ORG_ID`, optional tenant identity, a raw owner-pool query, or an unscoped conflict lookup.
- Regex, edit distance, `LIKE`, `ILIKE`, trigram, customer address/name, or an LLM used to select an order.
- `LIMIT 1` in logical-order resolution.
- A write to `orders.status` for label readiness.
- A direct serial-unit state mutation that bypasses `transition(...)` and its audit behavior.
- Blob upload, PDF parsing, HTTP, realtime, or printing while the PostgreSQL apply transaction is open.
- A nested transaction in tracking/document helpers called from apply.
- A generic Tauri command such as `read_file(path)`, `write_file`, `shell`, `open_url`, `fetch_url`, or `print_path`.
- A print request that accepts a local path or arbitrary URL instead of a short-lived server-minted print ticket.
- Browser mocks that replace parsing, matching, tenancy, idempotency, or apply logic.
- Production exposure of fixture ingestion or the in-memory print recorder.
- A native or Swift copy of server lifecycle rules.

---

## 3. Safe execution protocol

### 3.1 Baseline precondition

The current `prod` checkout was already dirty when this plan was authored. That is a blocker for implementation, not permission to absorb unrelated work.

Before Milestone 1:

```bash
git status --porcelain
git rev-parse HEAD
```

If `git status --porcelain` is non-empty, stop and report the paths. Do not stash, commit, discard, clean, or move the user's changes. Once the user supplies a clean/frozen commit, create the isolated implementation worktree from that exact SHA:

```bash
git worktree add ../cycleforge-v1-outbound -b codex/v1-outbound <FROZEN_SHA>
```

Record the SHA below. All implementation and evidence must come from that worktree.

- Frozen baseline SHA: `TBD`
- V1 worktree path: `TBD`
- V1 branch: `codex/v1-outbound`

### 3.2 Database safety

- Schema and integration tests run only against a disposable/test database branch whose URL is explicitly approved by the test harness.
- Migration scripts must abort if the target database is identified as production.
- Migrations are expand-first. No existing column/table/constraint is dropped in V1.
- Every tenant-owned table enables and forces RLS and invokes the repository's canonical tenant-isolation function without a catch-and-notice fallback.
- Static tenancy lint is supplementary; live catalog assertions prove that policies and forced RLS actually exist.

### 3.3 Change discipline

- Use `apply_patch` for source edits.
- Before changing a shared helper, run code-graph `find_symbol` then `impact_analysis` as required by `AGENTS.md`.
- Preserve public behavior while extracting caller-owned-transaction cores.
- One milestone per reviewable commit unless a test-only follow-up is necessary.
- Do not mark a milestone complete when a gate is skipped, flaky, or unavailable. Mark it `BLOCKED` with the exact reason.

---

## 4. Target architecture

```text
Normal marketplace browser                         Browser acceptance harness
           |                                                   |
           | PDF download                                      | fixture upload
           v                                                   v
Tauri NativeLabelSource --------------------+---- BrowserFixtureLabelSource
  watch + hash + durable retry journal      |       hash + ordinary File
                                             v
                              POST /api/v1/label-ingestions
                                             |
                           stage bytes -> parse -> exact resolve
                                             |
                              POST /:id/apply or quarantine
                                             |
                     one tenant PostgreSQL transaction
                 orders -> allocations -> serial_units locks
                    tracking + document + audit + ledger
                                             |
                            hosted `/ops/outbound` projection
                              /              |              \
                       Browser          Tauri webview      SwiftUI API client
```

The Tauri webview consumes the hosted operational application. The public web product remains the control plane for signup, organization setup, device enrollment, downloads, releases, and recovery. SwiftUI owns mobile warehouse execution, but not server truth.

---

## 5. ROI-sequenced milestones

### Milestone 0 — Freeze and prove the starting point

**Status:** `BLOCKED — current checkout is dirty`  
**Goal:** Produce a clean, reproducible worktree without touching user-owned changes.

- [ ] Record `git status --porcelain`, current branch, and `git rev-parse HEAD`.
- [ ] Obtain a clean frozen baseline from the user.
- [ ] Create `codex/v1-outbound` in a dedicated worktree.
- [ ] Run the existing `pnpm verify:fast` and record pre-existing failures.
- [ ] Confirm `http://localhost:3050` responds with switchboard headers.

**Gate:** clean status plus recorded baseline evidence.  
**Agent boundary:** may inspect only until the precondition is met; may not normalize the current checkout.

### Milestone 1 — Immutable data core

**Status:** `NOT STARTED`  
**Goal:** Add the tenant-safe ledger, desktop device identity, and atomic apply domain operation. No API, UI, or Rust.

**Deliverables**

- `src/lib/migrations/2026-09-18_v1_label_ingestions.sql`
- `src/lib/drizzle/schema.ts` additions mirroring the migration
- `src/lib/label-ingestions/types.ts`
- `src/lib/label-ingestions/apply.ts`
- `src/lib/label-ingestions/apply.test.ts`
- `src/lib/label-ingestions/tenancy.test.ts`
- caller-owned transaction cores for tracking/document persistence only where required
- package scripts `verify:v1:schema` and `test:v1:data`

**Required schema properties**

- `desktop_devices`: `BIGSERIAL` key, UUID tenant, stable device UUID/public identifier, display label, enrollment/token hashes, status, platform, version, last-seen/revoked timestamps, creator, timestamps; tenant-scoped uniqueness and state checks.
- `label_ingestions`: `BIGSERIAL` key, UUID tenant, desktop device FK, actor, client event UUID, SHA-256 hex digest, file basename/size, observed timestamp, source, lifecycle state, parser version, exact-match evidence, normalized tracking/carrier, staged object metadata, nullable matched order/shipment/document IDs, attempt/row version, safe error code/detail, created/updated/applied timestamps.
- `label_ingestion_orders`: tenant-scoped join from ingestion to **every** matched `orders.id`, with stable ordinal/role and timestamps.
- Composite tenant FKs (or equivalent constraint triggers where PostgreSQL requires them) prevent a row from linking an object owned by another organization.
- Unique `(organization_id, sha256)` rejects duplicate bytes per tenant. Unique `(organization_id, client_event_id)` provides request idempotency. Neither is globally cross-tenant.
- Check constraints validate lowercase 64-character SHA-256, nonnegative byte/attempt/version values, safe basename, legal enums, and state-dependent required/forbidden fields.
- A database transition guard prevents terminal applied records from returning to mutable states.
- All three tables have `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, canonical organization policies, and supporting organization-first indexes.

**Atomic apply contract**

1. Accepts a branded server-derived `organizationId`, ingestion ID, actor ID, and expected row version/client event data—never a request tenant.
2. Opens exactly one `withTenantTransaction`.
3. Locks the ingestion, verifies it is eligible, and returns the already-committed result for an idempotent replay.
4. Resolves the complete exact logical-order row set from persisted match evidence.
5. Locks `orders` by ascending integer ID, then active allocation rows by ascending primary key, then serial units by ascending integer ID.
6. Enforces the V1 single-package rule and requires at least one active `PACKED` allocated unit. Ambiguity/conflict returns a typed non-applied outcome without partial fulfillment mutation.
7. Calls transaction-aware tracking logic against the existing shipment schema.
8. Inserts the relational document and entity links from **pre-staged** object metadata; performs no storage/network operation.
9. Calls the existing state-machine transition for each unit with `expectedFrom: 'PACKED'`, the same transaction client, and explicit organization ID.
10. Appends immutable domain/audit events and finalizes the ingestion as `APPLIED` with linked IDs and incremented row version.
11. Commits once. Any exception rolls back tracking, document rows, unit transitions, audit rows, and ingestion finalization together.

**Deterministic gates**

```bash
pnpm verify:v1:schema
pnpm tenancy:guard:check -- --static-only
pnpm test:v1:data
```

`verify:v1:schema` must connect to the disposable database and assert column types, constraints, FKs, indexes, `relrowsecurity`, `relforcerowsecurity`, and exact policy predicates from PostgreSQL catalogs. The static tenancy guard alone does not prove active RLS.

`test:v1:data` must prove: successful `PACKED -> LABELED`; same-tenant byte and event idempotency; the same hash is legal across two tenants; cross-tenant reads/writes and FK links are denied; logical multi-row order completeness; deterministic lock ordering; lock conflict/retry behavior; stale row version; wrong starting unit state; no allocations; multi-package conflict; and full rollback after an injected failure at each mutation phase.

### Milestone 2 — API contract and ingestion engine

**Status:** `NOT STARTED`  
**Goal:** Make upload, parsing, exact resolution, quarantine, and apply available through a versioned hosted contract.

**Deliverables**

- Zod schemas under `src/lib/label-ingestions/contracts.ts`
- `src/lib/label-ingestions/pdf-parser.ts`
- `src/lib/label-ingestions/exact-resolver.ts`
- versioned routes under `src/app/api/v1/label-ingestions/**`
- object-storage staging/finalization orchestration
- API and parser fixtures/tests
- OpenAPI 3.1 generation from the same Zod schemas

**Contract rules**

- Authentication supplies organization, staff, and enrolled-device identity.
- Requests reject unknown keys, invalid UUIDs, non-PDF MIME/signature, empty/oversized bytes, unsafe names, non-lowercase SHA-256, invalid timestamps, and impossible state combinations.
- The server recomputes SHA-256; a client hash is a comparison hint, not authority.
- Accepted exact identifiers are CycleForge Reference and Marketplace Order ID with explicit marketplace/account context.
- Resolution uses equality on normalized canonical fields. Tracking alone is evidence for quarantine, never an order selector.
- Parser failure, no exact hit, multiple logical hits, unsupported carrier, and multi-package evidence all become a typed quarantine reason.
- A duplicate returns the existing tenant-scoped resource and does not duplicate storage or mutations.
- Error responses contain codes and safe context, never raw label text, buyer address, credentials, SQL, or cross-tenant existence clues.

**Gates**

```bash
pnpm test:v1:ingestion
pnpm test:v1:api
pnpm verify:v1:openapi
```

### Milestone 3 — Browser adapter seam and B01–B22 harness

**Status:** `NOT STARTED`  
**Goal:** Prove business behavior in an ordinary browser using the real hosted API.

**Interfaces**

```ts
export interface NativeLabelSource {
  capabilities(): Promise<LabelSourceCapabilities>;
  chooseSource(): Promise<LabelSourceSelection>;
  observe(onObservation: (event: LabelObservation) => void): Promise<Unsubscribe>;
  retry(observationId: string): Promise<void>;
}

export interface NativePrintService {
  capabilities(): Promise<PrintCapabilities>;
  listPrinters(): Promise<PrinterDescriptor[]>;
  print(request: ServerMintedPrintRequest): Promise<PrintReceipt>;
}
```

- `BrowserFixtureLabelSource` uses an ordinary `<input type="file" accept="application/pdf">`, hashes through Web Crypto, then calls the real `/api/v1/label-ingestions` client.
- `BrowserPrintRecorder` records server-minted print requests in memory and exposes assertions only in a server-authorized test environment.
- Neither adapter imports parser, resolver, apply, database, or lifecycle modules.
- Test mode is protected by server configuration and test authentication. A query string or client bundle flag alone cannot enable it in production.

**Mandatory acceptance cases**

- **B03 exact match auto-apply:** upload a fixture containing one exact CycleForge/marketplace reference and tracking; await `APPLIED`; assert full logical-order links, shipment tracking, document, audit, and all eligible units `LABELED`; assert marketplace order status unchanged.
- **B04 tracking-only quarantine:** upload a valid PDF containing tracking but no exact order reference; assert `QUARANTINED/TRACKING_ONLY`, zero shipment/document/unit mutation, and a review action.
- **B08 duplicate bytes:** upload identical bytes twice with different file names/client events; assert one ingestion resource, one stored object, one document/apply result, and an idempotent duplicate response.

**Gates**

```bash
pnpm test:b03
pnpm test:b04
pnpm test:b08
pnpm test:v1:browser
```

All Playwright traffic must target `http://localhost:3050`. Test traces/screenshots are retained on failure and contain redacted fixture data only.

### Milestone 4 — Isolated hosted operations slice

**Status:** `NOT STARTED`  
**Goal:** Deliver `/ops/outbound` without making the existing large application its build-time dependency graph.

**Deliverables**

- independently buildable `apps/ops-web` workspace package
- gateway/switchboard mount at `/ops/outbound`
- queue, ingestion detail, quarantine resolution, duplicate, device, and print states
- adapter dependency injection at the composition root
- navigation registration consistent with the mobile-first ledger

An isolated git worktree is source-control isolation, not build isolation. `apps/ops-web` must have its own entry point and dependency boundary while reusing deliberately extracted domain/API packages. It must not import legacy app pages.

Before UI edits, call `ds_contract`, relevant `ds_tokens` axes (including station skin where applicable), and `ds_critique`; fall back to the documented CLI only if MCP faces are unavailable. Use repository motion tokens/adapters, not direct `motion/react` imports. Preserve the Industrial Terminal constraints: square geometry (`rounded-none`), hairline borders, high-contrast semantic states, keyboard/scanner operation, reduced-motion support, and no decorative animation that delays fulfillment.

**Gates**

```bash
pnpm verify:v1:ops-web
pnpm run eval:cohort outbound-workflow
pnpm test:v1:browser
pnpm verify:fast
```

### Milestone 5 — Native bridges, SwiftUI contract, and Linux bundle

**Status:** `NOT STARTED`  
**Goal:** Supply narrow native capabilities and a locally installable Linux desktop client.

**Tauri deliverables**

- `apps/desktop` workspace package and `apps/desktop/src-tauri`
- crates: `notify = "8.2"`, `pdf-extract = "0.12"`, `sha2 = "0.11"`, plus narrowly justified `hex`, `reqwest`, `serde`, `tokio`, `uuid`, `rusqlite`, and a reviewed named-printer library
- persistent local observation/outbox journal, bounded retry, debouncing, stable-file detection, and shutdown recovery
- exact production-origin allowlist and minimal Tauri v2 capabilities
- only these domain commands:
  - `native_capabilities()`
  - `choose_label_folder()`
  - `start_label_watch()`
  - `stop_label_watch()`
  - `retry_label_observation(observation_id)`
  - `list_printers()`
  - `print_document(request)` where `request` contains a short-lived server-minted ticket

Tauri computes bytes/hash and uploads the actual file to the hosted endpoint. Local extraction may provide diagnostics but the server recomputes the hash, parses, resolves, and applies. The production webview accepts only the exact configured CycleForge HTTPS origin; development accepts only `http://localhost:3050`. No wildcard remote content policy is allowed.

**SwiftUI deliverables**

- generated OpenAPI client package under `apps/ios`
- reproducible command using Swift OpenAPI Generator, centered on:

```bash
swift package generate-code-from-openapi
```

- `OrdersQueueView`, `ScanMatchSheet`, and `CameraScannerView`
- API-driven state bindings, explicit loading/error/offline states, Keychain-backed credentials, and no duplicated transition logic
- contract tests on Linux where supported; build/UI tests on macOS CI

**Linux bundle gates**

```bash
pnpm --filter @cycleforge/desktop tauri info
pnpm test:v1:tauri
pnpm desktop:v1:bundle:linux
pnpm test:v1:linux-smoke
```

The bundle command must produce:

```text
apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage
apps/desktop/src-tauri/target/release/bundle/deb/*.deb
artifacts/cycleforge-v1/linux/SHA256SUMS
artifacts/cycleforge-v1/linux/manifest.json
```

Release signing/updater signatures are mandatory for a public release. An unsigned local dogfood build may be used for this computer but must be labeled `local-dogfood`, never `release`.

---

## 6. Verification commands to create

These scripts do not exist merely because this plan names them. Each milestone owns creating its script from real assertions, never an `echo` or a pass-through command.

| Command | Required proof |
| --- | --- |
| `pnpm verify:v1:schema` | Migration parity, live types/constraints/indexes/FKs, enabled+forced RLS, expected policies. |
| `pnpm test:v1:data` | M1 atomicity, idempotency, tenancy, lock order/conflict, state transition. |
| `pnpm test:v1:ingestion` | Hash, PDF parser fixtures, exact resolver, quarantine taxonomy. |
| `pnpm test:v1:api` | Auth/device/tenant derivation, strict Zod contracts, upload/apply/idempotency. |
| `pnpm verify:v1:openapi` | Generated OpenAPI is current and validates. |
| `pnpm test:b03` / `b04` / `b08` | Named browser acceptance cases through the real API. |
| `pnpm test:v1:browser` | B01–B22 Playwright suite at `:3050`. |
| `pnpm verify:v1:ops-web` | Isolated typecheck, unit test, and production build. |
| `pnpm test:v1:tauri` | Rust fmt, clippy with warnings denied, unit/integration tests. |
| `pnpm desktop:v1:bundle:linux` | Tauri v2 build for `appimage,deb`; copies artifacts and writes hashes/manifest. |
| `pnpm test:v1:linux-smoke` | AppImage extraction/launch, origin policy, real folder event, retry recovery, API result. |
| `pnpm verify:v1:linux` | Ordered composition of every applicable V1 gate plus `verify:fast` and repository eval. |

Recommended umbrella order:

```text
schema -> data -> ingestion -> API/OpenAPI -> ops-web -> browser -> Rust -> bundle -> Linux smoke -> repository verify/eval
```

The umbrella must fail fast and preserve the failing test's logs/artifacts.

---

## 7. Linux end-to-end dogfood runbook

Run only after Milestones 1–5 are green in automation.

1. Confirm the supervised lane, not a hand-started Next process, serves the route:

   ```bash
   curl -fsS -D - http://localhost:3050/ops/outbound -o /dev/null
   ```

   Verify `x-switch-target`, `x-switch-lane`, and cookie-scope headers.

2. Inspect prerequisites without automatically installing system packages:

   ```bash
   pnpm --filter @cycleforge/desktop tauri info
   ```

3. Run the full Linux gate and build both packages:

   ```bash
   pnpm verify:v1:linux
   pnpm desktop:v1:bundle:linux
   ```

4. Verify artifact hashes:

   ```bash
   sha256sum -c artifacts/cycleforge-v1/linux/SHA256SUMS
   ```

5. Run the AppImage from the explicit generated path. The test script may set execute permission on that one artifact; it must not use a broad recursive chmod.

6. Enroll a desktop device in a disposable test organization, choose a temporary label folder, and copy the B03 fixture into it. Confirm the same ingestion reaches `APPLIED` in both the Tauri webview and a normal browser at `/ops/outbound`.

7. Copy the same bytes under a different name and confirm B08 deduplication. Copy the B04 tracking-only fixture and confirm quarantine without fulfillment mutation.

8. Stop the client after it observes a fixture but before successful upload, restart it, and prove the durable journal retries once without duplicate application.

9. Exercise the browser print recorder. Exercise native named printing only when a real test printer is explicitly configured; absence of a printer is a reported environment limitation, not permission to select a default silently.

10. Optionally install the `.deb` with a user-run privileged command. The automation must never assume sudo authorization:

    ```bash
    sudo apt install ./artifacts/cycleforge-v1/linux/<exact-package-name>.deb
    ```

11. Save the exact artifact paths, SHA-256 hashes, version, git SHA, test organization, and gate logs in the evidence table.

AppImage compatibility must ultimately be validated from the oldest supported Linux base image. Passing only on the developer machine is dogfood evidence, not distribution compatibility.

---

## 8. Progress and evidence ledger

Status values are exactly `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, or `COMPLETE`.

| Milestone | Status | Commit | Gate result | Evidence/artifact | Date |
| --- | --- | --- | --- | --- | --- |
| 0 — clean frozen worktree | BLOCKED | — | current checkout dirty | Record clean baseline here | — |
| 1 — immutable data core | NOT STARTED | — | — | — | — |
| 2 — API and ingestion engine | NOT STARTED | — | — | — | — |
| 3 — browser adapter and B01–B22 | NOT STARTED | — | — | — | — |
| 4 — isolated `/ops/outbound` | NOT STARTED | — | — | — | — |
| 5 — Tauri, SwiftUI contract, Linux bundle | NOT STARTED | — | — | — | — |
| Final Linux dogfood | NOT STARTED | — | — | — | — |

### Decision log

Append decisions; never silently rewrite a completed decision.

| Date | Decision | Reason | Approved by |
| --- | --- | --- | --- |
| 2026-09-18 | Use a separate desktop device principal. | Kiosk identity and desktop enrollment have different trust/capability boundaries. | Plan |
| 2026-09-18 | Keep server parsing/resolution authoritative. | All clients must share one deterministic business implementation. | Plan |
| 2026-09-18 | Pre-stage bytes before atomic apply. | External storage cannot participate in a PostgreSQL rollback. | Plan |
| 2026-09-18 | Build an independent `apps/ops-web`. | A worktree alone does not remove legacy build-graph drag. | Plan |
| 2026-09-18 | Separate Linux desktop proof from macOS iOS proof. | Linux cannot honestly prove SwiftUI/XCUITest runtime behavior. | Plan |

### Blocker log

| Date | Milestone | Blocker | Required resolution |
| --- | --- | --- | --- |
| 2026-09-18 | 0 | The current `prod` checkout contains extensive user-owned modifications. | User supplies or identifies a clean frozen commit/worktree; agent must not stash or discard it. |

---

## 9. Fresh-context implementation prompt — Milestone 1 only

Copy the entire block below into a new implementation task after Milestone 0 is resolved.

```text
# AGENT DIRECTIVE: CYCLEFORGE V1 — MILESTONE 1 DATA CORE

You are implementing Milestone 1 only in the CycleForge repository. This is a code-writing task, but it begins with a hard stop precondition.

READ FIRST, IN FULL:
1. The repository-root AGENTS.md and every rule it routes you to for the files you will touch.
2. docs/roadmap/CYCLEFORGE_V1_OUTBOUND_EXECUTION_PLAN.md.
3. docs/research/gemini-deep-research-v1-outbound-native-browser-verification.md only where the plan links to research context.

The roadmap file is the architecture and tracking contract. You may update only its Milestone 0/1 status, evidence, decision log, and blocker log. Do not silently change its frozen architectural decisions.

PRECONDITION — RUN BEFORE EDITING:

  git status --porcelain
  git rev-parse --abbrev-ref HEAD
  git rev-parse HEAD

The expected branch is codex/v1-outbound in a dedicated clean worktree created from the recorded frozen SHA. If the working tree is dirty, the branch/path/SHA does not match the plan, or the plan still has no frozen SHA, STOP. Report the exact mismatch. Do not stash, commit, clean, discard, or absorb existing changes. Do not begin the migration.

SCOPE:

Implement only the immutable data core:
- src/lib/migrations/2026-09-18_v1_label_ingestions.sql
- matching additions to src/lib/drizzle/schema.ts
- src/lib/label-ingestions/types.ts
- src/lib/label-ingestions/apply.ts
- src/lib/label-ingestions/apply.test.ts
- src/lib/label-ingestions/tenancy.test.ts
- minimal caller-owned-transaction cores in existing tracking/document modules when apply needs them
- real package scripts and test/schema tooling for verify:v1:schema and test:v1:data

Do not create React/JSX/CSS, Next API routes, Tauri/Rust, SwiftUI, PDF parsing, browser adapters, or OpenAPI code. Do not delete or rename legacy routes, src/lib/shipping/outbound-workflow-cohort.ts, design-MCP, Electron, or existing ingestion tables.

FROZEN TYPES AND DOMAIN RULES:
- orders.id, documents.id, serial_units.id: INTEGER.
- shipment_id and desktop_devices.id: BIGINT.
- organization_id: UUID.
- orders.status is marketplace state. Never write LABEL_READY or LABELED there.
- serial-unit transition is PACKED -> LABELED through the existing state machine, never a direct status UPDATE.
- an organization ID is mandatory and server-derived at the future call boundary. No optional org, request-body tenant, dogfood fallback, or raw owner-pool query.
- matching is exact logical-order identity (organization_id, account_source, order_id). One marketplace order may include multiple orders rows; never LIMIT 1.
- lock target orders, then active allocations, then serial units, with ascending primary keys inside each class.
- tracking uses the current shipping_tracking_numbers/shipment_links/orders.shipment_id model. Do not restore order_shipment_links.
- external storage, parsing, HTTP, realtime, and printing are outside the database transaction. Milestone 1 consumes only already-staged object metadata.

BEFORE SHARED HELPER EDITS:

Use the repository code graph as AGENTS.md requires: find_symbol, then impact_analysis, for withTenantTransaction, transition, applyOrderTrackingOps, and any document persistence helper you change. Preserve each current public entry point while extracting a core that accepts the caller's transaction client and explicit organization ID. No nested BEGIN/COMMIT is allowed under atomic apply.

MIGRATION REQUIREMENTS:

Create desktop_devices, label_ingestions, and label_ingestion_orders with the columns and invariants specified in Milestone 1 of the roadmap. The SQL and Drizzle definitions must agree exactly.

Every table must:
- carry organization_id UUID NOT NULL;
- have organization-first indexes;
- prevent cross-organization relationships with composite tenant foreign keys or an equally strict database constraint;
- ENABLE and FORCE ROW LEVEL SECURITY;
- install the repository-canonical tenant policies via an unconditional migration call (no catch-and-notice fallback).

Enforce tenant-scoped uniqueness for label byte hash and client event ID. Add checks for the 64-character lowercase hex digest, legal state/source/status values, sizes/counters, safe basenames, and state-dependent result columns. Prevent an APPLIED ingestion from reverting to a mutable state. Do not perform destructive schema changes.

ATOMIC APPLY REQUIREMENTS:

Use withTenantTransaction exactly once. Inside it:
1. Lock and validate the tenant-scoped ingestion; replay of an already-applied request returns the same result.
2. Resolve and lock the entire exact logical-order row set.
3. Lock active allocations, then serial units, in the plan's deterministic order.
4. Enforce the V1 single-package and active-PACKED-allocation rules.
5. Apply tracking through a caller-owned-transaction core.
6. Persist the relational document/entity links from pre-staged metadata through that same client.
7. Call the existing transition helper with expectedFrom PACKED, the same client, and explicit organization ID for every eligible unit.
8. Append audit/domain events and finalize the ingestion as APPLIED.
9. Commit once. Any injected failure must roll everything back.

Do not open a nested transaction. Do not make a network/storage call. Do not mutate allocation lifecycle to represent LABELED. Do not catch a transaction failure and continue.

TEST REQUIREMENTS:

Use a disposable test database and fail closed if the target looks like production. Tests must prove:
- live database column types, constraints, indexes, composite tenant FKs, enabled RLS, forced RLS, and exact policies;
- cross-tenant select/insert/update/link denial under the actual non-bypass application role;
- same bytes deduplicate within a tenant but are legal in two different tenants;
- client-event idempotency and applied-result replay;
- complete resolution of a logical marketplace order represented by multiple rows;
- deterministic lock acquisition and lock conflict/retry behavior;
- successful tracking/document/audit writes and PACKED -> LABELED transition;
- marketplace orders.status remains byte-for-byte unchanged;
- stale row version, wrong unit state, zero allocations, ambiguous/multi-package inputs, and tenant mismatch do not partially mutate data;
- injected failure after each mutation phase rolls the full transaction back.

GATES — ALL MUST RUN AND PASS:

  pnpm verify:v1:schema
  pnpm tenancy:guard:check -- --static-only
  pnpm test:v1:data
  pnpm verify:fast
  node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast

verify:v1:schema must inspect live PostgreSQL catalogs. The static tenancy command is supplemental and cannot stand in for RLS proof. Do not make scripts that only print success, skip tests, or silently pass when DATABASE_URL/test prerequisites are absent.

If a gate fails, fix an in-scope defect or record the exact blocker; do not weaken a test, constraint, RLS policy, baseline, or repository guard. Do not claim completion with a skipped gate.

TRACKING AND FINAL HANDOFF:

Update the roadmap evidence ledger with status, commit SHA, exact commands/results, date, and artifact/log paths. Mark Milestone 1 COMPLETE only after all gates above pass and the worktree is clean except for the intended committed change.

Your final response must state:
- outcome and commit SHA;
- files changed and any shared-helper extraction;
- migration/rollback behavior;
- exact gate results;
- remaining blockers or risks;
- explicit confirmation that no UI, API route, Rust, SwiftUI, orders.status lifecycle write, fuzzy matching, client tenant trust, or legacy deletion was introduced.
```

---

## 10. Subsequent handoff rule

When Milestone 1 is complete, create the next fresh-context prompt by copying this same structure and narrowing it to Milestone 2. Every prompt must include:

- the clean-worktree/frozen-SHA precondition;
- the milestone's exact allowed files and explicit exclusions;
- frozen types and red lines;
- its deterministic gates;
- the progress-ledger update requirement;
- an honest stopping rule when prerequisites are missing.

Do not send a fresh agent a multi-milestone “finish everything” prompt. The five implementation milestones are independently reviewable safety boundaries; crossing one without its gate converts a deterministic migration into an untraceable rewrite.

---

## 11. Primary implementation references

- Tauri v2 CLI and `--bundles`: <https://v2.tauri.app/reference/cli/>
- Tauri v2 configuration and remote URL policy: <https://v2.tauri.app/reference/config/>
- Tauri Linux AppImage guidance: <https://v2.tauri.app/distribute/appimage/>
- Tauri updater signing: <https://v2.tauri.app/plugin/updater/>
- Swift OpenAPI Generator: <https://github.com/apple/swift-openapi-generator>

Repository code and the guard modules routed by `AGENTS.md` remain authoritative over generic examples in external documentation.
