# WMS resilient event sync and offline execution — hard plan

**Status:** proposed  
**Primary outcome:** no accepted warehouse action is lost, duplicated, silently
rejected, or hidden by a WebSocket disconnect  
**Application origin:** `http://localhost:3050` only  
**Primary mobile surface:** `/m/scan`  
**Current realtime transport:** Ably  
**Current offline write store:** IndexedDB `cf-offline-queue`  
**Current database:** Neon Postgres  
**Optional CDC candidate:** Sequin  
**Deferred read-sync candidate:** Electric + PGlite  
**Deferred analytics candidate:** ClickHouse ClickPipes powered by PeerDB

## Definition of done

- [ ] A warehouse mutation is acknowledged as **queued** only after its complete
  command envelope has committed to IndexedDB. IndexedDB failure paints a blocking
  failure and never returns a synthetic success.
- [ ] Every offline-capable command carries a stable `commandId` and
  `Idempotency-Key`; replaying it any number of times produces one server-side
  business effect and one authoritative response.
- [ ] Commands replay in FIFO order within one aggregate. Commands for unrelated
  aggregates may run concurrently only after tests prove they cannot violate a
  shared invariant.
- [ ] A browser reload, tab close/reopen, worker restart, captive portal, lost HTTP
  response, Ably disconnect, and two-tab race cannot lose or double-apply an
  accepted action.
- [ ] Retriable failures remain visible and retry with bounded exponential backoff.
  Deterministic rejections move to a visible dead-letter state with retry, inspect,
  and discard controls; they are never silently deleted.
- [ ] Every server mutation writes its business state and a versioned,
  organization-scoped domain event in the same Postgres transaction.
- [ ] Every organization event receives a monotonic reconnect cursor. A client that
  reconnects requests events after its last applied cursor and converges without a
  page reload. An expired cursor triggers an explicit authoritative snapshot
  fallback.
- [ ] Ably remains the low-latency notification transport. The durable event log,
  not Ably delivery, is the recovery source of truth.
- [ ] Browser E2E coverage runs against `http://localhost:3050` with the repository's
  authenticated QA tenant and proves offline scan, persistence, replay,
  idempotency, ordering, dead-letter recovery, two-tab locking, missed-event
  catch-up, tenant isolation, and cached offline reads.
- [ ] Unit, integration, API, and browser gates are registered in `pnpm verify:fast`
  or a required CI job. None of the critical resilience cases may be skipped when
  credentials are present.
- [ ] Production rollout has observable queue age, replay latency, rejection count,
  event lag, cursor fallback count, and oldest-unprocessed-event alarms, with a
  rehearsed rollback.

## Non-goals

- [ ] Do not replace Ably with direct browser CDC or a browser-to-Neon connection.
- [ ] Do not claim that Electric currently provides bidirectional local-write sync
  or automatic conflict resolution. The baseline write path remains command
  outbox to authenticated Next.js API.
- [ ] Do not mirror the full operational schema into PGlite.
- [ ] Do not adopt ClickHouse, PeerDB, Artie, Kafka, or a second analytical store
  until the measured decision gates in this plan are met.
- [ ] Do not expose raw WAL or raw Sequin row-change messages to clients.
- [ ] Do not make raw table rows the public event contract. Browser and worker
  consumers receive stable domain events.
- [ ] Do not broaden offline support to a mutation until its server endpoint has
  idempotency, authorization, validation, conflict semantics, and an E2E fixture.

## Current-state findings that this plan must close

- [ ] Reconcile the checked-in `realtime_outbox` contract. It is marked Phase 1
  and covers `repair_service` only.
- [ ] Add `organization_id` to the durable event envelope. The current webhook
  rejects an event without `orgId`, while `scripts/realtime-outbox-relay.js` does
  not select or send one.
- [ ] Replace UUID-only replay position with a monotonic cursor suitable for
  `after=<cursor>` catch-up.
- [ ] Bootstrap the browser drainer from the authenticated mobile shell. Today it
  installs only when `queueOrFetch()` is called, so a reopened session can retain
  pending commands without attempting a drain.
- [ ] Make IndexedDB transaction failure observable. Today `openDB()` and
  transaction failures collapse to `null`, while the caller still receives a
  synthetic `202` queued response.
