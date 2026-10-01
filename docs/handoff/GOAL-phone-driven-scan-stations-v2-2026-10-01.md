# Goal — Phone-driven Scan Stations V2 live feed

Pin this. Do not repair the current right rail and do not build another desktop station workflow. Implement the additive V2 below, prove it beside the existing Scan Stations, then remove the legacy desktop stations only after every retirement gate is green.
> **Owner amendment — 2026-10-01:** the final product is now the authenticated
> staff member's personal history, not an all-staff wall. The original
> cross-staff contract below remains intact as the historical contract audited
> by the checkpoint; the dated personal-history amendment near the end
> supersedes it for subsequent frontend work.

## High-level goal

Replace the legacy desktop Scan Stations with an observe-only `/stations/live` workspace that shows a durable, realtime, cross-staff feed of station work performed from phones.

A feed row answers, without opening another surface:

- Who performed the action.
- What job they performed.
- What record or physical object they acted on.
- What identifier they scanned.
- What the committed outcome was.
- Exactly when it happened.
- Where to open the canonical record for more context.

Mobile remains the execution surface. The desktop feed observes, filters, and opens records; it does not repeat Pick, Pack, Unbox, Quality Control, or Scan out controls.

This is the already-recorded product direction:

- `docs/refactors/sidebar/FRONTEND-HANDOFF.md`: physical station work moves to `/m/*`; desktop later becomes a live feed of mobile work.
- `docs/refactors/sidebar/BACKEND-RESULTS.md`: the long-term station home is mobile plus a desktop live feed.
- `docs/mobile-first/SURFACE_LAW.md`: desktop consumes the mobile job tree and must not invent a second workflow.

## Wrong today

The existing phone-history/right-edge path is not a floor feed:

- `getScanLogChannelName(orgId, staffId)` creates the private `scanlog:{staffId}` channel.
- `PhoneHistoryPopover` subscribes only to the signed-in staff member's scanlog.
- `GET /api/scan/history` currently filters to `ctx.staffId` and receiving routes `/m/r/*`, `/m/l/*`, and `/m/u/*`.
- `publishScanLog` is emitted only by selected `/api/scan/resolve` branches, not every mobile station commit.
- `usePhoneScanBridge` resolves phone tracking for the current staff member and intentionally does nothing with `phone_scan_result` outside the receiving UI.
- `mobile-session-feed.ts` and the mobile station tape are browser/session-local state. Another device cannot read them.
- The Operations live card is cross-staff, but its dashboard event shape is too thin for the exact entity context this surface requires.

Do not widen the private scanlog grant, subscribe a desktop to every staff member's private channel, or sync `sessionStorage` to the server. Those would preserve the wrong ownership boundary.

## Product boundary

### Mobile owns

- Camera and wedge capture.
- Scan resolution.
- Pick, Pack, Unbox, Quality Control, Scan out, and later station commits.
- Immediate success/reject feedback.
- Retry and exception-resolution actions.
- The job's canonical step machine.

### Desktop V2 owns

- The most recent durable cross-staff activity.
- Staff, job, outcome, and time filters.
- Honest realtime/reconnecting/stale status.
- Record context and canonical deep links.
- Read-only monitoring and triage.

### Desktop V2 never owns

- A duplicate scanner.
- A duplicate commit button.
- A second step machine.
- A right-rail record or station queue.
- A browser-only event that disappears on refresh.

## Target route and navigation

Canonical route:

```text
/stations/live
```

Proposed page registration during coexistence:

| Field | Value |
|---|---|
| id | `stations-live` |
| label | `Live feed V2` during coexistence; `Live feed` at cutover |
| href | `/stations/live` |
| kind | `station` |
| stationGroup | `floor` |
| requires | `operations.view` |
| railless | `true` |

Register it in both `APP_SIDEBAR_NAV` and `SIDEBAR_PAGE_NAV`, add its icon/tone coverage, and include it in the Scan Stations contextual mode list. The route is a cross-staff monitor, so its first-cut permission is the existing `operations.view`; do not expose all staff activity through a normal per-station permission.

Rollout order:

1. Add `Live feed V2` as an explicit Scan Stations mode without changing the Scan Stations landing target.
2. Run it beside Arrival, Unbox, Quality Control, Picker, Packing, and Scan out.
3. After the retirement gates pass, rename it `Live feed` and make the Scan Stations door land on `/stations/live`.
4. Remove the old station modes and routes in the same cutover. The parent remains `Scan Stations`; its one desktop child is `Live feed`, so the parent/child name law stays valid.

Do not register this surface with `RightRailHost`, `DetailStackRailRegistrar`, `StationDisplaysPushStack`, or any route-owned right-edge display.

## Durable data roots

V2 normalizes two existing persisted sources. Neither browser state nor an Ably payload is the source of truth.

### 1. Committed station work — `station_activity_logs`

This is the primary spine for committed station work. It already carries:

- `organization_id`
- `station`
- `activity_type`
- `staff_id`
- `shipment_id`
- `scan_ref`
- `fnsku`
- entity references
- `notes`
- `metadata`
- `created_at`

`publishActivityLogged` already broadcasts server-written SAL events on the organization station channel as `activity.logged`. The existing `/api/dashboard/operations` query proves the cross-staff snapshot pattern by joining SAL to `staff` and ordering by `created_at DESC`.

