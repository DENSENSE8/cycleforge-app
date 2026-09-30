# HANDOFF — Mobile QC queue at `/m/qc` (owner 2026-09-29)

Paste this whole file as the prompt. It is self-contained.

## Goal

A tech opens `/m/qc` on the phone and sees **one list of every unit waiting for
quality control, most urgent first**, built like the pick list (`/m/pick`): the
segmented progress bar at the very top, then one `RecordCardMobile` per unit
with the **bin first**, then one tap into that unit's QC screen. It paints
**real data for org #1 (the USAV dogfood org,
`DOGFOOD_ORG_ID = 00000000-0000-0000-0000-000000000001`)** — no fixtures, no
placeholders.

**Urgency order (owner, exact — the list sorts by these tiers, top to bottom):**

1. **Returns**
2. **Repair service**
3. **Unfound**
4. **Local pickup**
5. **Test again / retest**
6. **Quality control** (everything else)

Inside a tier: a carton flagged `is_priority` (a pending order is waiting on
it) first, then oldest unbox first.

## Design law (owner 2026-09-29) — read before any UI

- **Triage is the default face.** Lists, records, tickets and label panels are
  triage (the readable face). **Industrial is used sparingly**: only
  high-touch, muscle-memory controls where speed matters — the Pass / Test
  again / Failed verdict buttons, a scan-to-confirm step, quantity steppers.
  Precedent: `/m/pick` is a triage route with a flush industrial action dock
  (`PickOrderScreen.tsx`, listed in `eslint.config.mjs` mode-law exceptions).
- **F-pattern, immediate identification**: context → identity → execution, the
  state code leads the first row (`docs/design-system/HANDOFF-industrial-record-ledger.md`
  §laws; `RecordCardMobile` pin in `src/design-system/pinned.json`: bin,
  platform and ref on the TOP ROW above the image, SLA/status far right).
- **Compose, do not fork**: run `node tools/design-mcp/ds.mjs contract "<job>"`
  before any new component (`skill://new-ui-surface`). Mode comes from
  `src/lib/routing/mode-registry.ts` only — never mount `ModeRegion` in a page.

## Reference — the pick list, mirror it

| Pick (exists) | QC (build) |
|---|---|
| `src/app/m/(shell)/pick/page.tsx` → `PickScreen` | `src/app/m/(shell)/qc/page.tsx` → `QcQueueScreen` |
| `src/components/mobile/picker/PickScreen.tsx` (list, `RecordCardMobile`, `useHiddenRecords`, `appMobilePageGroundClass`) | `src/components/mobile/qc/QcQueueScreen.tsx` |
| `PickProgress.tsx` — `ProgressBar` with `segments`, counts only in ARIA | reuse the same header; `current` = units given a verdict today by this tech, `goal` = that + queue length. Generalise `PickProgress` (rename + prop for the ARIA noun) rather than copying it |
| `src/lib/orders/order-card-model.ts` (`orderCardModel` → `RecordCardMobileModel`) | `src/lib/qc/qc-card-model.ts` (`qcCardModel`) |
| `src/lib/picking/pick-walk.ts` (`myPickList`, `nextInWalk`, `pickWalkProgress`) — pure, tested | `src/lib/qc/qc-queue-order.ts` — pure tier + sort, tested |
| `/m/pick/[orderId]` → `PickOrderScreen` | the unit screen that already exists: `/m/u/[id]/qc` (`UnitQcRunner` → `QcUnitRecord` + `UnitQcVerdict`). Open it with `withJobReturn(href, '/m/qc')` so its X returns to the queue |

## Data — where each fact lives (verified against the dogfood DB 2026-09-29)

One row = one unit = one `receiving_unit_stage_facts` row (projection, per unit:
`receiving_line_id`, `receiving_id`, `serial_unit_id`, `unit_uid`,
`qc_state` PENDING | PASSED | FAILED | TEST_AGAIN, `label_state`,
`latest_verdict`, `tested_at`, `primary_support_ticket_id`).

