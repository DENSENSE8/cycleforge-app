# Pack placement — Phase 3+ handoff (continue the next phases)

Ready-to-Pack **bench placement**: labeled orders (Phase 1) and loose serialized
units (Phase 2) are staged on packing DESK/STAGING benches, counted per bench for
"who needs to pack" triage. **Phases 1 & 2 are built, verified, and E2E-green on
the QA org** (uncommitted). This doc hands off the remaining phases.

Do **not** edit any `.cursor/plans/*` file. The user manages commits — commit only
when asked, stage only your own files, never `git stash`.

---

## Locked product rules (do NOT reopen)

- Benches are **`locations` rows** (`location_kind` ∈ `DESK` | `STAGING`) under a
  packing `ROOM` — **never** a `packing_stations` table, `staff_stations` role
  enum, or `localStorage`/`cf.workstation` as the count SoT. Guard:
  `src/lib/packing/no-pack-station-twin.guard.test.ts`.
- **Orders and units keep SEPARATE ledgers + counts** (no double-count):
  `order_pack_placements` (Phase 1) and `unit_pack_placements` (Phase 2). Do not
  merge them into one count unless product explicitly asks for a unified board
  (that is the deferred polymorphic option — ask-first, see P3e).
- Bench placement is **WIP staging**, distinct from stock putaway
  (`serial_units.current_location` + `inventory_events(MOVED)` are the bin path —
  never fold placement into them).
- **Trigger:** order = TRACKING scan at Ready-to-Pack with an armed bench; loose
  unit = a printed **unit-id sticker** (`{SKU}-{YYWW}-{SEQ6}`) scanned while a
  bench is armed. Raw manufacturer serials still attach to the active order — do
  not change that.
- SoT prose: `.claude/rules/source-of-truth.md` → **Pack placement**;
  `AGENTS.md` one-liner. Add unit-placement lines there when you extend it.

---

## What exists (Phase 1 + Phase 2)

| Concern | Files |
|---|---|
| **Migrations (applied)** | `src/lib/migrations/2026-08-09_locations_location_kind.sql`, `2026-08-09b_order_pack_placements.sql`, `2026-08-09d_unit_pack_placements.sql` (note: `d`, not `c` — a concurrent session took the `c` slot) |
| **Domain SoT** | `src/lib/packing/pack-placement.ts` (orders) · `unit-pack-placement.ts` (units) · `pack-placement-constants.ts` (`PACK_PLACEABLE_KINDS`) · `pack-station-arm.ts` (armed bench, sessionStorage + `?packStation=`) |
| **Drizzle models** | `src/lib/drizzle/schema.ts` → `orderPackPlacements(+Events)`, `unitPackPlacements(+Events)` |
| **Audit** | `src/lib/audit-logs.ts` → `ORDER_PACK_PLACE/MOVE/CLEAR`, `UNIT_PACK_PLACE/MOVE/CLEAR` |
| **APIs** | `GET/POST /api/orders/pack-placement(/move)`; `GET/POST /api/units/pack-placement(/move)`; tech-scan place in `src/app/api/tech/scan/route.ts`; order clear-on-ship in `src/app/api/pack/ship/route.ts`; counts in `src/app/api/orders/queue-counts/route.ts` (`packPlacement` block) |
| **Client** | `src/hooks/useStationTestingController.ts` (arm-barcode + loose-unit branches), `src/hooks/station/handleTrackingScan.ts` (order place), `src/hooks/useArmedPackStation.ts`, `src/components/sidebar/tech/ShippingScanBand.tsx` (armed chip + unit count) |
| **KPIs** | `src/components/tech/shipping/ShippingKpiStrip.tsx` (Ready-to-Pack per-station ORDER tiles + arm-on-click), `PackStationPlacementControl.tsx`, `src/components/dashboard/OutboundKpiStrip.tsx` (To-ship aggregate "At stations") |
| **Queries** | `src/lib/queries/pack-placement-queries.ts` · `unit-pack-placement-queries.ts` |
| **Tests** | `pack-placement.test.ts` (2), `pack-placement-domain.test.ts` (10), `unit-pack-placement-domain.test.ts` (6), `no-pack-station-twin.guard.test.ts` (3, covers both count SoTs) |
| **E2E (QA org)** | `tests/e2e/pack-placement.spec.ts` (5) · `tests/e2e/unit-pack-placement.spec.ts` (2) — all pass on `--project=qa-desktop` |
| **QA seed** | `scripts/provision-qa-org.ts` → `seedPackingStationsForOrg` (benches, `QA-PACK-DESK-01..03`/`QA-PACK-STAGING`) + a loose unit fixture (`QA_FIXTURE_UNIT.unitUid = 'QAUNIT-2621-000042'`, on-floor `TESTED`) |
| **Facet ownership** | `src/components/unshipped/outbound-sidebar-shared.ts` → `packPlaced`/`packStation` are `'kpi'`-owned |