- [ ] Replace silent deletion of replayed `4xx` responses with classified rejection
  handling and operator recovery.
- [ ] Add the missing queue store/hook that supplies `pendingCount` and failure
  state to `NetworkChip`.
- [ ] Add single-flight and cross-tab ownership. `online`, heartbeat, and multiple
  tabs must not concurrently drain the same queue.
- [ ] Add focused automated coverage for `src/lib/offline/write-queue.ts`.

## Architectural contract

### Command path

```text
operator action
  -> Zod-validated client command envelope
  -> durable IndexedDB command record
  -> optimistic projection marked pending
  -> authenticated Next.js command API
  -> permission + Zod + conflict policy
  -> business mutation and domain event in one Neon transaction
  -> idempotency response persisted server-side
  -> authoritative response applied to client
  -> local command marked confirmed and removed after reconciliation
```

### Event and reconnect path

```text
Neon domain event log
  -> relay or CDC adapter
  -> Ably organization channel for low-latency notification
  -> browser applies event or invalidates the narrow query

browser reconnect
  -> GET /api/realtime/catch-up?after=<lastAppliedCursor>
  -> ordered domain events after cursor
  -> browser applies each event exactly once
  -> browser persists new cursor
  -> authoritative snapshot only when cursor retention cannot cover the gap
```

### Required command envelope

```ts
type OfflineCommandV1 = {
  schemaVersion: 1;
  commandId: string;
  organizationId: string;
  actorStaffId: number;
  aggregateType: string;
  aggregateId: string;
  commandType: string;
  expectedAggregateVersion: number | null;
  createdAt: string;
  body: unknown;
};
```

The implementation must use a strict Zod object and derive the TypeScript type
from it. `organizationId` and `actorStaffId` are recorded for local inspection
but never trusted as authority; server authentication supplies the authoritative
tenant and actor.

### Required domain-event envelope

```ts
type DomainEventV1 = {
  schemaVersion: 1;
  cursor: string;
  eventId: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  occurredAt: string;
  actorStaffId: number | null;
  commandId: string | null;
  causationId: string | null;
  traceId: string | null;
  payload: unknown;
};
```

The database cursor is monotonic and opaque to the client. Clients compare it
only through server ordering and persist the last successfully applied value.

## Conflict policy matrix

| Warehouse fact | Command model | Offline policy | Server convergence rule | Browser proof |
|---|---|---|---|---|
| Bin put/take | Signed delta | Allowed | Append one ledger delta per `commandId`; additive projection | Replayed ambiguous request creates one ledger row and the exact final quantity |
| Mobile scan observation | Append-only fact | Allowed | Unique `(organization_id, command_id)` | Reload and reconnect preserve one scan event |
| Pick confirmation | State transition plus unit identity | Allowed after endpoint audit | Reject impossible transition; replay prior success for same key | Two devices cannot pick one unit twice |
| Assignment | Versioned replacement | Allowed with warning | Compare `expectedAggregateVersion`; stale write becomes conflict | Stale offline assignment enters conflict UI and does not overwrite newer assignment |
| Absolute cycle count | Versioned observation | Allowed only with count-session identity | Record observation; server reconciles against current ledger and may require review | Offline count never silently replaces intervening stock movement |
| Ship/scan-out confirmation | Idempotent irreversible transition | Allowed only after invariant audit | One transition per package/manifest; duplicate returns original outcome | Lost response plus replay produces one shipment event |
| Photo upload | Binary evidence plus metadata | Deferred separately | Persist metadata command and upload blob with resumable/retry contract | Offline metadata cannot claim a photo uploaded before blob confirmation |
| Destructive delete | Destructive state transition | Offline disabled by default | Online confirmation and current-version check | Offline UI refuses to promise deletion |

No additional command becomes offline-capable until its row in this matrix is
added with all four columns completed and its browser scenario passes.

## Phase 0 — freeze contracts and establish evidence

- [ ] Add `docs/eval/cohorts/resilient-sync/LEDGER.md` and register a
  `resilient-sync` cohort in `tools/eval-ledger/registry.json`.
- [ ] Record the current files, mutation call sites, idempotent endpoints,
  realtime publishers, query subscribers, service-worker routes, and existing
  outbox schemas in the ledger.