Phone-origin commit writers stamp `origin`, `surface`,
`mobile_scan_event_id`, and a stable `client_event_id` into metadata where those
fields are available.

`staff_id` comes from the authenticated server context or the domain's verified actor. Never trust a client-supplied staff identity.

### 2. Resolver-only phone scans — `mobile_scan_events`

Use this only when a phone scan identifies/routes to something but has not produced a committed SAL action. The resolver already persists:

- `organization_id`
- `staff_id`
- `raw_value`
- `normalized`
- `kind`
- `carrier`
- `matched_order_id`
- `match_outcome`
- `routed_to`
- `parsed_ais`
- `device_info`
- `created_at`

The existing history route's comment claiming this table lacks `organization_id` is stale; `/api/scan/resolve` explicitly inserts it. The V2 query must lead with `organization_id` and may keep the staff organization join as defense in depth.

`logScanEvent` returns the inserted `mobile_scan_events.id`, includes it in the
resolver response, and passes it into the eventual mobile domain commit. The
committed SAL writer stores it in `metadata.mobile_scan_event_id`.

Projection rule:

- A resolver event with no linked committed SAL row paints as `Identified`.
- Once SAL metadata references its `mobile_scan_event_id`, the standalone
  identification row is suppressed and the committed row is shown.
- Never correlate by barcode plus timestamp. That is a heuristic and can merge two real scans.

### Source identities and ordering

Namespaced row IDs:

```text
sal:<station_activity_logs.id>
mse:<mobile_scan_events.id>
```

Canonical order:

```text
occurredAt DESC, source rank, numeric source id DESC
```

For both sources, `occurredAt = created_at`. The UI never substitutes the browser receipt time.

## Feed contract

Create a server-owned contract under `src/lib/station-feed/`. The API, RSC seed, React Query cache, and realtime merge all consume this one shape.

```ts
export type StationFeedJob =
  | 'identify'
  | 'arrival'
  | 'unbox'
  | 'pick'
  | 'quality_control'
  | 'pack'
  | 'scan_out';

export type StationFeedOutcome =
  | 'identified'
  | 'committed'
  | 'needs_attention';

export interface StationLiveFeedItem {
  id: `sal:${number}` | `mse:${number}`;
  source: 'station_activity' | 'mobile_scan';
  sourceId: number;
  occurredAt: string;

  actor: {
    staffId: number;
    name: string;
    avatarPhotoId: number | null;
  };

  job: StationFeedJob;
  outcome: StationFeedOutcome;
  verb: string;

  context: {
    origin: 'phone';
    surface: string | null;
    station: string | null;
    workflowNodeId: string | null;
  };

  subject: {
    entityType: string;
    entityId: string | null;
    title: string | null;
    identifier: string | null;
    imageUrl: string | null;
    status: string | null;
    href: string | null;
  };

  message: string | null;
}
```

Rules:

- The server maps storage rows into this contract. Components do not interpret SAL activity codes or arbitrary JSON.
- `src/lib/station-feed/event-map.ts` is the one mapping from `(station, activity_type)` and mobile scan `kind/match_outcome` to `job`, `outcome`, `verb`, and subject resolver.
- The mapping must cover every type in `src/lib/station-activity.ts` that is eligible for the feed.
- An unknown event is omitted and counted in diagnostics; it is never painted with guessed copy.
- Product identity resolves through CycleForge's canonical catalog helpers, including `resolveSkuIdentityTitle` and `SKU_CATALOG_JOIN_ON_SQL` where applicable.
- Record links use existing route builders. The feed does not invent a parallel record page.
- `StationTapeEntry` may be used as a presentation adapter because it already has title, identifier, actor, image, tone, message, and time. It is not the API contract and its session-local `live` field is not persisted truth.

## Snapshot API

Add an authenticated endpoint:

```text
GET /api/stations/live
```

Permission:

```text
operations.view
```

Supported params:

| Param | Meaning |
|---|---|
| `limit` | 1–100; default 40 |
| `before` | Opaque older-page cursor containing time, source, and ID |
| `afterSalId` | Catch up committed SAL rows after this high-water mark |
| `afterMobileScanId` | Catch up resolver rows after this high-water mark |
| `staff` | One or more staff IDs |
| `job` | One or more `StationFeedJob` values |
| `outcome` | One or more `StationFeedOutcome` values |
| `from` / `to` | Exact warehouse-time interval |

Response:

```ts
interface StationLiveFeedResponse {
  items: StationLiveFeedItem[];
  watermark: {
    stationActivityId: number;
    mobileScanEventId: number;
  };
  nextBefore: string | null;
}
```

Query rules:

- Both source arms require the authenticated organization before any optional filter.
- Staff joins include organization equality.
- Initial snapshot reads newest rows first and caps each source before normalization; it does not scan all history in JavaScript.
- Staff/job/outcome/time predicates apply server-side.
- The initial page and facet/count query use the same predicate builder.
- Measure with `EXPLAIN (ANALYZE, BUFFERS)` before adding an index.
- Both ledgers need organization-led time and correlation access paths. Index changes remain separately approved and must have before/after query-plan evidence.

## Realtime contract

Use the existing organization station channel returned by `getStationChannelName(orgId)`. Do not create or widen a cross-staff `scanlog:*` grant.

### Committed SAL events

Existing event:

