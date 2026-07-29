# Handoff — Unbox scan-vs-lookup: Phases 1 & 2 landed, 3 & 4 deferred

**Lane:** `main` (integration/dogfood). Stay on it — do NOT create a branch or worktree.
**State:** all work below is **uncommitted** in the working tree. The user manages commits; never `git stash`.
**Background:** [`unbox-station-scan-vs-lookup-GEMINI-RESEARCH-BRIEFING.md`](unbox-station-scan-vs-lookup-GEMINI-RESEARCH-BRIEFING.md) — §1–13 is the surface trace, §14–16 the sequencing + the `intakeSurface` warning. Read §16 before touching anything mode/route shaped.

---

## 0. Read this first — two live hazards

### H1. Another agent is refactoring modes→routes on this same worktree, right now

It is deleting the `?mode=` vocabulary and moving receiving layouts onto exact URLs. Measured: **79 src files in 40 minutes**, still writing. It has already touched `useReceivingMode.ts`, `receiving-history-search.ts`, `station/entity-context/*`, `receiving/photo-scope.ts`, `lib/refresh/bus.ts`, and created an untracked `src/lib/routing/`.

**Consequence: `npm run verify` is not a clean signal on this branch.** Two gates fail for reasons that are NOT this work:

| Gate | Cause | Do NOT "fix" |
|---|---|---|
| **Route-permission drift** | untracked `/api/kiosk/dev-autopair/route.ts` (pre-existing, never committed) | running `audit-route-auth -- --emit` would fold someone's WIP route into a committed security artifact |
| **Dead-code (knip)** | untracked `src/lib/routing/*` with no importers yet; plus `clearReceivingHistoryUrlParams` orphaned when they edited `useReceivingMode.ts` | running `knip:baseline` would absorb their WIP into the baseline |

**Update 2026-07-28 22:00 — Typecheck and Unit are now red too, still not from this work.** The other lane is at **934 changed files** and writing minute-to-minute (files re-dated mid-run; one typecheck error vanished and a different one appeared between two consecutive runs). Current red gates and their owners:

| Gate | Failure | Owner |
|---|---|---|
| Typecheck | `StationHistoryTable.tsx` — `effectiveRenderRow`, `virtualized` undefined | other lane |
| Unit + DS | dialog-shell ratchet 44 vs 43; `font-bold` at `PoLineRow.tsx:221`; `dashboard-order-row-layout`; `queue-display-sort` | other lane |
| Knip | 10 findings (station / photos / packer / order-display) | other lane |
| Route-permission drift | `/api/kiosk/dev-autopair` | pre-existing |

**Lint, Route-auth enforce, and Schema drift are green.** Judge this work by the targeted run in §4 (**43 pass / 0 fail**) and by whether a failure *names a file in §2 / §2b*. It also runs live: see §2b. Do not fix the other lane's files and **never raise a ratchet baseline** to get a green.

### H2. `intakeSurface` is not mode vocabulary

`ScanIntakeSurface` (`src/lib/receiving/scan/types.ts:125`, client) and `ReceivingIntakeSurface` (`src/lib/receiving/record-scan.ts:15`, server) are persisted and drive SQL (`receiving_unbox.intake_path`, `unboxOpenedPredicateSql()` → the whole `view=unbox_opened` rail). `recordReceivingScan` defaults it to `'triage'`, so a caller that loses the field **silently records every Unbox scan as triage** and the Unboxed rail stops being written. No loud failure. Full detail: briefing §16.

---

## 1. What the work is

Operator complaint: staff scan a tracking number to *look up* a box that was received and unboxed weeks ago. On this surface a scan is a **write**, so inspection was indistinguishable from work.

**Correction that overrides Gemini's D2 as written** (verify before doubting):

- `receiving_scans` has **`ux_receiving_scans_tracking_receiving` UNIQUE (tracking_number, receiving_id)** — ONE row per carton+tracking. It is **not** append-only. The upsert did `SET scanned_at, scanned_by`, so a lookup **overwrote the original unboxer's attribution**, rather than inflating a log.
- `ops_events` `TRACKING_SCANNED` (`receiving-scan:<scanId>`) and `UNBOX_SCAN_OPENED` (`unbox-scan-opened:<org>:<recv>:<scanId>`) are keyed on the **stable** scan-row id → already idempotent across re-scans.
- `receiving_unbox.opened_at` is COALESCE-once → never moves.

