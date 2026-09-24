# HANDOFF — Quality control as its own scan type (2026-09-24)

Paste this whole file into OMP from `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

## Operator intent

> "Quality control as a different scan type, not within the repair service in general …
> scanning the unboxing labels itself."

QC is its own scan flow. The tech scans the label that unbox put on the unit, gets that
unit's SKU checklist, and records pass/fail per step. It is **not** a row on the repair
hub (`/m/rs/[id]`). The repair-scoped QC screen built on 2026-09-24 (`/m/rs/[id]/qc`,
`/api/repair-service/[id]/qc`, `useRepairQc`, `RepairQcStepRow`, `src/lib/repair/repair-qc*`)
has been **deleted**. Do not bring it back.

## Working rules

- Probes go to `http://localhost:3050` only (lane-prod). Sign in with `GET /api/auth/staff-picker`
  and then `POST /api/auth/signin` (`x-tenant-slug: usav`, staff "Michael", `deviceKind: 'personal'`).
  Sign-in is rate-limited, so save the storage state once and reuse it. Hide dev chrome with
  `#__cf_switch, nextjs-portal { display:none }` and set `sessionStorage['cf-install-dismissed']='1'`.
- In every probe, `page.route('**/api/**')` must fulfil or abort every non-GET. QC writes go
  to real inventory units.
- Never connect to the DB through the pooled `DATABASE_URL` with session `SET`s. On
  2026-09-24 the pooler leaked `default_transaction_read_only=on`, and app sign-in and
  migrations failed with "cannot execute … in a read-only transaction". For reads, use app GET
  routes, or `BEGIN READ ONLY … ROLLBACK` on `DATABASE_URL_UNPOOLED`.
- Mobile boundary law: `src/app/m/**` and `src/components/mobile/**` may import only from
  design-system, `components/ui`, `components/Icons`, mobile, `lib`, `hooks`, `contexts` and
  `utils`. Check with `node tools/design-mcp/ds.mjs boundary <file>`. The desk checklist UI
  (`src/components/tech/sku-testing/*`) is desk-side: extract shared logic into `src/lib`,
  don't import it.
- Phone grounds are white (`scripts/mobile-ground-guard.ts`, baseline 42). The shell already
  renders the one `<main>` (`MobileRouteShell`), so screens use `<div>`.
- Do **not** add a third Station Composer mode. `STATION_COMPOSER_MODES = ['unbox','ticket']`,
  and `src/design-system/pinned.json` says "Do not invent a third mode". QC is a **scan
  type / scan card**, not a composer mode.
- Done = `pnpm verify:fast` green, except errors in files you did not touch.

## What already exists (reuse, don't fork)

**Labels unbox puts on a unit:**
- Unit/product label: `printProductLabel` (`src/lib/print/unitLabelCore.ts`) →
  `encodePrintMatrix({ kind: 'unit' })` (`src/lib/qr/platform-link.ts`). It encodes a GS1 Digital
  Link `…/01/{gtin}/21/{serial}` or raw `(01)…(21)…`, a bare `U-{serial|id}` (`serialUnitHandle`,
  `src/lib/barcode-routing.ts`), or a minted `unit_uid` `{SKU}-{YYWW}-{SEQ6}`. All of these
  resolve to **`serial_units`**. `GET /api/serial-units/[id]` cascades id → normalized_serial → unit_uid.
- Receiving-line label `L-{receivingLineId}` (`printAsListedLabel`) resolves to `receiving_lines` (`/m/l/{id}`).
- Carton label `R-{receivingId}` resolves to the carton (`/m/r/{id}`).

**Scan pipeline:** `routeScan(raw)` (`src/lib/barcode-routing.ts`; `ScanType` includes
`'serial-unit'` and `'receiving-line'`) → `useScanDispatch()` (`src/hooks/useScanDispatch.ts`,
`OBJECT_STATE_CLASSES`) → `dispatchScan()` (`src/lib/scan/dispatch-table.ts`). `ScanCard`
**already declares `'qc'`**, but today only as rule `qc-open` for `handling-unit`/`sscc` with
`qcOpen`. `landScanIdentify()` (`src/lib/scan/identify-land.ts`) decides identify / intake /
settle. Tests: `src/lib/scan/dispatch-table.test.ts` and `object-state.test.ts`.

**QC model:**
- Templates: `qc_check_templates` (`src/lib/drizzle/schema.ts`). These are published rows for
  `sku_catalog_id`, plus category-shared rows (`sku_catalog_id IS NULL AND category = sc.category`).
  Each row has a `value_kind` of BOOLEAN/PERCENT/NUMBER/ENUM/TEXT, plus `pass_min`/`pass_max`
  and `failure_mode_id`.
- Results: `tech_verifications`, unique on `(source_kind, source_row_id, step_type, step_id)`
  (`ux_tech_verifications_step`). Writes go through `upsertVerification`, and verdicts come from
  `deriveStepPassed` (`src/lib/neon/sku-catalog-queries.ts`). `verified_at = NOW()` and the staff
  member comes from the session.