```text
channel: org:{orgId}:station:changes
event: activity.logged
payload includes: id, station, activityType, staffId, scanRef, fnsku, source, timestamp
```

Treat this message as a wake-up. Fetch after the current SAL watermark and merge the server-normalized rows. Do not construct a final feed row from the thin Ably payload.


### Resolver-only mobile scans

After `mobile_scan_events` commits, publish a new server-only invalidation on the same organization station channel:

```text
event: mobile.scan.logged
payload: { id: mobileScanEventId }
```

Keep the existing per-staff `scan_logged` event for current private Phone History behavior during coexistence. V2 does not subscribe to it.

### Recovery

The client must:

1. Start from an RSC-dehydrated first page.
2. Subscribe once to the organization station channel.
3. On either invalidation, fetch after both current watermarks.
4. Merge by namespaced durable ID.
5. Re-run catch-up when Ably reconnects.
6. Reconcile every 30 seconds while the page is visible.
7. Refetch on window focus only when the last successful sync is older than 30 seconds.
8. Keep the last durable rows visible during reconnects and errors.

Use the existing `useRealtimeLink()` / connection-store model. Never paint a hardcoded `Live` state.

## Surface

The surface is a central, full-height ledger. It is not a right rail, sidebar queue, card dashboard, or wall of one fixed column per staff member.

### Header

Show:

- `Live feed`
- Current visible-row count.
- `Live`, `Reconnecting`, or `Last synced <time>`.
- No action buttons in the first release.

### Staff activity summary

A compact summary may show each staff member represented in the current window:

- `StaffAvatar`
- Name
- Latest job
- Age of latest durable event

The label is `Last activity`, never `Online`; event recency is not presence. Filtering remains in the contextual sidebar rather than becoming a second body filter system.

### Feed row

Every row paints:

```text
[staff avatar] Staff name · committed Pack                         10:42:17 AM
               Product title
               Order / tracking / serial · station or workflow context
               Current status or server message                         Open →
```

Required row facts:

- Actor name and avatar.
- Exact warehouse-local time, with full date available on hover/focus.
- Job and outcome.
- Product/entity title when resolvable.
- Full operational identifier; do not tail-truncate tracking as the only visible value.
- Current status or durable needs-attention message.
- Canonical record deep link when one exists.

Relative time may supplement the exact time; it never replaces it.

Rows are read-only. Selecting a row opens the canonical record plane or route. V2 does not add inline mutation controls.

### Filters

Declare these through the existing contextual navigation contract, not private component state:

1. Staff.
2. Job.
3. Outcome.
4. Time range.
5. Sort: newest first or oldest first.

The URL is the filter source of truth. Refreshing or sharing the URL preserves the view.

### Loading and degraded states

- Initial load: RSC seed paints durable rows. A page-level spinner is a regression.
- Empty: `No phone station activity in this period.`
- Realtime reconnecting: keep rows and show `Reconnecting`.
- Snapshot failure with no cache: paint the shared degraded box with Retry.
- Snapshot failure with cached rows: keep rows, show `Last synced`, and expose Retry.
- New rows prepend without moving keyboard focus or collapsing an opened row.

## Expected implementation files

New homes:

| File | Responsibility |
|---|---|
| `src/app/stations/live/page.tsx` | Permission-aware RSC entry and initial feed seed |
| `src/app/api/stations/live/route.ts` | Cross-staff snapshot, catch-up, filters, and pagination |
| `src/lib/station-feed/types.ts` | Wire contract and closed job/outcome vocabularies |
| `src/lib/station-feed/event-map.ts` | Pure persisted-event → feed-item classification |
| `src/lib/station-feed/query.server.ts` | Tenant-scoped SAL/mobile-scan projection |
| `src/lib/station-feed/cursor.ts` | Opaque stable older-page cursor |
| `src/lib/queries/station-live-feed.ts` | Query keys, fetcher, and infinite-page merge |
| `src/hooks/useStationLiveFeed.ts` | Org-channel subscriptions, watermark catch-up, and reconciliation |
| `src/components/stations/live/StationLiveFeed.tsx` | Central observe-only workspace |
| `src/components/stations/live/StationLiveFeedRow.tsx` | One accessible, exact-context event row |

Existing seams to extend:

| File | Required change |
|---|---|
| `src/lib/sidebar-navigation.ts` | Additive V2 registration, Scan Stations ordering, icons/tones, and final cutover |
| `src/lib/nav/context/pages.ts` | URL-backed staff/job/outcome/time/sort controls |
| `src/lib/nav/context/rollout.ts` and `parity.ts` | Contextual rollout and machine-checked parity |
| `src/app/api/scan/resolve/route.ts` | Return `mobileScanEventId` and publish the org invalidation after persistence |
| `src/lib/realtime/publish.ts` | Server-only `mobile.scan.logged` invalidation; keep private scanlog behavior |
| Mobile domain commit routes | Stamp verified actor, phone origin, surface, entity reference, and correlation metadata on SAL |

Do not create a generic `components/live-feed` abstraction in advance. Promote shared UI only after another real surface consumes the same row grammar.

## Implementation sequence

### Phase 1 — contract and read model

Add the pure event map, feed contract, source query, cursor codec, and tests. Build the API before the page. Prove organization scope and deterministic ordering.

### Phase 2 — first vertical slice