**Actionable** = joined `serial_units` row exists **and**
`serial_units.current_status IN ('RECEIVED','TRIAGED','IN_TEST')` **and**
`qc_state IN ('PENDING','TEST_AGAIN')`. (2,401 facts rows have no serial unit —
nothing to QC per unit; exclude them. Units already STOCKED / SHIPPED are past QC.)

**Tier rules (first match wins):**

| Tier | Rule |
|---|---|
| Returns | `receiving_carton.is_return` OR `receiving_carton.intake_type = 'RETURN'` OR `receiving_line.receiving_type = 'RETURN'` OR `receiving_line.intake_type = 'return'` (vocabulary: `src/lib/receiving/intake-classification.ts`) |
| Repair service | `receiving_line.is_repair_service` OR a `receiving_line_facts` row `fact_kind = 'repair_service'` OR `receiving_line.intake_type = 'repair'` (writer: `src/lib/receiving/add-unmatched-line-client.ts`) |
| Unfound | `receiving_carton.source = 'unmatched'` |
| Local pickup | `receiving_carton.source = 'local_pickup'` OR `receiving_line.receiving_type = 'PICKUP'` (`src/lib/receiving/fulfillment-mode.ts`) |
| Test again | `qc_state = 'TEST_AGAIN'` or `serial_units.current_status = 'IN_TEST'` |
| Quality control | everything else |

Sort keys inside a tier: `receiving_carton.is_priority DESC`,
`receiving_unbox.unboxed_at ASC NULLS LAST`, unit id.