- [ ] Inventory every `queueOrFetch()` caller and every mobile warehouse mutation
  that still calls `fetch()` directly.
- [ ] Produce an endpoint matrix with method, permission, request schema,
  idempotency implementation, conflict rule, event emitted, offline eligibility,
  and browser test.
- [ ] Capture the current `realtime_outbox` schema and verify the relay/webhook
  `organization_id` mismatch with an automated contract test.
- [ ] Add deterministic clocks and UUID injection points to the queue module so
  unit tests do not depend on wall time or random IDs.
- [ ] Define QA-only fixture names prefixed `e2e-resilient-sync-<run-id>` and a
  cleanup procedure that removes only rows authored by that run.
- [ ] Add package scripts:
  - `test:resilient-sync:unit`
  - `test:resilient-sync:api`
  - `test:resilient-sync:e2e`
  - `eval:cohort resilient-sync`
- [ ] Store baseline evidence under
  `docs/eval/cohorts/resilient-sync/snapshots/<date>-baseline/`.

Exit: contracts, mutation inventory, current failures, fixture isolation, and
commands are visible before behavior changes.

## Phase 1 — server idempotency and domain events

- [ ] Create one rule module for event-envelope validation and supported event
  schema versions. The API, relay, CLI guard, and tests must consume this module.
- [ ] Add a migration for a tenant-scoped append-only domain-event table with:
  - monotonic cursor;
  - unique `event_id`;
  - non-null `organization_id`;
  - aggregate identity and version;
  - event type and schema version;
  - actor, command, causation, and trace identity;
  - bounded JSON payload;
  - creation timestamp;
  - indexes for `(organization_id, cursor)` and aggregate history.
- [ ] Add server idempotency uniqueness for every Phase 1 offline command. An
  identical key returns the original status and body; a reused key with a
  different request hash returns a deterministic conflict.
- [ ] Refactor bin adjustment so its ledger write, stock projection, idempotency
  response, and domain event commit atomically.
- [ ] Include the authoritative aggregate version and event cursor in successful
  mutation responses.
- [ ] Build `GET /api/realtime/catch-up?after=<cursor>&limit=<bounded>` with
  authenticated organization scoping, strict input validation, stable ordering,
  pagination, and an explicit `snapshot_required` response for an expired cursor.
- [ ] Build a QA-only read endpoint or fixture helper that reports effects by
  `commandId` without exposing cross-tenant data.
- [ ] Add retention configuration and a guard that prevents pruning events newer
  than the supported offline window.
- [ ] Add a CLI audit that reports event lag, oldest event, duplicate command IDs,
  aggregate-version gaps, and missing tenant IDs as JSON.

### Phase 1 automated proof

- [ ] Unit: strict event schema accepts every registered event and rejects unknown
  keys, missing tenant, invalid cursor, and unsupported schema version.
- [ ] Database integration: transaction rollback leaves neither business mutation
  nor event row.
- [ ] Database integration: repeated identical command returns one business effect,
  one event, and the original response.
- [ ] Database integration: same idempotency key with a different request body is
  rejected and changes no state.
- [ ] API: catch-up returns only the authenticated organization and strictly
  increasing cursors.
- [ ] API: pagination cannot omit or duplicate an event at a page boundary.
- [ ] API: expired cursor returns `snapshot_required`; malformed and future cursors
  fail closed.

Exit: server writes are atomic, idempotent, tenant-scoped, cursor-addressable,
and independently testable without Ably.

## Phase 2 — durable browser command queue

- [ ] Replace the implicit request record with the versioned command envelope.
- [ ] Upgrade IndexedDB with stores/indexes for commands, attempts, aggregate
  ordering, state, and created time. Migration must preserve valid version-1
  pending records or move invalid records to visible recovery state.
- [ ] Resolve enqueue only on IndexedDB transaction completion. Abort, quota,
  unavailable storage, serialization, and version-change failures reject the
  operator action.
- [ ] Install the queue runtime once from the authenticated mobile shell, not from
  the first mutation call.
- [ ] Implement states `pending`, `sending`, `retry_wait`, `conflict`, `rejected`,
  and `confirmed` with explicit transition tests.
- [ ] Sort by aggregate and enqueue sequence. Permit only one in-flight command
  for an aggregate.
