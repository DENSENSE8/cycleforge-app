# Search → Journey handoff (WS-JOURNEY, main lane)

> **Status:** DONE (display handoff shipped + acceptance run 2026-07-20) · main lane (dogfood-surface fix, no migration, no new surface)
> **Supersedes:** the original "Search Journey Loop Gaps" 4-phase draft — interview-validated and cut down
> (decision log below). Hop-emitter work split to
> [`journey-hop-emitters-plan.md`](journey-hop-emitters-plan.md).
> **North star:** `docs/master-connections-and-refactor/staff/04-item-journey.md` — "any serial deep link
> opens journey first."

## Verdict

[`GlobalHeaderSearch`](../../src/components/layout/GlobalHeaderSearch.tsx) is a launcher, not a timeline
surface — correct, keep it that way. The full-loop display already exists (Operations History **Trace**:
`/operations?mode=history` → `/api/operations/journey` → `EventTimeline`). The only real product gap is the
**handoff**: search hits cannot open the journey. Close that with ~4 touch points; do **not** touch the
search index, Enter behavior, or `/o`.

## Verified facts (2026-07-17, against code)

- `globalSearchHandoffHref` (`src/lib/search/search-hit.ts:144`) is order-biased: identifiers →
  `/o/{id}?mode=search` or `/dashboard?search=`; never `/operations?mode=history`.
- `/api/operations/journey` resolves `dim=order|serial|tracking` — the Trace target exists and merges 5+ spines.
- `SearchHit` facets carry **no** serial; a unit hit only has numeric `entity_id`.
- `/inventory/units/page.tsx` mounts no journey section; `SerialJourneySection` lives only on shipped details.
- `inventoryEventsToTimeline` knows `PUTAWAY` as title/tone but emits no bin ref (deferred → emitters plan).
- `countRoundTrips` exists in `src/lib/timeline/journey.ts`.

## What ships

### 1. `dim=unit` on the journey API

`src/app/api/operations/journey/route.ts` + `resolveEntity`: one new branch — numeric `serial_units.id`
(org-scoped) → the same serial anchor `dim=serial` produces. Trace URL becomes
`/operations?mode=history&dim=unit&unit={id}`.

- **Why not serial facets on `SearchHit`?** That path costs a `build-search-text` change, the 2026-07-03d
  two-column-list trigger sync, and a full unit-doc reindex before the feature works — to solve a lookup the
  server can do in one query. It also leaks journey data into `entity_search_docs`, which this plan's own
  premise bans. Server-side resolution wins. (A serial facet remains a legitimate *future display* concern
  if the dropdown row ever needs to show the serial — that is not this plan.)
- DB-free unit test via the house `Deps`-injection pattern.

### 2. `journeyHandoffHref(hit)` helper

Pure helper in `src/lib/search/search-hit.ts`, next to `searchHitHref` / `globalSearchHandoffHref`:

| Hit | Href |
|---|---|
| `order` | `/operations?mode=history&dim=order&order=…` |
| `unit` | `…&dim=unit&unit={entity_id}` |
| any hit with a `tracking_number` facet (incl. `receiving`) | `…&dim=tracking&tracking=…` |
| `repair` / `fba` / `sku` / anything without an anchor | `null` — the action does not render (**no fake empty Trace**) |

Unit tests on the mapping table, including the null cases.

### 3. "Open journey" affordance in `GlobalHeaderSearch`

Secondary action only — **Enter keeps today's behavior everywhere** (order map / domain deep-links). Two
routes to the same helper:

- Paired icon+label action revealed on hover/focus of qualifying rows (`SearchResultRow`), per one-row
  anatomy (no row-height shift; `IconButton` sizing; `HoverTooltip` for the label if icon-only).
- **Cmd/Ctrl+Enter** on the highlighted row opens `journeyHandoffHref(hit)`.
- Rows where the helper returns `null` render no affordance.

### 4. `SerialJourneySection` on `/inventory/units` detail

Mount the existing section on the unit detail pane (the primary-click destination of a unit hit), so the
default click shows lifecycle without learning the secondary action. Compose the existing
`SerialJourneySection` / `TimelineSection` — no new timeline primitive, degrade-not-fail (a failed journey
fetch renders the section empty, never 500s the pane).

## Explicitly NOT in this plan (decision log, 2026-07-17 interview)