⇒ **A `scan_kind` column is not implementable**: there is no per-scan row to tag. Lookups are recorded as a distinct append-only **`RECEIVING_LOOKUP_SCAN` ops event** (`ops_events.event_type` is free text; only `entity_type` has a CHECK). **No migration was needed and none should be added.**

**Classification rule** (`src/lib/receiving/unbox-scan-kind.ts`) — deliberately narrow:

| carton state | kind |
|---|---|
| never opened | `work` (the first open IS the work) |
| opened, not unboxed | `work` (resuming the box in your hands) |
| `receiving_unbox.unboxed_at` set | `lookup` |

Keying on `opened_at` would misclassify an operator re-scanning the carton they are actively unboxing. `unboxed_at` lives on the **`receiving_unbox` street table** — the spine column is no longer written (asserted by `returned-serial-link.test.ts`).

Classification **fails open to `work`** (missing row / thrown read). A misclassified work scan loses nothing; a misclassified lookup silently skips a real attribution write.

---

## 2. What landed (uncommitted, 19 files)

### Crossfade presence-key fix (pre-Phase-1)
- **NEW** `src/components/receiving/workspace-pane-key.ts` — `resolveWorkspacePaneSlot(prev, row)`. ONE key per physical carton, stable across (a) the scan-resolution upgrade and (b) the entry route (scan vs rail-click). A *different* carton still remounts. Idempotent under repeated application → safe to advance from a ref during render.
- **NEW** `src/components/receiving/workspace-pane-key.test.ts` — 10 assertions.
- `src/components/receiving/unbox/UnboxLineWorkspace.tsx` — consumes it; dropped the `workspace.scanDriven` key branch.
- `src/components/receiving/ReceivingRightPane.pending.guard.test.ts` — guard **retargeted, not deleted**. It previously pinned "remounts on scan-driven open"; it now pins carton-identity keying. Intent (never reuse the prior carton's shell) preserved.

### Phase 1 — motion (D5, partial by design)
- `src/design-system/foundations/motion-framer.ts` — **NEW sibling presets** `framerPresence.stationCartonSwap` (exit carries its own `{ duration: 0 }`) + `framerTransition.stationCartonSwapMount` (0.12s enter). `workbenchPaneSettle` was **not** retuned — it has 6 consumers (Review, Outbound, FBA, Packer, Triage, Unbox) and changing it is ask-first.
- `src/components/receiving/unbox/UnboxLineWorkspace.tsx` — uses the station preset. Carton→carton went ~0.6s of empty canvas → ~0.12s, no gap. `mode="wait"` **stays** (concurrent panes double-image).
- `.claude/rules/display/motion-crossfade.md` — documents the sibling.

### Phase 2 — scan classification (D2)
- **NEW** `src/lib/receiving/unbox-scan-kind.ts` — pure (no pool): `RECEIVING_LOOKUP_SCAN_EVENT`, `classifyScanKind`, `classifyUnboxScanKind`, `lookupScanClientEventId`.
- **NEW** `src/lib/receiving/unbox-lookup-scan.ts` — server, `Deps`-injected: `resolveUnboxScanKind`, `recordUnboxLookupScan`.
- **NEW** `src/lib/receiving/unbox-scan-kind.test.ts` + `unbox-lookup-scan.test.ts` — 15 assertions, DB-free.
- `src/lib/receiving/record-scan.ts` — `options.scanKind`. On `'lookup'`: preserves `scanned_at`/`scanned_by` in the ON CONFLICT, skips `TRACKING_SCANNED`, skips the triage door stamp.
- `src/app/api/receiving/touch-scan/route.ts` — **complete**: one LEFT JOIN reads `ru.unboxed_at`; a lookup returns `{ scan_kind: 'lookup', unboxed_at }` and writes only the lookup event.
- `src/app/api/receiving/lookup-po/route.ts` — `scanKindFor()` + gated `stampUnboxOpened`, applied at both pre-existing-carton sites (the local-tracking hit and the dedup path whose comment reads *"re-attribute this dock event to the current operator"*). The other `recordReceivingScan` call sites create the carton in the same request → `work` by construction.
- `src/components/receiving/receiving-events.ts` — `receiving-lookup-scan` + `UnboxLookupScanDetail` on the **typed bus** (a raw `CustomEvent` trips the receiving-bus ratchet guard — that is the correct fix, not a baseline bump).
- `src/components/sidebar/receiving/scan-apply.ts` — `applyUnboxCartonOpened` gains `unboxedAt`; announces optimistically, and again from touch-scan's authoritative `scan_kind`.
- `src/components/sidebar/receiving/useTrackingScan.ts` — feeds `unboxedAt` from all 3 client rungs (internal-code, Phase-0 cache, local-tracking).
- `src/components/receiving/useReceivingWorkspacePane.ts` — `lookupReceipt` state via `useReceivingEvents`.
- `src/components/receiving/ReceivingRightPane.tsx`, `src/components/ReceivingDashboard.tsx` — prop threading.
- **NEW** `src/components/receiving/unbox/UnboxLookupReceipt.tsx` — read-only "already unboxed" card (Panel + TrackingChip + Button), rendered **over** the editor so "Open anyway" is instant and nothing re-mounts.

---

## 2b. Session 2 (2026-07-28 21:30–22:00) — verified in the browser, and closed a real hole

### Browser verification: DONE, receipt renders

`tests/.auth/admin.json` already holds a **live `cf_sid`** (staff 15, org `…0001`,
valid to 2027-07) — global-setup 401s when it *mints* a session, but the stored
state needs no minting. Drive Playwright with `storageState` against
`http://localhost:3050` (cookie domain is `localhost`; `127.0.0.1` sends no cookie).

Scanning carton **50200** (unfound, `unboxed_at` set, `scanned_by = 7`) as staff 15:

- receipt renders over the editor — eyebrow, "Open anyway", the lookup copy;
- `receiving_scans.scanned_by` stayed **7**, `scanned_at` unmoved;
- `opened_at` / `unboxed_at` unmoved;
- exactly one `RECEIVING_LOOKUP_SCAN` appended; no new `TRACKING_SCANNED` / `UNBOX_SCAN_OPENED`.

Gotcha that cost a run: the card renders `&rsquo;`, so a locator using an ASCII
apostrophe never matches. Match `'unbox work is done'`. Also note `innerText`
applies `text-transform`, so the eyebrow reads `ALREADY UNBOXED`.

### §1's "work by construction" claim was WRONG — 5 of 6 sites were unguarded

The handoff asserted the remaining `recordReceivingScan` sites "create the carton
in the same request → `work` by construction". They do not. `stampUnboxOpened`
shipped with **`scanKind` defaulting to `'work'`**, and that default hid the miss:

| site | how it reaches a PRE-EXISTING carton | was |
|---|---|---|
| `memoizeLookupHit` (via `findScanByTracking`) | **the earliest write on every existing-carton resolution** | unguarded |
| order path | `upsertMatchedReceiving` returns `preexisting` | unguarded |
| matched path | promoted-in-place / upsert hit | unguarded |
| secondary multi-PO carton | same upsert | unguarded |
| unfound re-scan | `preassignedReceivingId` carried forward | unguarded |
| ticket hit · dedup | — | already gated |

`memoizeLookupHit` is the one that mattered: it runs the moment
`findScanByTracking` resolves a carton, **before any gated branch**, so the two
branches Session 1 gated were fixing an overwrite that had already happened.

**Fixed:** `scanKind` is now **required** on `stampUnboxOpened` (a default is a
silent opt-out — see `.claude/rules/backend-patterns.md`); `recordScan` and
`memoizeLookupHit` thread it; every site classifies via
`scanKindForMaybeExisting(id, preexisting)` and gives the **same verdict** to the
attribution write and the open stamp. Verified live: `POST /api/receiving/lookup-po`
on carton 50200 left `scanned_by = 7` and appended one lookup event.

**New:** `src/app/api/receiving/lookup-scan-wiring.guard.test.ts` — 6 assertions
that parse the call-site argument lists, so a 7th site cannot land unclassified.
No migration; no new event type.

---

## 2c. Session 3 — the lookup-po receipt gap closed, receipt rebuilt

**The gap:** lookup-po posts no touch-scan (it stamps server-side), so its
**response is the only signal the pane gets** — and it carried no verdict. A
lookup resolving through lookup-po was recorded correctly and then handed the
operator the work editor anyway.

**Server.** `resolveUnboxScanState` (new, in `unbox-lookup-scan.ts`) returns
`{ kind, unboxedAt, unboxedByName, poNumber }` in ONE round trip —
`resolveUnboxScanKind` now delegates to it, so there is one query and one
fail-open branch, not two. LEFT JOINs throughout: an unfound carton has no PO
and a never-opened one has no street row, and an INNER join would turn both into
"work by accident" instead of by rule. lookup-po remembers the verdict
(`lookupScanState`) and spreads `lookupResponseFields()` onto all **six**
carton-opening responses; touch-scan returns the same three fields. Absent (not
`scan_kind: 'work'`) on a work scan, because the client tests for the literal.

**Client.** `lookupScanFieldsFrom(d)` reads the verdict off a lookup-po response;
both applies (`scan-apply.ts`) spread it into `applyUnboxCartonOpened`.

**Receipt** (`UnboxLookupReceipt.tsx`) now shows **Purchase order** (`PoChip`,
same chip family as tracking), **Tracking**, **Unboxed**, **Unboxed by**, and a
full-width primary **Open package details** button that jumps to the global
search surface with the PO pre-queried. `unboxedByName` comes from the server,
not `workspace.row` — the row is usually still hydrating when the card paints,
which is why that fact rendered blank before. No PO (unfound carton) → the jump
falls back to the tracking number rather than rendering a dead button.

**SoT work this required:**
- `globalSearchHref(query)` in `search-hit.ts` — `searchScopeHref('RECEIVING')`
  returns null by design (no URL-searchable receiving list), and the global
  cross-entity surface is a different job. Compound opportunity, NOT taken:
  `GlobalHeaderSearch.tsx` hand-rolls this same href twice — left alone because
  it is nav chrome under active refactor by the other lane.
- `Panel` gained `elevation="raised" | "overlay"`, resolving through
  `elevationClass()`. **Additive** — `none`/`sm`/`md` are byte-identical, so no
  existing Panel moves. The receipt floats *above* the editor it covers, so it
  is an `overlay` plane; the raw `shadow-sm` step it used before carried neither
  the ambient+key+cast stack nor the dark-theme alpha ramp.

**Verified live** (dev :3050/:3000, staff 15, carton 49929 · PO 19-14910-41811,
unboxed by Kai/staff 7): receipt renders with the PO chip and the unboxer's
name; clicking the button lands on
`/dashboard?mode=search&q=19-14910-41811&map=search` with **1 RECEIVING result**;
`scanned_by` stayed **7** and only `RECEIVING_LOOKUP_SCAN` was appended.

Tests: 48 pass / 0 fail. The wiring guard gained a response-contract assertion —
every carton-opening response must spread `lookupResponseFields()`, so a seventh
branch cannot ship recording a lookup and then showing the editor.

---

## 2d. Session 4 — four operator-reported fixes

1. **A lookup no longer touches the sidebar rail.** `applyUnboxCartonOpened` was
   upserting the carton onto Unboxed and purging the triage rails on *every*
   open, so inspecting a weeks-old box bumped it to the top of the rail wearing
   the freshly-arrived `0/?` face — and evicted it from Arrival because someone
   *looked* at it. The rail writes now sit in the work branch only. The pending
   `scan:{tracking}` stub is still dropped (our own artifact), and **touch-scan
   still fires for both kinds** — it is what records `RECEIVING_LOOKUP_SCAN` for
   the client short-circuit rungs, so skipping it would leave the inspection
   unlogged. Regression test in `scan-apply.test.ts`; verified live (rail header,
   row count and top-6 byte-identical across a lookup scan).
2. **Receipt width = the station workbench column.** `max-w-lg` made it a narrow
   floating dialog that did not line up with the identity bookmark above it. Now
   `STATION_WORKBENCH_COLUMN` (measured 720px). `STATION_WORKBENCH_BODY_PAD_X`
   was added to the workbench barrel — a surface that *replaces* the body needs
   the column and the inset on different elements, and hand-writing
   `px-4 sm:px-6` is exactly the drift `display/station-workbench.md` bans.
3. **PO renders last-4** (`1811`), matching the TrackingChip beside it and every
   other `PoChip` call site. Full number still copies.
3b. **Facts are ONE band**, not a 2×2 grid — `flex items-center justify-between`.
   720px fits all four across, so the grid was spending a second row on nothing.
   `Fact` carries `min-w-0` + `whitespace-nowrap` so a long value shrinks in
   place instead of pushing a sibling out or wrapping the band. Degrades
   correctly to 3 facts on an unfound carton (no PO). Measured: band 54px tall,
   no overflow, `space-between` in both cases.
4. **Global search auto-opens a sole result of ANY type** — `soleHitHref` in the
   search SoT. `shouldAutoOpenSearchOrder` only ever covered orders, so a search
   settling on one carton parked the operator on a one-row list. Orders keep the
   query-carrying `orderSearchHref`; the natural-language guard stays on that
   branch only (for an identifier the hook's exact-match path owns navigation).
   `globalSearchHref` also absorbed the two hand-rolled URL literals inside
   `globalSearchHandoffHref` — one builder, existing tests unchanged.

### ✅ Tension RESOLVED in §2e

The receipt's **Open package details** → search → auto-open now lands on
`/unbox?openReceivingId=<id>` — the Unbox **workspace**, i.e. the editor the
receipt exists to steer away from. Both behaviours are individually correct and
were both explicitly requested; they collide only when the sole hit *is* the
carton you came from.

The principled fix is the deferred **Phase 4 read-only `CartonInspector`**
(§3.5): once a carton has a read-only surface, `searchHitHref('RECEIVING')`
points there and the loop resolves itself. Do NOT special-case the search view
to suppress auto-open for the origin record — that hides the real gap.

---

## 2e. Session 5 — Phase 4: the `CartonInspector` (D4)

**`/carton/[id]` is the READ view of a carton.** `/unbox` stays the WORK view.
That was the missing door: "what happened to this box?" and "change this box"
shared one entrance, so `searchHitHref('RECEIVING')` — every search hit, ⌘K
result, AI answer and timeline glyph — dropped the operator into the editor.

### Composition, not a second carton renderer

D4 was only allowed on one condition: **both shells compose the same dumb
primitives.** So the inspector mounts what the Unbox bench mounts —

| Layer | Primitive | Read-only how |
|---|---|---|
| Identity | `CartonContextCard` (entity-context SoT) | `classifyInteractive={false}`; every `onEdit*` / `onMakeClaim` **omitted**, which is how that SoT hides an affordance |
| History | `WorkspaceTimelineTab` | unchanged — same Units / Tracking spines |
| Photos | `ReceivingPhotosSection` | unchanged — same gallery |
| Chips | `CopyChip` family | unchanged |

It owns exactly two things: the provenance fact stack (derived purely in
`carton-inspector-model.ts`) and the *absence* of an editor. **No new endpoint** —
`GET /api/receiving/[id]` already returned the whole read model.

`carton-inspector.guard.test.ts` encodes the condition executably: no write verb
or mutation plumbing, no editor/terminal import, identity must compose the shared
card with classify off, timeline/photos must be the shared primitives, and no
hand-positioned timeline dots (the classic fork).

### Timestamp trap worth knowing

The carton milestone fields arrive from `to_char(ts::timestamp, …)` with the DB
session on `America/Los_Angeles` — they are **warehouse wall-clock strings, not
instants** (21:26:58Z is delivered as `2026-07-28 14:26:58`). `formatDateTimePST`
parses that naive shape purely, so it is TZ-independent; anything that does
`new Date(str)` on them shifts a second time. The guard bans `new Date` here.
`events[].occurred_at` IS a real instant — same formatter, different branch.

### One producer for the destination

`global-entity-search.ts` was the last site hardcoding `/unbox?openReceivingId=`
(its own comment already said "kept in sync with searchHitHref"). It now composes
`searchHitHref`, so hybrid retrieval, the exact fast path, support-ticket search,
ops-events timeline and the assistant read-tools all moved together. `/carton`
also joins `page-context.ts` so search from the inspector boosts RECEIVING.

### The loop, verified end-to-end

scan an unboxed carton → receipt → **Open package details** → global search →
sole hit auto-opens → **`/carton/49929`, read-only**. Traced twice; both runs
land on the inspector, never the editor. The §2d tension is gone.

Live check on carton 49929: provenance reads Scanned in / Opened / Unboxed /
Received, each `2:2x PM` PDT with actor **Kai**; contents `1/1 units · 1/1 line
complete` with SKU, PO chip, condition and serial; 7 receiving photos; timeline
Units/Tracking spines. No console errors, no terminal dock.

---

## 3. What is NOT done

1. ~~Browser verification~~ / ~~lookup-po receipt gap~~ — **both DONE** (§2b, §2c).
2. **D5 full "swap in place" — deliberately not done.** The queue-inspector exception needs `LineEditPanel` to re-seed transient state per carton. It does not: `unboxView` (:149), `classifyExpand` (:150), `pairingOpen` (:304) have **no reset keyed on `row.id`**, and the notes composer has no flush-before-swap. Killing the animation bought the throughput; removing the remount needs those resets first. Rationale is in the component header — do not delete it.
3. **Triage carries both defects untouched** — `TriageLineWorkspace.tsx:71` has the identical `scanDriven` key expression, and uses `workbenchPaneSettle`. Left alone because Triage's loading model differs (skeleton, not empty-pane-first) and needs its own verification.
4. **Phase 3 (D3: Queue as default tab, History search → view filter)** — **deferred until the modes→routes refactor lands.** Collides with `src/utils/unbox-workspace-state.ts` (`?unboxview=`) and `resolveUnboxReceivingTableMode` in `src/lib/receiving/receiving-modes.ts`, which is the mode registry itself.
5. ~~Phase 4 (D4)~~ — **DONE, see §2e.** `/carton/[id]` is live and `searchHitHref('RECEIVING')` points at it.
6. **Q8 instrumentation** — partially free now (`RECEIVING_LOOKUP_SCAN` gives the "scans landing on already-unboxed cartons" rate). Still missing: time-from-scan-to-first-mutation. Land before deciding D3/D7 so they are measured, not argued.
7. ~~No route-level test~~ — **DONE**: `lookup-scan-wiring.guard.test.ts` (§2b).

---

## 4. How to verify your changes

```bash
node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
  src/lib/receiving/unbox-scan-kind.test.ts \
  src/lib/receiving/unbox-lookup-scan.test.ts \
  src/components/receiving/workspace-pane-key.test.ts \
  src/components/receiving/ReceivingRightPane.pending.guard.test.ts \
  src/components/receiving/receiving-events.guard.test.ts \
  src/app/api/receiving/lookup-scan-wiring.guard.test.ts \
  src/app/api/receiving/lookup-po/local-only.guard.test.ts
```

Expect **48 pass / 0 fail** (34 + 7 wiring + 3 local-only + 4 scan-state). The `register-server-only-shim.cjs` is required — bare `npx tsx --test` throws `This module cannot be imported from a Client Component module` on anything reaching `@/lib/db`.

Then `npm run verify`, reading it per **H1**: Lint / Typecheck / Unit+DS must be green; knip + route-drift failures belong to the other lane unless they name a file in §2.

---

## 5. Constraints

- **Never raise a ratchet baseline** (DS guards, knip, receiving-event bus, station-workbench chrome) to land something. Migrate to the primitive or take the documented `ds-*` escape.
- **No migration for this work.** If you think you need one, re-read §1 first.
- **Do not touch the append-only scan spine or ops-events vocabulary** beyond adding event types.
- **Never commit `.env`.** Real `.env` is gitignored with live secrets.
- Do not delete or "fix" the other lane's untracked files (`src/lib/routing/`, `/api/kiosk/dev-autopair`, `/api/inbox`, `/api/subscriptions`).
- Station law: an outcome is a **big card state, not a toast**; never block the bench on infra.
- Append a work-log entry when a unit of work finishes: `pnpm worklog "<action>" --result <r>`.