- [ ] Use Web Locks when available, with an IndexedDB lease fallback, so one tab
  owns replay. Expired leases are recoverable after a crashed tab.
- [ ] Add bounded exponential backoff with jitter for network errors, `408`, `425`,
  `429`, and `5xx`. Respect `Retry-After`.
- [ ] Classify authentication loss, permission denial, validation failure, stale
  version, and missing aggregate separately. None may be silently discarded.
- [ ] Apply the authoritative response before marking a command confirmed. If
  application fails, retain enough information to re-fetch and reconcile.
- [ ] Export a React-free store API plus a hook for pending count, conflicts,
  rejections, oldest age, last successful sync, and manual retry.
- [ ] Feed real queue state into `NetworkChip` and an operator-accessible queue
  inspector. Consult `ds_contract`, `ds_tokens`, and `ds_critique` before UI edits.
- [ ] Keep payloads free of session cookies, bearer tokens, image blobs, and secrets.
  Browser fetch supplies current credentials at replay time.

### Phase 2 automated proof

- [ ] Unit: successful IndexedDB transaction is required before queued success.
- [ ] Unit: unavailable/quota-failed IndexedDB returns an actionable failure.
- [ ] Unit: state-transition table rejects illegal transitions.
- [ ] Unit: commands for one aggregate remain FIFO across retries and reload.
- [ ] Unit: unrelated aggregates can progress when one is waiting for retry.
- [ ] Unit: `4xx` classification produces conflict/rejected state rather than
  deletion.
- [ ] Unit: backoff is bounded, honors `Retry-After`, and is deterministic under
  injected random/clock dependencies.
- [ ] Browser component: pending count, retry state, conflict, and rejection are
  keyboard and screen-reader operable.

Exit: local acceptance means durable storage, operator-visible state, and one
ordered replay owner.

## Phase 3 — reconnect delta and Ably convergence

- [ ] Extend Ably event payloads with domain `eventId`, cursor, aggregate identity,
  aggregate version, and schema version.
- [ ] Persist the last successfully applied cursor per organization and authenticated
  device profile.
- [ ] Deduplicate Ably and catch-up delivery by `eventId` and aggregate version.
- [ ] On Ably `connected` after `disconnected` or `suspended`, pause narrow event
  application, request catch-up after the persisted cursor, apply in order, then
  resume live delivery.
- [ ] Buffer live Ably events that arrive during catch-up and apply them after the
  catch-up boundary, deduplicated by event ID.
- [ ] Use narrow cache patches or query invalidation defined by the event registry.
  Keep the current broad invalidation only as the explicit snapshot fallback.
- [ ] Record cursor fallback and catch-up duration in client diagnostics.
- [ ] Ensure a logout clears tenant-scoped cursors, cached private API responses,
  command state that cannot safely transfer, and Ably subscriptions.

### Phase 3 automated proof

- [ ] Unit: same event from catch-up and Ably applies once.
- [ ] Unit: buffered live event cannot overtake an older catch-up event for the
  same aggregate.
- [ ] Unit: cursor persists only after successful application.
- [ ] Integration: disconnect across several server writes, reconnect, and converge
  to the exact authoritative version without reload.
- [ ] Integration: expired cursor invokes one snapshot fallback and resumes from
  the returned boundary.
- [ ] Security: changing organizations cannot reuse the prior organization's cursor,
  cache, or queued command.

Exit: missed realtime is recovered as ordered data, not merely guessed through a
full UI refresh.

## Phase 4 — end-to-end browser resilience suite

Create `tests/e2e/resilient-sync.spec.ts` for deterministic browser fault injection
and `tests/e2e/resilient-sync-live.spec.ts` for QA Neon plus live relay/Ably proof.
Use the `mobile` or `qa-desktop` Playwright project as named below. Every request
must target `http://localhost:3050` through `baseURL`.

### Browser harness requirements

- [ ] Add helpers that inspect and seed only the app's IndexedDB stores through
  `page.evaluate`, without bypassing production queue code for the action under
  test.
- [ ] Add a fault controller that can abort a request before the server sees it,
  allow server commit then drop the response, return controlled `4xx`/`5xx`, and
  restore normal routing.
- [ ] Use `browserContext.setOffline(true)` for whole-radio loss and `page.route()`
  for endpoint-specific ambiguous failures.