- **The existing endpoint is the write path:** `GET/POST /api/serial-units/[id]/checklist`
  (`tech.qc_pass`; body `QcResultBody` in `src/lib/schemas/qc-checks.ts`). A fail auto-tags a
  failure mode (`tagUnitFailure`) and a pass resolves it. There is also a bulk route at
  `…/checklist/bulk`. **No new write route** for unit QC.
- Desk runner: `ChecklistSection` / `ChecklistStepRow` / `StepValueControl`
  (`src/components/tech/sku-testing/`), mounted in `LineTestingTabbedCard` (Unbox → Line Testing).
  **There is no mobile runner yet.** `/m/u/[id]` shows only unit facts, Pair and Move.
- The unit's SKU is `serial_units.sku_catalog_id`. Titles go through `resolveSkuIdentityTitle`
  (`src/lib/sku/sku-identity-law.ts`). Never infer a SKU from similarity.

**Data reality (read-only, 2026-09-24):** real published templates exist only on
`00039-BK` (4 steps), `00102-BK` (4) and `00134-BK` (1), plus E2E fixtures. The probe has to
find a unit on one of those SKUs, or mock the checklist GET with the real 00039-BK template
(`GET /api/sku-catalog/174/qc-checks`).

## Tasks

### 1. Decide the entry point (ask the operator first; it's one question)
The unit label is per unit (`serial_units`). The `L-` line label names a receiving line that
can hold several units. Ask: *"Is the QC label the unit label (U-/GS1/unit UID), the L- line
label, or both? For L- with several units, pick the unit, or QC the line's first unit?"*
Default, if no answer: unit label only. An `L-` scan then lists the line's units to pick from.

> **Built 2026-09-24 — on the ONE scan kernel, not a `/m/qc` screen.** A second scan door is
> what `/m/unbox` was deleted for. QC arms the kernel: `/m/scan?work=qc` (`QC_SCAN_HREF`,
> `QC_SCAN_SESSION`). `useScanDispatch().resolve(raw, armedSession)` → `dispatchScan` rows
> `qc-unit` / `qc-line` (armed by `work: 'qc'`) → `landScanIdentify`: a unit label lands on
> `/m/u/{key}/qc`, a line label on `/m/qc/line/{id}` (pick a unit), anything else lands as it does
> unarmed. Unarmed, a unit label (any frame, GS1 included) lands on the unit hub `/m/u/{key}`,
> whose "Quality control" door opens the same runner. The `/m/u/` → `/serial/` proxy rewrite is
> gone; `/serial/[id]` stays the desk unit page.

### 2. QC scan type
- Add a **QC scan** entry: a `/m/qc` scan screen (scan kernel like `/m/scan`, `ModeRegion`, white
  ground) whose only job is QC. The scan resolves through `routeScan`. Accepted: `serial-unit`
  (and `receiving-line` if task 1 allows it). Anything else gets an honest refusal naming what
  was scanned.
- Put the route into the scan-card system instead of beside it. Add a dispatch rule that opens
  card `'qc'` for `serial-unit` when the session is armed for QC, and keep the existing
  `qc-open` LPN rule. Extend `dispatch-table.test.ts` for the new row and its precedence.
- Register it where mobile scan types / nav live (`src/lib/nav/lanes.ts`; nav-name law: a parent
  and child never share a name, and icons go at the parent level only). Check with `ds_nav_names`.

### 3. Mobile QC runner — `/m/u/[id]/qc`
- Reads `GET /api/serial-units/[id]/checklist`. For each step, the phone records pass/fail
  (plus a reading for NUMBER/PERCENT/ENUM/TEXT and an optional note) through
  `POST /api/serial-units/[id]/checklist`. Show the server verdict with who and when; never the
  phone clock.
- Extract the step-value logic the desk `StepValueControl` / `ChecklistStepRow` use (pass bands,
  value kinds) into `src/lib`, and have **both** desk and phone use it. Don't write a second copy.
- Summary at the top: SKU title (`resolveSkuIdentityTitle`), unit serial, a
  passed / failed / open tally and the last result stamp. Empty states when the unit has no SKU,
  the SKU is not in the catalog, or no template is published. Each one says why.
- After a scan, the runner opens on the unit and returns to the scan field for the next unit
  (continuous QC).

### 4. Unit page door
`/m/u/[id]` gets one row, "Quality control", with its meta line ("2 passed · 1 failed · 1 open
· Michael, Sep 24 4:41 PM" / "No checklist for 00102-BK"). It opens `/m/u/[id]/qc`.

## Checks
- Unit tests: dispatch precedence, and the extracted step-verdict logic (band edges,
  explicit vs derived pass).
- Probe at :3050 with all non-GET mocked. Scan a real `U-` handle, then the runner, then record
  a fail with a note and a pass. Capture the POST payloads (`{ stepId, passed, valueNum?, notes? }`).
  Check that the tally renders from the mocked response, and that a non-unit scan is refused.
  Screenshots go to `/tmp/qc-scan-*.png`.
- `pnpm verify:fast`.