Make one phone Arrival/Unbox path carry `mobileScanEventId` into its successful SAL metadata. The full proof is:

```text
/m/scan decode
  → mobile_scan_events row
  → successful Arrival/Unbox commit
  → SAL row with origin=phone + mobile_scan_event_id
  → existing activity.logged invalidation
  → /stations/live catch-up
  → one committed row under the correct staff
  → reload/reconnect preserves the same one row
```

Do not expand to every station until this works end to end.

### Phase 3 — V2 surface

Build `/stations/live`, its RSC seed, React Query cache, central ledger, filters, connection status, and pagination. Add `Live feed V2` to Scan Stations without changing the landing target.

### Phase 4 — mobile producer coverage

Port one job at a time:

1. Arrival.
2. Unbox.
3. Picker.
4. Quality Control.
5. Packing.
6. Scan out.
7. Any remaining registered Scan Stations job.

For each job, update the mobile commit endpoint—not the React component—to stamp origin, actor, stable entity reference, and correlation metadata.

### Phase 5 — dual-run proof

Run V2 beside legacy Scan Stations. Record event coverage, duplicate suppression, commit-to-paint latency, reconnect catch-up, and unknown-event counts. Do not use the old rail as an oracle; compare against persisted SAL/mobile scan rows and the domain record.

### Phase 6 — cutover and deletion

After every definition-of-done item passes:

1. Make the Scan Stations door land on `/stations/live`.
2. Rename the mode from `Live feed V2` to `Live feed`.
3. Remove Arrival, Unbox, Quality Control, Picker, Packing, and Scan out from the desktop Scan Stations mode list.
4. Remove their obsolete desktop-only route surfaces, station columns, display/right-rail registrations, and route-specific recent rails.
5. Preserve the `/m/*` jobs and shared domain/API code.
6. Remove obsolete navigation tests and replace them with the one-parent/one-live-feed contract.
7. Do not leave aliases, deprecated wrappers, hidden legacy modes, or parallel event writers.

## Mobile parity matrix

This matrix is a release gate. A row is green only when the mobile job is complete and its durable desktop event is correct.

| Job | Mobile route | Success commits domain state | SAL activity | Correct actor | Exact subject context | V2 live row | Reload/reconnect | Legacy desktop has no unique verb |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Arrival | `/m/scan` |  |  |  |  |  |  |  |
| Unbox | `/m/scan`, `/m/r/[id]` |  |  |  |  |  |  |  |
| Picker | `/m/pick`, `/m/pick/[orderId]` |  |  |  |  |  |  |  |
| Quality Control | `/m/qc`, `/m/qc/line/[id]`, `/m/u/[id]/qc` |  |  |  |  |  |  |  |
| Packing | `/m/pack`, `/m/pack/start/[orderId]` |  |  |  |  |  |  |  |
| Scan out | `/m/id/scan-out/[orderId]` |  |  |  |  |  |  |  |

Blank cells are unfinished work, not assumed parity.

## Out of scope

- Repairing the current right rail.
- Restyling legacy desktop station pages before deleting them.
- Adding desktop commit actions to the feed.
- Widening `scanlog:{staffId}` to cross-staff access.
- Reading another device's session storage.
- Treating camera decode as successful domain work.
- Replacing canonical entity pages.
- Changing Pick, Pack, Unbox, QC, or Scan out business rules.
- Removing any desktop station before its mobile parity row is green.
- Database migrations not justified by an observed query plan.

## Exact definition of done

This is the full future-state definition of done. The dated implementation
checkpoint below records the narrower approved backend slice and does not claim
the cutover, parity, production-trial, or UI gates are complete.

### Data correctness

1. `/stations/live` returns only the authenticated organization and requires `operations.view`.
2. Every visible row has a durable `sal:<id>` or `mse:<id>` identity and survives refresh.
3. Every committed row's actor is the verified `staff_id`; no client-provided staff ID can impersonate another staff member.
4. Event order is deterministic by actual persisted event time and source ID.
5. A resolver-only scan paints `Identified`; it never paints as committed work.
6. When committed SAL metadata references `mobile_scan_event_id`, its standalone identification row is suppressed without barcode/time heuristics.
7. Unknown event types are counted in diagnostics and omitted rather than shown with guessed copy.
8. Product title, SKU, and photo follow the canonical catalog identity helpers.
9. Every record link opens the existing canonical record.

### Realtime behavior

10. A committed phone action appears on an already-open desktop feed without manual refresh.
11. Commit-to-paint latency is p95 under 2 seconds on warehouse Wi-Fi during the production trial.
12. One domain action produces one final feed row; duplicate Ably deliveries do not duplicate it.
13. Closing/reopening the page, changing tabs, or refreshing does not lose rows.
14. Disconnecting Ably, committing work, and reconnecting catches up all missed events in order.
15. A missed realtime invalidation is recovered by reconciliation within 30 seconds.
16. The connection label comes from `useRealtimeLink()` and never claims `Live` while degraded.
17. The page opens one organization station-channel subscription, not one subscription per staff member.

### Surface behavior