- [ ] Add a fake-camera fixture with a known Code 128/Data Matrix video or frame
  and Chromium fake-media launch arguments. Keep manual scan input coverage as the
  deterministic fallback for queue semantics.
- [ ] Attach trace, screenshot, video, console output, command IDs, cursor range,
  and server-effect report on failure.
- [ ] Fail if the page logs an unhandled rejection, uncaught exception, cross-tenant
  payload, or hydration error.
- [ ] Run data-changing scenarios only in the QA organization and remove fixtures by
  run ID in `afterAll`, even after a failed assertion.

### E2E-01 — offline scan is durably accepted

- [ ] Open `/m/scan` while online and load a QA bin/SKU fixture.
- [ ] Switch the browser context offline.
- [ ] Submit one signed bin delta through the visible scan/quantity workflow.
- [ ] Assert the success copy says queued, not confirmed.
- [ ] Assert IndexedDB contains the exact command ID, aggregate, body, enqueue
  sequence, and `pending` state.
- [ ] Assert `NetworkChip` paints `1 pending` and the optimistic quantity is visibly
  marked pending.
- [ ] Assert the server reports zero effects for the command ID.

### E2E-02 — reload and reopen preserve work

- [ ] Starting from E2E-01 state, reload while still offline.
- [ ] Assert the shell renders from cached resources and the command remains visible.
- [ ] Close the page, create another page in the same authenticated context, and
  reopen `/m/scan`.
- [ ] Assert the same command ID and pending count remain; no duplicate command is
  created.

### E2E-03 — reconnect drains once and reconciles authoritatively

- [ ] Restore connectivity.
- [ ] Assert one request leaves the browser with the original idempotency key.
- [ ] Assert pending state reaches zero and the queue inspector records confirmation.
- [ ] Assert the server has one ledger effect and one domain event for the command.
- [ ] Assert the visible quantity equals the authoritative server response.
- [ ] Assert the persisted event cursor advances without a page reload.

### E2E-04 — server commits but response is lost

- [ ] Intercept the mutation, allow `route.fetch()` to commit it, then abort the
  response before the page receives it.
- [ ] Assert the browser queues the same command ID rather than creating a new one.
- [ ] Restore routing and replay.
- [ ] Assert the server returns the cached idempotent response.
- [ ] Assert exactly one ledger effect and one event exist.
- [ ] Assert the UI settles to confirmed rather than applying the optimistic delta
  twice.

### E2E-05 — FIFO and per-aggregate isolation

- [ ] While offline, enqueue `+2` then `-1` against one bin/SKU aggregate and `+3`
  against another aggregate.
- [ ] Force the first aggregate's first request to return one retriable failure.
- [ ] Assert its second command does not overtake it.
- [ ] Assert the unrelated aggregate can confirm.
- [ ] Restore the first request and assert event order and final quantities match
  enqueue order.

### E2E-06 — deterministic rejection is visible

- [ ] Queue a versioned assignment or absolute-count command offline.
- [ ] Change the aggregate from a second authenticated page before reconnect.
- [ ] Reconnect the first page and assert the stale command becomes `conflict`.
- [ ] Assert it is not deleted, not retried forever, and does not overwrite the
  newer server value.
- [ ] Exercise the visible inspect and discard controls; assert discard requires
  confirmation and removes only the selected rejected command.

### E2E-07 — permission/authentication change fails closed

- [ ] Queue an eligible command, then simulate an expired session or revoked
  permission before reconnect.
- [ ] Assert replay pauses in an authentication/permission state.
- [ ] Assert no command is sent under a different staff member after sign-in.
- [ ] Assert the operator can re-authenticate and deliberately retry only when the
  same tenant and permitted identity are restored.

### E2E-08 — two tabs elect one drainer

- [ ] Open two pages in one browser context so they share IndexedDB.
- [ ] Queue a command offline, then restore connectivity with both pages open.
- [ ] Assert one page acquires the replay lease.
- [ ] Assert only one network replay occurs before idempotency defense.
- [ ] Close the lease-owning page during an in-flight retry.
- [ ] Advance beyond lease expiry and assert the second page safely resumes.

### E2E-09 — missed Ably events catch up by cursor

- [ ] Open Device A on the affected mobile record and record its cursor.
- [ ] Block Device A's Ably connection or place it offline.
- [ ] Use Device B to commit at least three changes, including two changes to the
  same aggregate.