**Status as of this handoff:** `tsc` clean · knip clean · all packing unit tests +
guards pass · migration/schema/route-auth guards pass · **E2E 7/7 on QA**. Nothing
committed.

---

## Environment realities (read before you run anything)

- **Dev server is the user's, on `:3050` — ATTACH, never start/kill.** Migrations
  are already applied (`node scripts/run-pending-migrations.mjs --dry` → 0 pending).
- **Heavy concurrent WIP** (photos/media-library, Unbox dock, CSV import). `npm run
  verify` may flicker red on Typecheck/Unit from *other sessions'* mid-save files —
  run the failing gate on YOUR files before assuming it's yours; report pre-existing
  red, never raise a baseline.
- **A PostToolUse auto-fixer strips unused `export`s / dead functions on write.**
  This bit Phase 2: `clearUnitPackPlacement` and some exports were removed because
  they had no consumer at write-time. Fix: **write the consumer first (or in the
  same batch), then the export sticks** (the fixer is project-aware). If you re-add
  `clearUnitPackPlacement`, wire its caller in the same change.
- **QA org is the test tenant** (`00000000-…-0002`). Re-provision freely
  (`pnpm provision:qa-org`, idempotent). **E2E asserts against QA, never dogfood.**
- Routes reuse the existing `orders.view` permission (no registry change needed);
  the move routes also inner-check `tech.scan_serial | packing.view`.

---

## Next phases (prioritized)