18. Initial HTML contains the newest durable rows; it does not wait for a client list waterfall.
19. Each row shows actor, exact time, job, outcome, title/context, full identifier, and canonical destination when those facts exist.
20. Staff, job, outcome, time, and sort filters live in URL-backed contextual controls and narrow the server query.
21. Empty, reconnecting, stale-cache, and hard snapshot failure states are distinct and honest.
22. New rows prepend without stealing focus, scrolling the operator away, or closing an opened disclosure.
23. The feed mounts in the central workspace and registers nothing with the right rail.
24. The first release is observe-only: no feed row mutates a domain record.

### Request shape and performance

25. Initial navigation makes one feed snapshot request or uses the RSC seed; it never makes one request per staff member.
26. Realtime messages trigger cursor catch-up, not a blind full-history refetch.
27. The first page is capped at 40 rows; older history loads explicitly.
28. Query plans lead with organization and time/source cursors. Any proposed index has before/after `EXPLAIN (ANALYZE, BUFFERS)` evidence and is applied only with separate approval.
29. A production-build request-shape artifact and desktop Lighthouse baseline exist for `/stations/live` before cutover.
30. The route meets a Lighthouse Performance score of at least 90 on the repository's desktop profile, with real seeded rows.

### Mobile parity and cutover

31. Every row in the mobile parity matrix is green.
32. Every legacy desktop station verb has a working `/m/*` equivalent.
33. A full production validation period records no missing committed events, no cross-staff misattribution, and no duplicate final rows.
34. Scan Stations lands on `/stations/live` only after items 1–33 pass.
35. The old desktop station modes, routes, rails, displays, and obsolete nav/test contracts are deleted in the cutover; mobile jobs and shared domain APIs remain.
36. No compatibility wrapper, hidden legacy mode, stale right-rail registration, or second feed query remains.

### Verification

37. Contract tests cover event mapping, unknown types, namespaced IDs, deterministic ordering, and identification-to-commit suppression.
38. API tests cover organization isolation, permission failure, staff filters, time filters, both cursor directions, and source watermarks.
39. Realtime tests cover duplicate messages, missed-message catch-up, reconnect, and source-watermark merge.
40. A real authenticated smoke at `http://localhost:3050` proves a phone action appears on `/stations/live`, survives refresh, and opens the correct record.
41. Focused lint/type/tests pass for changed files.
42. `pnpm verify:fast` is run before completion. Unrelated concurrent failures are reported with exact files and are not repaired as part of this goal.

## Architecture amendment — 2026-10-01

Status: approved for the backend slice. This amendment changes only the
two-source storage, identity, watermark, suppression, and realtime clauses
above; it does not mark the full future-state definition of done complete.

Decision record:

- The station-workflow unification directive freezes
  `createStationActivityLog` for **new writer sites** and requires new domain
  events to use `recordOpsEvent`.
- Existing SAL call sites remain untouched. Migrating the existing SAL estate
  into `ops_events` is an explicit non-goal without a dedicated migration plan.
- Arrival and Unbox already had canonical `ops_events` writers. Mirroring those
  commits into SAL would create a second event fact, so this slice projects
  those ops events directly.

Amended feed contract:

- The durable read model has three arms: `station_activity_logs`, `ops_events`,
  and `mobile_scan_events`.
- The added identity is `ops:<ops_events.id>` and its persisted time is
  `occurred_at`.
- The API adds `afterOpsEventId`; the watermark adds `opsEventId`.
- A resolver row is suppressed when either SAL metadata or an ops-event payload
  references its exact `mobile_scan_event_id`.
- `ops.event.logged` is a wake-up on the existing organization station channel;
  catch-up reads all three durable watermarks.

Producer-coverage boundary:

- Arrival and Unbox are the only newly integrated committed producers in this
  backend slice.
- Existing eligible SAL writers remain readable; the audit found no migration
  of those writers and no new use of the frozen SAL writer API.
- QC checklist results, SKU pulls, and mobile picks remain durable in their
  existing audit, stock-ledger, and inventory-event stores, but those stores
  are not source arms of this feed.
- End-to-end feed producer parity for Picker, Quality Control, Packing, and Scan
  out remains open. Existing eligible SAL rows may appear, but this checkpoint
  does not claim every phone path emits one.
- The audit traced the real phone commit paths rather than assumed route names:
  mobile pick commands reach the picking session domain, QC posts to
  `/api/serial-units/:id/checklist`, Packing commits through
  `/api/packing-logs/update`, and Scan out posts to `/api/shipped/scan-out`.

## Implementation checkpoint — 2026-10-01

The approved backend slice now exists additively; the legacy Scan Stations
landing and station routes remain in place.

- `GET /api/stations/live` requires `operations.view`, scopes every statement by
  the authenticated organization, and projects deterministic `sal:<id>`,
  `ops:<id>`, and `mse:<id>` rows with URL filters, keyset pagination, and three
  source watermarks.
- Resolver intent writes return `mobileScanEventId` and publish
  `mobile.scan.logged` on the organization station channel.
- Arrival and Unbox reuse their existing unified `ops_events` writers. Phone
  writes add trusted origin, surface, server actor, subject context, and exact
  resolver correlation; no new SAL writer calls were introduced.
- Existing eligible phone SAL rows remain readable. This is not a claim of
  complete phone-producer coverage: Picker, Quality Control, Packing, and Scan
  out parity remains open as recorded in the amendment.
- A correlated resolver row is suppressed by exact
  `metadata.mobile_scan_event_id` or `payload.mobile_scan_event_id`; no barcode
  or timing heuristic is used.