- [ ] Restore Device A.
- [ ] Assert Device A calls catch-up after its recorded cursor.
- [ ] Assert changes paint in version order without a document reload.
- [ ] Assert Device A's final UI and cursor equal the server's authoritative state.
- [ ] Assert no broad snapshot endpoint is called while the cursor remains retained.

### E2E-10 — catch-up/live race deduplicates

- [ ] Delay Device A's catch-up response.
- [ ] Deliver a new live Ably event while catch-up is in progress.
- [ ] Release the catch-up response containing an overlapping event.
- [ ] Assert each event applies once, versions never regress, and the live event
  paints after its causal predecessor.

### E2E-11 — expired cursor snapshot fallback

- [ ] Seed or request a cursor older than retained event history.
- [ ] Assert the server returns `snapshot_required` with a safe boundary.
- [ ] Assert the client performs one authoritative snapshot refresh, stores the new
  cursor, and resumes live delivery.
- [ ] Assert the UI identifies the recovery in diagnostics without alarming the
  operator after success.

### E2E-12 — tenant isolation

- [ ] Create equivalent aggregate IDs in QA organizations A and B.
- [ ] Authenticate Device A to organization A and Device B to organization B.
- [ ] Commit events in both organizations.
- [ ] Assert catch-up, Ably delivery, IndexedDB command records, service-worker
  cached API responses, and diagnostics never cross organizations.
- [ ] Sign Device A out and into organization B; assert organization A private
  state is cleared before organization B data renders.

### E2E-13 — offline cached reads remain honest

- [ ] Warm the selected mobile bin, product identity, reason-code, and assigned-work
  reads while online.
- [ ] Go offline and revisit the same workflow.
- [ ] Assert cached records render with an offline/staleness indication.
- [ ] Assert an uncached lookup produces an explicit unavailable result and never
  fabricates an empty authoritative answer.
- [ ] Assert cache keys include organization identity and logout purges private
  cached responses.

### E2E-14 — camera decode enters the same command path

- [ ] Start `/m/scan` with fake camera media containing a known supported barcode.
- [ ] Assert ZXing decodes the expected value once under dedup/cooldown rules.
- [ ] Go offline before committing the resulting warehouse action.
- [ ] Assert the resulting command envelope and replay behavior are identical to
  manual/wedge input.
- [ ] Assert no image frame or camera blob is stored in the command queue.

### E2E-15 — sustained fault cycle

- [ ] Run 100 deterministic cycles across network abort, lost response, `429`,
  `503`, reload, and reconnect patterns against isolated QA fixtures.
- [ ] Assert zero lost commands, zero duplicate business effects, zero aggregate
  version regressions, zero silent rejections, and zero cross-tenant records.
- [ ] Record enqueue latency, confirmation latency, catch-up duration, and event
  lag distributions in the cohort evidence.

### Browser performance acceptance

- [ ] Local enqueue acknowledgment p95 is below 150 ms on the Playwright mobile
  profile after the operator confirms the action.
- [ ] With healthy local services, reconnect-to-confirmed p95 is below 5 seconds for
  a queue of 20 commands across distinct aggregates.
- [ ] With healthy local services, a retained-cursor catch-up of 100 events reaches
  a settled UI in under 3 seconds.
- [ ] Queue initialization does not add more than 50 ms p95 scripting time to the
  authenticated mobile shell in the controlled browser profile.
- [ ] All measurements write machine-readable JSON evidence; screenshots alone are
  not performance proof.

Exit: the browser proves the complete radio-loss, persistence, replay, realtime,
and recovery story through visible operator workflows.

## Phase 5 — Sequin decision gate and optional pilot

Sequin is optional. Complete Phases 0–4 with the current durable event relay first
unless the current relay cannot meet the acceptance thresholds.

### Adopt Sequin only when one condition is measured

- [ ] More than three independently deployed consumers require the same committed
  changes.
- [ ] Writers outside the Next.js command layer must be captured reliably.
- [ ] Relay backlog or recovery repeatedly violates the Phase 4 latency target.
- [ ] Backfill/replay/consumer observability costs more to maintain than operating
  Sequin.