| Cut | Decision | Why |
|---|---|---|
| Reroute Enter to Trace for serial/tracking queries | **Rejected** | Enter on an identifier is the most muscle-memorized action in the app and lands on a *work* surface. Journey is a read Monitor; it must be a deliberate secondary action. |
| Serial facets on `SearchHit` + index backfill | **Rejected** | `dim=unit` resolves server-side with zero reindex; facet denormalization violates the plan's own search-as-finder rule. |
| `/o/[orderId]` journey-first (always or `?from=search`) | **Rejected / deferred** | `?from=search` = two shapes for one page (Never-list fork); always-on = Ask-first blast radius on the busiest workbench. Trace is the journey surface. Revisit as its own initiative only if Trace handoff proves insufficient. |
| Hop emitters (bin_id putaway, ship consistency, ticket spine, RMA provenance) | **Split** to [`journey-hop-emitters-plan.md`](journey-hop-emitters-plan.md), own worktree lane | Backend lifecycle work across state-machine writers; ticket spine depends on Entity Threads migrations (UNAPPLIED). Distinct initiative per the worktree-lane law. |
| `src/lib/connections/` `getItemJourney` façade | **Deferred** | Only if Phase-2-style mounts start duplicating fetch logic. |
| Timeline strip inside the header dropdown; second timeline primitive; denormalized timelines in `entity_search_docs` | **Never** | Unchanged from original plan. |

## Acceptance: renders-what-exists + gap ledger — **RUN 2026-07-20 ✅**

**Contract chain (deterministic) — PASS.** Verified param names round-trip end-to-end across all four dims:
`journeyHandoffHref` / `build*JourneyHref` write `dim=order|serial|unit|tracking` + matching value param →
`OperationsHistoryView` URL-state → `operations-journey-queries` builds `/api/operations/journey?dim=…&…=…`
→ route `entityParamForDim` → `resolveEntity`. No `dim=unit` ↔ `?unit=` drift.

**Coverage (live, read-only) — captured.** `scripts/probe-journey-coverage.mjs` org-wide census fed the gap
ledger in [`journey-hop-emitters-plan.md`](journey-hop-emitters-plan.md). Headline findings:
- Emitting today (render on Trace): receive, test, grade, label, **putaway with `bin_id` (93/93)**, allocate.
- Confirmed gaps → emitters lane: **no `PACKED`, no `SHIPPED`** serial-anchored events (ship state lives on the
  shipment side; 7,856 tracking rows but 0 serial ship hops).
- Unverifiable in dev (thin data): ticket spine (0 rows, blocked on Entity Threads), SAL/RMA round-trip.

**Tests added:** `src/lib/operations/journey.resolve-entity.test.ts` (5 cases — DB-free fake-`PoolClient`
coverage of the `dim=unit` branch: id→serial anchors, allocated+shipped→order+tracking, non-numeric→null/no-query,
unknown→null, blank→null). Auto-run by `verify`'s `src/**/*.test.ts` gate (with the server-only shim); it can't
join `test:operations-journey`, which runs shimless.

Original acceptance criteria, for the record:
1. ⌘K shipped serial → affordance / ⌘Enter → Trace renders every spine with data today. ✅ (wiring + data verified)
2. ⌘K order id → `dim=order`; ⌘K tracking → `dim=tracking`. ✅ (contract)
3. Unit hit primary click → `/inventory/units` detail journey section. ✅ (`ByUnitView` mounts it)
4. Gap ledger seeded from the run. ✅

Gates: `journey.resolve-entity.test.ts` 5/5, `search-hit.test.ts` 9/9; full `npm run verify` still to run on final tree.

## Implementation notes

- `GlobalHeaderSearch.tsx` and `search-hit.ts` consumers have in-flight working-tree changes on main
  (FOH/BOH session) — build on the current tree state, not a stale read.
- Trace already supports round-trip badges; nothing to add there.
- Staff-facing copy for the affordance: **"Open journey"** (Item Journey vocabulary), not "Trace".

## Compound opportunities

- **Do now (in scope):** `journeyHandoffHref` beside the existing href helpers; `dim=unit` beside existing dims.
- **Promote next (2+ call sites):** if `/inventory/units` + a second surface both grow journey mounts with
  identical fetch wiring, extract the `getItemJourney` façade then.
- **Deferred (ask first):** `/o` journey band; dashboard Search-mode journey actions.