- Committed ops events publish `ops.event.logged`, distinct from the
  SAL-specific `activity.logged` contract. Both are wake-ups; reconnect,
  focus, and 30-second reconciliation read durable rows by source watermark.
- `2026-09-30_station_live_feed_indexes.sql` supplies tenant/time and exact
  correlation indexes for all three ledgers. It was applied under the owner's
  explicit migration authorization; the required before/after query-plan
  artifact was not captured and remains an open evidence gate.

Observed backend evidence:

- Focused station-feed, ops-writer, API, scan-out, and picker contracts:
  38 passed, 0 failed.
- A transaction-scoped real-database smoke inserted one resolver row and one
  correlated `UNBOX_CONFIRMED` ops event, projected only `ops:31463`, advanced
  all three watermarks, and rolled the transaction back.
- The existing unauthenticated API path compiled and returned the expected
  `401`.
- The mobile-to-desktop component boundary was removed by moving shared
  outbound route constants to `src/lib/outbound/route-contract.ts`.
- Navigation contracts: 38 passed, 0 failed.
- `pnpm verify:fast` passed all 11 gates, including lint, typecheck, tenancy,
  boundary, navigation-name, SKU-identity, layer-law, and OpenAPI checks.
- The route-permission snapshot now includes `/api/stations/live` as a
  `withAuth` `GET` guarded by `operations.view`; `pnpm audit-route-auth`
  passed with 0 ungated reads and 0 ungated writes.
- The full `pnpm verify` profile was attempted and the in-scope
  route-permission snapshot failure was repaired. A subsequent
  `pnpm verify:fast` passed lint and typecheck, so the older
  `src/lib/nav/locate/inbound.ts` parse failure is not current. Current targeted
  reruns still show unrelated concurrent UI failures:
  `src/components/sidebar/contextual/nav-view-icons.test.ts` reports the five
  missing `fulfilled.*` glyphs;
  `src/app/kiosk/kiosk-counter-surface.test.ts` reports `ops chip` as
  `rounded` instead of `rounded-none`; and all seven
  `src/components/mobile/redesign/mobile-action-slot.test.ts` cases currently
  fail because `MobileV2AppSwitcher` mounts `useQuery` without a
  `QueryClientProvider` in the test host. Those unrelated UI/navigation changes
  were not repaired here.

Approved-slice boundary:

- Full mobile parity, production validation, legacy cutover, Lighthouse, and
  production-build request-shape artifacts were not part of this backend slice.
- The checkpoint does not claim end-to-end feed producer parity for Picker,
  Quality Control, Packing, or Scan out.
- The station-feed indexes are applied. Gate 28 remains open because no
  before/after `EXPLAIN (ANALYZE, BUFFERS)` artifact was captured.
- The append-only guard is attached to `mobile_scan_events`, but its
  receiving-specific cleanup branch references `OLD.tracking_number`; deleting
  mobile scan evidence can therefore raise
  `record "old" has no field "tracking_number"`. Smoke row `mse:18444` remains
  immutable and is suppressed by correction event `ops:31464`; the temporary
  SAL tombstone was deleted.

## Full-goal audit — 2026-10-01

Status vocabulary: **Verified** has direct current test or runtime evidence;
**Implemented** is present in current code but still lacks the named
end-to-end proof; **Partial** is incomplete; **Open** has not been delivered.