- [ ] Search, cache, integration, or analytics fan-out needs independent consumer
  offsets.

### Sequin pilot contract

- [ ] Use a dedicated Neon replication role, curated publication, unpooled direct
  connection, named slot, TLS, and least-privilege table grants.
- [ ] Include only the domain-event table in the first publication. Do not publish
  every operational table.
- [ ] Route Sequin to a server-side consumer that validates the versioned domain
  event schema and organization before publishing to Ably.
- [ ] Preserve `eventId` as the downstream idempotency key.
- [ ] Configure per-aggregate grouping, indefinite retry during the pilot, bounded
  internal-buffer alarms, and `pause_on_full` rather than data shedding.
- [ ] Run the custom relay and Sequin in shadow comparison mode, but allow only one
  of them to publish to Ably.
- [ ] Compare event count, event IDs, per-aggregate order, payload hash, and delivery
  lag for seven consecutive production-like days.
- [ ] Exercise slot lag, Sequin restart, webhook outage, poison event, backfill, and
  consumer restart in a non-production Neon branch.
- [ ] Document Neon's logical-replication effect on scale-to-zero, slot health,
  heartbeat policy, WAL retention, branch lifecycle, and monthly cost.
- [ ] Promote Sequin only after zero unexplained differences and after the complete
  Phase 4 browser suite passes with Sequin as the sole publisher.

### Sequin rollback

- [ ] Keep the custom relay deployable until the canary window closes.
- [ ] Stop Sequin publication, verify the last acknowledged cursor, start the custom
  relay from that boundary, and run catch-up comparison before restoring traffic.
- [ ] Remove a replication slot only after confirming no consumer depends on it and
  retained WAL is healthy.

Exit: Sequin is selected by evidence and can be removed without losing event
continuity.

## Phase 6 — Electric/PGlite read-cache decision gate

Electric/PGlite is not part of the baseline write implementation.

- [ ] Instrument which mobile reads fail during real warehouse outages and how much
  data each workflow needs after a cold start.
- [ ] Continue with Workbox/API cache when workers only need recently visited pages
  and the Phase 4 offline-read tests pass.
- [ ] Start a PGlite pilot only when a workflow needs relational queries across
  multiple datasets after a cold offline start.
- [ ] Limit the pilot to product/barcode identity, locations, reason codes, assigned
  work, and the active session projection.
- [ ] Keep writes in the command outbox. Do not write operational truth into synced
  PGlite tables expecting automatic upstream replication.
- [ ] Measure WASM download, cold initialization, memory, mobile CPU, storage quota,
  schema migration, Safari eviction, logout purge, and organization switching.
- [ ] Require the full Phase 4 suite plus a cold-start-offline browser scenario
  before production use.
- [ ] Reject the pilot if median cold start regresses by more than 500 ms, storage
  cannot be bounded per organization, or eviction cannot be detected honestly.

Exit: PGlite is adopted only for a demonstrated offline relational-read need.

## Phase 7 — analytics and model-training decision gate

- [ ] Keep current Neon materialized views and hourly/daily rollups while report
  latency, refresh load, and retention remain within budget.
- [ ] Define training datasets as immutable, versioned exports with event cursor
  range, schema version, feature code revision, organization scope, PII policy,
  and checksum. Live CDC alone is not a reproducible training dataset.
- [ ] Prefer periodic Parquet export to controlled object storage plus DuckDB or
  Polars for local RTX training before introducing a continuously running OLAP
  database.
- [ ] Adopt ClickHouse only when measured Neon report load, row volume, retention,
  or interactive aggregate latency crosses a documented threshold.
- [ ] If ClickHouse is selected, prefer ClickHouse Cloud's Postgres ClickPipe powered
  by PeerDB unless self-hosting cost and licensing review justify PeerDB directly.
- [ ] Use Artie only when the selected destinations extend materially beyond
  ClickHouse and managed multi-destination CDC is worth its ELv2/commercial terms.
- [ ] Keep analytics replication entirely out of the browser command/reconnect path.

Exit: the analytical plane is introduced for measured OLAP/training requirements,
not as a substitute for operational correctness.

## CI and verification commands

The implementation is not complete until every applicable command succeeds:

```bash
pnpm run test:resilient-sync:unit
pnpm run test:resilient-sync:api
PW_BASE_URL=http://localhost:3050 pnpm exec playwright test tests/e2e/resilient-sync.spec.ts --project=mobile
PW_BASE_URL=http://localhost:3050 pnpm exec playwright test tests/e2e/resilient-sync-live.spec.ts --project=qa-desktop
pnpm run eval:cohort resilient-sync
pnpm verify:fast
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```

Cross-cutting shared infrastructure changes require the full eval command instead
of `--fast` before final rollout.

## Evidence ledger requirements

Each phase entry in `docs/eval/cohorts/resilient-sync/LEDGER.md` must record:

- [ ] Commit SHA and migration version.
- [ ] Browser/project name and exact `http://localhost:3050` origin.
- [ ] QA organization fixture run ID.
- [ ] Commands run with exit codes.
- [ ] Unit/API/E2E pass counts and skipped-test count.
- [ ] Trace/video/screenshot paths for failures and final browser flows.
- [ ] Command IDs and event cursor range used for server-effect verification.
- [ ] Duplicate, lost, rejected, and dead-letter counts.
- [ ] Enqueue, replay, catch-up, and event-to-paint p50/p95/p99 metrics.
- [ ] Relay or Sequin backlog age and delivery comparison when applicable.
- [ ] Cleanup result proving the QA fixture left no authored operational rows.

Any critical browser test skipped for missing auth, unavailable QA fixtures, or a
down relay means the phase is blocked, not passed.

## Production rollout

### Stage A — dark foundation

- [ ] Deploy schema, event writes, metrics, and catch-up API without changing client
  behavior.
- [ ] Compare domain events against existing business writes for seven days.
- [ ] Stop if any tenantless event, aggregate-version gap, or unexplained missing
  event appears.

### Stage B — employee canary

- [ ] Enable the new browser queue for one internal organization and one reversible
  command type: bin put/take.
- [ ] Keep broad reconnect invalidation as fallback.
- [ ] Review queue age, conflicts, duplicate defenses, and operator recovery daily.

### Stage C — warehouse canary

- [ ] Enable for a named device cohort during staffed hours.
- [ ] Run planned Wi-Fi loss, captive-portal, reload, and two-device drills.
- [ ] Require zero lost or duplicate effects through at least 1,000 canary commands.

### Stage D — reconnect cursor

- [ ] Enable cursor catch-up while retaining broad snapshot fallback.
- [ ] Require zero version regressions and less than 1% snapshot fallback for
  retained cursors over seven days.

### Stage E — command expansion

- [ ] Add one command family at a time using the conflict matrix and its own browser
  proof.
- [ ] Irreversible transitions remain last and require a reviewed rollback or
  compensating action.

## Rollback and incident rules

- [ ] A feature flag can disable new offline enqueue per command type while leaving
  queue inspection and already-persisted recovery available.
- [ ] Disabling enqueue must not delete pending commands.
- [ ] A relay flag can return clients to broad invalidation without discarding the
  durable event log.
- [ ] Schema rollback is forward-fix by default; never drop the event or command
  evidence needed to reconcile accepted warehouse work.
- [ ] If duplicate effects appear, pause the affected command type, retain queue and
  event records, identify the command IDs, and reconcile through the authoritative
  ledger before resuming.
- [ ] If tenant leakage is suspected, stop event delivery immediately, preserve
  evidence, revoke affected realtime credentials, and treat the incident as a
  security event.
- [ ] If queue persistence fails on a device, the UI must block offline acceptance
  and direct the operator to reconnect or change device; it must not promise later
  sync.

## Final completion checklist

- [ ] Every Definition of Done item is checked with linked evidence.
- [ ] E2E-01 through E2E-15 pass at `http://localhost:3050`.
- [ ] No critical test is skipped.
- [ ] The event/outbox contracts are tenant-scoped and machine-guarded.
- [ ] The UI shows pending, retry, conflict, rejection, and settled states honestly.
- [ ] The server proves one effect per command under ambiguous delivery.
- [ ] Reconnect catches up by cursor without reload and falls back safely when
  required.
- [ ] The seven-day canary meets loss, duplication, fallback, and latency targets.
- [ ] Sequin, PGlite, and analytical CDC decisions are recorded as adopted or
  deferred with measurements.
- [ ] `pnpm verify:fast` and the required eval command pass.