### P3a — Ship-clear for units (clear `unit_pack_placements` when a unit leaves the floor)
**Why:** Today a unit placement clears only on `/move`. The count already excludes
off-floor statuses (`SHIPPED/SCRAPPED/RETURNED/RMA`) so it stays honest, but the row
lingers. Phase 1 clears order placement in `pack/ship`; units need the parallel.
**Do:**
- Re-add `clearUnitPackPlacement(orgId, {unitId, staffId, reason?}, client?)` to
  `unit-pack-placement.ts` (it was auto-stripped; **wire its caller in the same
  change** so it isn't re-stripped). Mirror `clearOrderPackPlacement`.
- Call it where a unit transitions off the floor. Cleanest hook: the serial-unit
  status machine — when `transition()` (`src/lib/inventory/state-machine.ts`) moves
  a unit to `SHIPPED`/`SCRAPPED` (and on pack complete for the order the unit
  belongs to, in `pack/ship`). Decide with the state-machine owner whether to clear
  on transition vs. on order pack.
- Audit `UNIT_PACK_CLEAR` (already defined).
- Test: extend `unit-pack-placement-domain.test.ts` (clear returns false when no
  placement / true + event when present — mirror the order clear tests).
**Scope note:** this touches the shared `transition()`/`pack/ship` path → treat as
ask-first if it widens beyond a single call site.

### P3b — Dedicated per-bench UNIT KPI on Ready-to-Pack
**Why:** the user asked to "see how many at each bench." Orders already have
per-station tiles in `ShippingKpiStrip`; units only show on the armed chip today.
**Do:** add a separate unit-count readout per bench (a compact strip or a secondary
line on each station tile) fed by `unitPackPlacementQuery()` (`/api/units/pack-placement`
already returns per-bench `counts`). Keep it visually SEPARATE from order tiles (no
merged number). Do **not** rewrite the order-tile logic. Add a `data-testid` and an
E2E assertion (arm a bench, place a unit via the loose-unit path, assert the tile
shows the count).

### P3c — Phase 1.5: Settings workstation → bench auto-arm
**Why:** operators re-arm a bench each session. Bind a staffer's saved workstation
to a `location_id` so it auto-arms.
**Do:** add a `location_id` binding to the workstation/staff-preferences setting
(find the existing workstation setting — `cf.workstation`/Settings), and have
`useArmedPackStation` seed the armed bench from it when nothing is armed. Keep the
bench SoT the `locations` row — the setting only *references* a DESK/STAGING id.
Never make the setting a count SoT.

### P3d — To-ship per-station order breakdown (optional parity)
To-ship (`OutboundKpiStrip`) shows only the aggregate "At stations". If the desk
operator wants per-station order counts there too, surface them from
`queue-counts.packPlacement.counts` (already present) — a small addition, no schema
change.

### P3e — (ask-first) Unified "everything on this bench" board
Only if product wants ONE number spanning orders + units. That means generalizing to
a polymorphic `pack_placements(entity_type ∈ {ORDER,SERIAL_UNIT}, entity_id BIGINT)`
per `.claude/rules/polymorphic-tables.md` (trigger-family delete integrity) and
migrating Phase 1 in — a deliberate cleanup wave, **not** a quick edit. Get explicit
product sign-off first; it touches the just-shipped Phase 1.

### P3f — (optional) "QC prepack matrix" view
The original scope named Phase 2 "QC prepack matrix / unit placement". Unit placement
is done via Ready-to-Pack. If product wants a *matrix view* of prepacked units by
bench/SKU at QC/testing, that's a new read surface over `unit_pack_placements` +
`serial_units` — scope with the user before building.

---

## Verify / run

```bash
npm run verify                        # full gate (mirror of CI)
npm run verify -- --fast              # lint + typecheck only
# targeted:
node --import ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/packing/*.test.ts
npx tsc --noEmit -p tsconfig.json
node scripts/knip-gate.mjs
npx tsx scripts/audit-route-auth.ts --check   # + --enforce after adding routes
node scripts/run-pending-migrations.mjs --dry # then --only <file> to apply just yours
```

E2E (QA org only):

```bash
pnpm provision:qa-org
npx playwright test pack-placement.spec.ts unit-pack-placement.spec.ts --project=qa-desktop
```

---

## Guardrails / gotchas

- **Never** a `packing_stations` relation, or units/orders in one count without
  product sign-off (P3e). Guard already enforces the count SoTs.
- **Migration slot:** one `YYYY-MM-DD<letter>` per file; check `--dry` and don't
  reuse a letter a concurrent session took (that's why Phase 2 is `d`).
- **Auto-fixer** strips unused exports on write — wire the consumer in the same
  change.
- **`enum <> ALL(text[])` needs a cast** (`::text`) — this was the one Phase 2 bug,
  caught only by the E2E (DB-free tests can't reach that SQL). Prefer an E2E for any
  new count/status SQL.
- Don't touch other sessions' WIP (photos, Unbox dock, CSV import) unless it blocks
  YOUR gate; report pre-existing red.

## Done when
- P-you-pick: code + a domain/guard test + a QA-org E2E, all green.
- `npm run verify` green on your files (foreign transients reported, not fixed).
- SoT prose (`source-of-truth.md` / `AGENTS.md`) updated for any new capability.
- Short report: what shipped, what you verified, residual risks, state changes made
  to the dev DB / QA org.