| Gate | Status | Current evidence or gap |
|---:|---|---|
| 1 | Implemented | The route requires `operations.view`; every query arm is organization-scoped. Only the unauthenticated `401` path has route-level test coverage. |
| 2 | Verified | The amended contract uses durable `sal:`, `ops:`, and `mse:` identities; mapping and real-DB projection evidence exist. |
| 3 | Partial | Existing projected writers use server actor fields, but Picker/QC producer parity is incomplete. |
| 4 | Verified | Mapping and cursor tests pin persisted time, source rank, and source ID ordering. |
| 5 | Verified | Resolver mapping tests keep identification distinct from committed outcomes. |
| 6 | Verified | Exact-correlation SQL and a transaction-scoped DB smoke prove resolver suppression without a barcode/time heuristic. |
| 7 | Open | Unknown mapped types are omitted, but no durable/countable unknown-event diagnostic exists. |
| 8 | Implemented | Feed joins use catalog-first title/image helpers; not every producer has a runtime identity proof. |
| 9 | Partial | Arrival carton `53570` opened from My history to `/search?sel=receiving:53570` and then `/m/r/53570`. A lined carton, `53550`, still opened its inbound record. Other producer links are not runtime-proven. |
| 10 | Verified | Authenticated browser at `http://localhost:3050` showed phone-origin arrival `ops:31491` on My history after the commit. Scan-out `sal:46958` projected, then the undo removed it. |
| 11 | Open | No warehouse-Wi-Fi production latency cohort exists. |
| 12 | Partial | Namespaced merge deduplication has a unit test; duplicate delivery has no hook/browser proof. |
| 13 | Verified | Reload and a new tab both recovered `1ZCFSYNC2026100118450` on `/stations/live` for the same authenticated session. The undone scan-out stayed gone. |
| 14 | Implemented | Three-watermark reconnect catch-up exists in `useStationLiveFeed`; no reconnect test or authenticated smoke exists. |
| 15 | Implemented | Visible-page reconciliation runs every 30 seconds; no timer test or browser proof exists. |
| 16 | Implemented | The surface reads `useRealtimeLink`; degraded-state visual behavior is not browser-proven. |
| 17 | Implemented | Three event listeners share one organization station-channel name; subscription count is not instrumented in a runtime test. |
| 18 | Implemented | `page.tsx` seeds React Query through an RSC hydration boundary. |
| 19 | Partial | Rows show actor, time, job, outcome, title, identifier, and link, but do not consistently paint station/workflow context or status. |
| 20 | Implemented | Job, outcome, date, and sort stay URL-backed. Personal history ignores a client `staff` param; `staff=999999` still returned only staff 1. |
| 21 | Partial | Empty and hard-failure states exist; reconnecting and cached-stale states collapse into one delayed label. |
| 22 | Partial | Catch-up prepends deduplicated rows without imperative focus changes; scroll/disclosure preservation has no browser proof. |
| 23 | Implemented | The page is central and registered `railless`; no right-rail registrar is used. |
| 24 | Implemented | The feed exposes navigation only and performs no domain mutation. |
| 25 | Implemented | Initial data is RSC-seeded with one union query operation, not per-staff requests. |
| 26 | Implemented | Realtime invalidations use three-watermark cursor catch-up. |
| 27 | Verified | The default page is 40 and older rows load through an explicit keyset cursor. |
| 28 | Open | All five candidate indexes are applied under explicit owner approval, but the required before/after `EXPLAIN (ANALYZE, BUFFERS)` evidence was not captured. |
| 29 | Open | No production-build request-shape artifact exists. |
| 30 | Open | No real-row desktop Lighthouse artifact or score exists. |
| 31 | Open | The mobile parity matrix remains blank. |
| 32 | Open | Every legacy desktop verb has not been matched to a working mobile equivalent. |
| 33 | Open | No full production validation period has run. |
| 34 | Open | The Scan Stations landing has not cut over. |
| 35 | Open | Legacy desktop station modes, routes, rails, displays, and tests remain. |
| 36 | Open | Coexistence intentionally retains parallel legacy surfaces and queries. |
| 37 | Partial | Mapping, IDs, ordering, and correlation have focused tests; explicit unknown-type coverage is missing. |
| 38 | Partial | Query tests cover parsing, tenant binds, cursors, and watermarks; route-level tests cover only unauthenticated refusal. |
| 39 | Open | No dedicated realtime hook test covers duplicate wake-ups, missed-message catch-up, reconnect, and all watermark merges. |
| 40 | Verified | Authenticated `http://localhost:3050` smoke: phone-origin arrival survived refresh, and Open record resolved to the carton. |
| 41 | Verified | Focused backend and navigation test commands passed at the checkpoint. |
| 42 | Verified | `pnpm verify:fast` passed all 11 gates after the search-record change: Lint, Typecheck, Cron contract, Tenancy isolation, Schema drift, Boundary, Nav names, Sku identity, Layer laws, Design tokens, and V1 OpenAPI. |

Producer audit:

- Arrival and Unbox are projected from their canonical `ops_events` rows.
- Packing and Scan out already write eligible phone-origin
  `PACK_COMPLETED`/`SHIP_CONFIRM` SAL rows with trusted actor, correlation, and
  subject metadata; adding ops-event mirrors would create duplicate facts.
- Mobile Picker commits canonical `inventory_events`; the mobile path does not
  write an eligible `PICK_SCANNED` SAL row and `inventory_events` is not a feed
  source.
- Mobile QC commits canonical `tech_verifications` plus best-effort
  `audit_logs`; it does not write an eligible `QC_RESULT_RECORDED` SAL row and
  neither store is a feed source.
- Therefore Picker and QC feed parity are genuinely open. They require a
  separately approved read-model/source amendment, not a second event writer.

## Product direction amendment — personal staff history — 2026-10-01

Status: approved by the owner. This changes the final frontend/product target
without rewriting the historical 42-gate audit above.

- `/stations/live` becomes **My history**: the authenticated staff member's
  durable phone-origin actions, not a default all-staff monitor.
- The server and RSC seed bind the history to the authenticated staff ID. A
  client-supplied staff filter cannot select another person; the staff picker
  leaves the surface.
- The primary grammar is a live vertical timeline. Every circle is one exact
  persisted action, while Arrival, Unbox, Pick, QC, Pack, and Scan out remain
  task categories rather than event copy.
- Deterministically correlated actions resolve into one completion receipt.
  The selected receipt stays centered and sticky on desktop, stays in normal
  flow on phone, and says `Completed on mobile` only when every grouped action
  proves phone origin.
- Compact action/task cards expand for identifiers, source evidence, photos,
  links, and changes. AI may summarize the closed fact set but never owns
  grouping, ordering, completion, or factual content.
- Desktop remains fallback/review: Open record, View photos, Create ticket,
  and Reply to ticket use existing canonical surfaces and ship only with a
  working mobile path. Desktop does not regain station commit controls.
- Motion clarifies realtime insertion, terminal completion, selection, and
  disclosure. Existing house Motion presets/reduced-motion hooks and
  `Collapse` are mandatory; no decorative or perpetual animation.
- The self-contained acknowledgement/build prompt is
  `docs/handoff/HANDOFF-personal-staff-history-timeline-2026-10-01.md`.