**Dogfood reality today (read-only query, org #1):** 625 actionable units —
Returns **108**, Repair service **2**, Unfound **5**, Local pickup **0**,
Test again **0**, Quality control **510** (71 of them on an `is_priority`
carton). Oldest unbox 2026-05-20. **Only 1 of 625 has a bin**
(`serial_units.current_location`). Empty tiers must still read honestly (no
band for an empty tier, or a quiet "none" — do not invent rows).

## The location gap (decide, then build) — bin-first needs a bin

The owner wants each unit pinned to a location so the tech walks to it. Today
units carry no bin, so the top-row bin would read "No bin" on 624 of 625 rows.
Follow the pick card's own answer: **"No bin" is a verb** — tapping it opens
the existing pair-bin flow (`SetBinSheet.tsx` / `usePairBin.ts` in
`src/components/mobile/picker/`, the phone's pair-location path) and scans the
QC shelf bin onto the unit. Fallback face when no unit bin: the carton's dock
location (`receiving_carton` → `locations` join already in
`GET /api/receiving/[id]`, `loc` alias). Confirm with the owner whether the
QC shelf should be assigned at unbox instead (one scan at unbox is cheaper
than 625 later); build the "No bin → pair" verb either way.

## Card face (`qcCardModel` → `RecordCardMobileModel`)

- **Top row**: bin (or "No bin" verb) · tier badge (`RET` / `RPR` / `UNF` /
  `LCP` / `RETEST` / `QC`) · carton handle `R-{id}` (the sticker the tech
  holds) · far right: unboxed age (`3D`, danger ink past the owner's threshold —
  ask; default 2 days).
- **Body**: product image square left (`RecordSquarePhoto`, same fetcher as
  pick), title (SKU identity law: `resolveSkuIdentityTitle`), then
  `SN {serial} · {SKU}` and `→ Test` / `→ Retest`.
- Tier tone: add a `QC_QUEUE_TIER` face map in `src/design-system/tokens/`
  (sibling of `qc-unit-lifecycle.ts`), tones from `STATE_TONE_CLASSES` only.
- Whole card opens `/m/u/{serialUnitId}/qc?back=%2Fm%2Fqc`.

## Server

- `src/lib/qc/queue.ts` — `listQcQueue(orgId, deps)` with injected `Deps`
  (`skill://domain-unit-test`), one `tenantQuery` (org-scoped, `organization_id`
  on every join), returns rows already tiered + sorted, capped (e.g. 300) with
  the true total. The verified SQL shape is in this handoff's tier table; the
  tier CASE is the source of truth — keep it in ONE place (SQL or the pure
  `qc-queue-order.ts`, not both).
- `src/app/api/qc/queue/route.ts` — `GET`, `withAuth(..., { permission: 'tech.qc_pass' })`
  (same gate as `/api/qc/receiving-lines`), `skill://new-route`. Add the
  route/permission pair to `src/lib/auth/route-permission-manifest.test.ts`.
- Query key + invalidation: after a verdict (`POST /api/serial-units/[id]/test`)
  the queue refetches, so the unit leaves the list and the bar advances.

## Wiring

- Mode: `/m/qc` is already declared `triage, form: true` in the local
  (uncommitted, undeployed) `mode-registry.ts` change — see "State of the
  tree". `/m/qc/line/[id]` (armed `L-` scan) stays under it.
- Nav: a "Quality control" door on `/m/home` / mobile nav pointing at `/m/qc`
  (nav law: a parent and a child never share a name — `ds_nav_names`).
- The scan CTA on `/m/qc` arms QC: it should open `/m/scan?work=qc`
  (`QC_SCAN_HREF`), so scans on this job land on the unit's QC.

## Tests (permanent — behaviour only)

- `qc-queue-order.test.ts`: tier precedence exactly as the owner's order
  (a returned repair-service line is a Return; an unfound TEST_AGAIN unit is
  Unfound), `is_priority` before age inside a tier, null unbox last.
- `queue.test.ts` (Deps): org-scoped params, actionable filter excludes
  STOCKED / SHIPPED / no-serial rows.
- No wiring / snapshot / copy tests.

## Acceptance (observable, on `http://localhost:3050` only — AGENTS.md §1)

1. `/m/qc` at 390×844 as a dogfood staffer: progress bar on top; 108 Returns
   first, then 2 Repair service, 5 Unfound, then Quality control; counts match
   a fresh run of the tier SQL. No horizontal overflow.
2. Each card: bin (or "No bin" verb) top-left, tier badge, `R-{id}`, age right;
   image, title, SN · SKU, `→ Test`.
3. Tap a card → `/m/u/{id}/qc` in triage; its X returns to `/m/qc`.
4. Record a verdict → back on `/m/qc` the unit is gone and the bar advanced.
5. "No bin" → pair a bin by scan → the card shows that bin.
6. `pnpm verify:fast` green (report ambient reds from other sessions as ambient).
7. Screenshots of 1–5 attached. **Do not deploy** — the owner validates first.

## State of the tree (read before editing)

The worktree is shared with at least one other live session (≈130 modified
files outside QC; e.g. `src/lib/background-work/*`, task-board, print
pause/cancel). Never revert or "clean" them. Production is deployment
`dpl_DTQQUc55LPT8YbP5TVvJLBLrJing` = the 16:44 dirty snapshot + the QC scan
flow (carton label `/m/r/{id}/qc`, verdict / ticket / QC-label print). It was
deployed from a reconstructed snapshot, not this tree — **never
`vercel --prod` from this worktree**.

Local, **uncommitted and undeployed** (paused by the owner 2026-09-29, pending
this validation):

- `src/lib/routing/mode-registry.ts` (+test): `*` one-segment wildcard;
  `/m/qc`, `/m/r/*/qc`, `/m/u/*/qc` → `triage, form: true`.
- `src/components/mobile/qc/QcUnitRecord.tsx`, `src/lib/qc/unit-qc-stage.ts`
  (+test), `src/design-system/tokens/qc-unit-lifecycle.ts`, pinned entry
  `QcUnitRecord`: the F-pattern unit record on the carton QC list and unit QC
  header. `UnitQcVerdict` reads `qcUnitStage`; verdict buttons above the note.
- Known nit: with no condition grade, `QcUnitRecord` band 1 echoes the stage
  word ("PAS · Passed"); render nothing there instead.
- Open question the owner raised: this record uses the industrial-record
  tokens (mode-aware faces). Re-check it on the triage route reads as triage
  (sans, readable), and that only the verdict buttons carry the industrial feel.