The owner also approved applying every pending migration and explicitly
authorized clearing the migration-integrity blocker. The runner target was
confirmed as the worktree `.env` DSN (target fingerprint
`2a61d8e1f2da4bd3`, database `neondb`); `.env.local` and the process
environment did not override `DATABASE_URL`, and `DATABASE_URL_UNPOOLED` is
configured. The libpq SSL message is a compatibility warning, not a failure.

The exact blocker was a post-apply edit to the untracked
`2026-09-30_backfill_stn_org_from_packer_logs.sql` file:

- ledger SHA:
  `d83fecbbe7e07fd5625ec59a8c3e60916c0d737805b9c3ffa30aea3ae332a7bc`;
- current file SHA:
  `5bf920744addb2715dac49123267d2e4cdc809991ae93673c11683113653340e`;
- original `applied_at`: `2026-10-01T03:41:44.042Z`;
- exact applied bytes unavailable because the file was untracked.

One guarded transaction locked that ledger row, required the old hash,
re-executed the current idempotent repair SQL, passed its SQL post-check,
updated only the row's hash to the current file hash, and preserved
`applied_at`. The supported runner then applied both pending files it found:
`2026-09-30_station_live_feed_indexes.sql` and the concurrently added
`2026-10-01_backfill_sep30_forgotten_scan_out.sql`.

Observed final state:

- `pnpm db:migrate:dry` reports
  `up to date — 786 migrations on record, 0 pending`;
- all three ledger hashes match their current files;
- all five station-feed indexes exist with their expected definitions;
- zero NULL-organization tracking rows remain where ownership is
  unambiguously derivable;
- the forgotten-scan-out migration produced its expected two rows.

No before/after `EXPLAIN (ANALYZE, BUFFERS)` artifact was captured before
applying the station indexes. Definition-of-done gate 28 remains open; the
document does not reconstruct or fabricate that historical baseline.

## Current future-state product statement — amended, not completed

The target is phone-owned station execution with one live, durable **personal
staff history** on desktop: exact action circles on a vertical rail,
deterministic task completion receipts, and expandable evidence/fallback
actions. The additive backend still does not cover Picker or Quality Control.
`/stations/live` is personal staff history for the signed-in
staff member. The receipt uses `EventTimeline` and a V2 rounded card that stays in
document flow below the `md` breakpoint and sticky beside the timeline above it.
Legacy station execution surfaces remain until mobile parity, production
validation, and cutover gates pass.

## Arrival and scan-out phone sync — 2026-10-01

Observed, not inferred:

- `GET /api/stations/live?staff=999999` for staff 1 still returned only staff 1.
  The client staff param is ignored. The RSC seed binds the same staff id.
- Authenticated `http://localhost:3050/stations/live` at 390×844 rendered
  `My history`, `40 recent actions`, `Live`, an in-flow receipt, and
  `Load earlier`.
- Historical `receiving.carton.arrived` rows (37) and `SHIP_CONFIRM` rows
  (5272) have no `origin: phone` and no `mobile_scan_event_id`. They stay out
  of the phone feed. That is the old writer, not a projection miss.
- New commits stamp phone origin from a server-trusted anchor: session
  `deviceKind === 'phone'`, a phone user agent stored on the session row, or a
  `mobile_scan_events` row owned by that staff and organization.
  Live check: owned scan `18450` is phone origin for staff 1; the same id is
  not phone origin for staff 2; missing id `999999999` is not. A phone user
  agent on a `personal` session is phone origin without a scan id.
- Phone arrival (`useArrivalStation` → `lookup-po`) and phone scan-out
  (`POST /api/shipped/scan-out`) both use that decision. A phone-origin
  scan-out cannot attribute the event to another staff id.
- Focused tests: 14 passed (`phone-execution`, action labels, station-feed,
  unauthenticated live route).

Observed live at `http://localhost:3050` with the saved staff-1 session:

- Arrival: `POST /api/receiving/lookup-po` for synthetic tracking
  `1ZCFSYNC2026100118450`, correlated to owned scan `18450`, created carton
  `53570` and projected `ops:31491` as `Scanned arrival: 1ZCFSYNC2026100118450`,
  `origin: phone`, staff 1. A reload of `/stations/live` at 390×844 still
  painted `You scanned arrival for Carton 53570` and
  `Scanned arrival 1ZCFSYNC2026100118450`. The carton remains. Receiving scans are
  append-only (`guard_evidence_append_only` refused a cleanup delete), so the proof carton was not deleted.
    Open record lands on `/search?sel=receiving:53570` and now shows Carton 53570
    with its tracking, not "Inbound record not found". A line-less carton uses the carton hub.
- Scan-out: `POST /api/shipped/scan-out` for packed order `100619` / shipment
  `180289` projected `sal:46958` as `Scanned out: 100619`, `origin: phone`,
  staff 1. That shipment had zero open allocations, so the ship mirror no-op'd.
  `DELETE /api/shipped/scan-out` returned `undone: 1`.
- `pnpm verify:fast` printed `verify PASSED (fast)` with Lint, Typecheck, Cron contract, Tenancy isolation, Schema drift, Boundary, Nav names, Sku identity, Layer laws, Design tokens, and V1 OpenAPI all checked.

Gates 10–11, 28–36, and 39–40 stay open. Picker and Quality Control are still
not feed sources. This is not a cutover.