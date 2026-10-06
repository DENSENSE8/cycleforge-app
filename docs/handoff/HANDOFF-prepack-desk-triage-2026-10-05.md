# Handoff — prepack desk triage, multi-serial packages, no Unbox gate (2026-10-05)

Paste this whole file as the first message of a fresh session in `~/Projects/cycleforge-lanes/prod`.

---

## Goal

Make prepack a fast, enforced triage loop on the desk and the phone:
find a product, load it into the form, attach one or more serials (typed on the desk, scanned on the
phone), grade, photograph, mark contents, store, print — with no avoidable blocker.

## Current state (verified 2026-10-05 — read these before editing)

- **Shared form:** `src/features/prepack/PrepackFlow.tsx`, prop `surface: 'mobile' | 'desktop'`.
  Modes Single (`unit → facts → evidence → contents → location`) and Bulk
  (`product → unit → evidence → contents → location`). URL state is written with
  `prepackHref(surface, state, keep)` (`src/lib/nav/route-tree.ts`) and parsed by
  `parsePrepackRouteState` (`src/lib/prepack/url.ts`).
  - Sibling files: `PrepackProduct.tsx` (`ProductPicker`, `ProductCard`), `PrepackLocationField.tsx`,
    `PrepackHandoff.tsx` (phone reply screens), `prepack-client.ts`, `prepack-ui.tsx`.
- **Unit step:** uses `MobileV2ScanInput` (`src/components/mobile/v2/scan/MobileV2ScanInput.tsx`) on
  both surfaces, plus "Scan with phone" on the desk.
- **Mode chooser:** the `if (!mode)` branch of `PrepackFlow`. Its wrapper is
  `flex-1 flex-col justify-center`, so the title "How many units are you labeling?" sits mid-screen.
- **Desk mount:** `src/components/inventory/qc-labels/QcLabelsLedger.tsx`, the `if (printing)` branch.
  - Layout: grid `xl:grid-cols-[minmax(16rem,1fr)_minmax(25rem,34rem)_minmax(16rem,1fr)]`.
  - Both asides render the same rows, `orderedRows.slice(0, 8)` (printed QC label rows): left
    "Products · Recently labelled in Quality Control", right "Recently printed".
  - The centre is wrapped in `MobileFirstFrame` (`src/design-system/components/MobileFirstFrame`).
    On the 1440 px desk you can see gaps between the three columns.
- **Find:** the sidebar search writes `?q=`; `src/app/inventory/qc-labels/page.tsx` passes it to
  `listQcLabels` (`src/lib/labels/qc-labels-queries.ts`), which filters printed labels. Page config:
  `src/lib/context/pages.ts` → `'qc-labels'`.
  - The catalog search already exists: `GET /api/sku-catalog/search?searchField=catalog&q=`
    (`searchFromCatalog`). It matches SKU, title, UPC, EAN, GTIN, MPN, platform ids and external ids (ASIN, FNSKU).
- **"ALL":** set by `src/lib/sidebar-navigation.ts` (~line 1553: `{ id: 'all', label: 'ALL', … }`).
  The ledger copy "Clear Find or choose ALL." also paints it.
- **Unbox gate:** `loadPrepackUnit` (`src/lib/prepack/server.ts`) requires
  `EXISTS serial_unit_provenance … origin_type = 'RECEIVING_LINE'` or an `inventory_events` row
  with `receiving_line_id`. `src/app/api/prepack/unit/route.ts` returns 404 "This serial was not
  acknowledged at Unbox".
  - The canonical find-or-create writer for a serial is `recordUnitEvent`
    (`src/lib/inventory/unit-events.ts`; needs `originSource`).
  - Status rules live in `src/lib/inventory/state-machine.ts`.
- **One serial per prepack today.** `POST /api/prepack/[id]` (`src/app/api/prepack/[id]/route.ts`)
  prepacks exactly one `serial_units.id`. In one transaction it:
  - locks the unit;
  - refuses a shipped or order-allocated unit;
  - checks the catalog match;
  - gates on typed evidence (`loadPrepackEvidence`);
  - writes `serial_unit_prepack_contents`;
  - stores the unit through PUTAWAY/MOVED (`transition` / `recordInventoryEvent`);
  - sets `prepacked_at`, `condition_grade`, `refurb_provenance`.

  The client then prints one 2×1 label: `printQcLabelStationJob` / `printStations.sendQcLabel`,
  face `productLabelFace` (`src/lib/print/unitLabelCore.ts`), scannable handle `qcLabelHandle`
  (`src/lib/labels/qc-label-row.ts`).
- **Existing grouping concepts** (check these before adding a table):
  - handling units `H-…` (`src/lib/neon/handling-unit-queries.ts`);
  - `label_manifests` (`KIT-…`, kinds `PREBOX | KIT | MASTER_CARTON`, states `OPEN → SEALED → DISSOLVED`).
- **Phone serial handoff:** `src/lib/realtime/prepack-serial-request.ts` (request / ack / reply by
  request id). The phone reply screen `PrepackSerialHandoff` returns one serial per request.
- **Browser proof:** `scripts/e2e-prepack.mjs` (runs against :3050, never clicks Print).

## Requirements

1. **No gaps between the desk columns.** The three desk columns (Products · form · Recently printed)
   sit edge to edge, separated only by a 1px rule, with no gap or margin between them at ≥ xl.
2. **Mode title at the top.** "How many units are you labeling?" is the title at the top of the task
   with the Single / Bulk choices under it, on both surfaces. It is not vertically centred.
3. **Sentence case.** The saved view reads "All", not "ALL", in the sidebar and in every copy string
   that names it. Audit the prepack and QC labels surfaces for other all-caps labels.
4. **Separate serial entry per surface.**
   - **Desk:** a floating-label `TextField` labelled "Serial number" for typed entry, plus
     "Scan with phone". There is no camera or scan-station input on the desk.
   - **Phone:** keeps the camera scan input (`MobileV2ScanInput`).
   - The two are different components, and they respect the mobile / desktop boundary: mobile code
     lives in `src/components/mobile/**` or `src/app/m/**`, desktop code never imports it, and
     neither imports the other.
5. **Multiple serials per package, in Single mode too.** One prepacked package can carry N serials,
   for example a Bose Companion 2 Series III pair, where each speaker has its own serial.
   - The operator adds, sees and removes serials in the unit step. "Scan with phone" can return
     more than one serial into the same package.
   - Every serial is validated: not shipped, not on an open order, not already in another open
     package, same catalog product as the package (a mismatch is refused, never silently changed).
   - Finish prepacks all of them atomically and prints exactly one package label.
6. **No Unbox gate.** A serial never seen at Unbox is accepted.
   - Prepack creates the unit through `recordUnitEvent` with a prepack origin and stamps the
     package's catalog product.
   - Shipped and allocated refusals still apply.
   - The API never returns "not acknowledged at Unbox" again.
7. **Different side columns.**
   - Left column, **Products**, lists catalog products. Clicking a product loads it into the form:
     in Bulk it sets the run product; in Single it pre-selects the product the serials must match.
   - Right column, **Recently printed**, lists printed package labels. Clicking a row loads its
     SKU / product into the form.
   - The two columns never render the same row set.
8. **Find drives Products.** Sidebar Find (`F`, `?q=`) filters the Products column through the
   catalog search (SKU / UPC / MPN / title). Typing a SKU then clicking the top result updates the
   middle form within one click.
9. **No avoidable blocker remains.** Each refusal states its fix in one sentence. The only hard
   gates are:
   - shipped or allocated unit;
   - catalog mismatch;
   - required typed evidence;
   - contents decisions;
   - a known location.

## Open decisions (state your choice and evidence before coding)

- **Multi-serial data model.**
  - Recommended default: reuse an existing grouping instead of a new table. Either a
    `label_manifests` row of kind `PREBOX`, or a handling unit, holding N `serial_units`.
    `prepacked_at`, condition, provenance, contents and location are stamped on every member.
    Typed evidence is attached once to the package entity, or to each member — say which.
  - Before choosing, read `label_manifests` (migration `2026-07-06b`), the handling-unit queries,
    and how picking resolves a scanned label (`src/lib/picking/pick-scan-unit.ts`). The package
    label must still resolve at pick time to every serial in it.
  - A new table is acceptable only if neither existing model fits; say why.
- **Package label.** Recommended default: one 2×1 label whose scannable code is the package handle,
  printing the SKU, condition and serial count, with one print job per package. Confirm that
  `label_print_jobs` can reference the package.
- **Serials first seen at prepack.** Choose `originSource` and the starting status, then the
  transition into STOCKED via the existing PUTAWAY path. Show the `state-machine.ts` rows that
  allow it.
- **Products column when Find is empty.** Recommended default: products prepacked or received
  recently (distinct SKUs), not printed labels. Say which query.

## Constraints

- `AGENTS.md`:
  - Lane lifecycle is operator-only. Never start, stop or restart a `cycleforge-lane@…` unit and
    never run `next dev`.
  - Test only through `http://localhost:3050`. A dead lane is reported, not fixed.
- **Design-system primitives only.** No raw `<button>`, `<input>`, `<select>` or `<kbd>`. Use
  `Button`, `TextField`, `DropdownMenu`, `HoverTooltip`. Run `ds_critique` on every touched UI file.
- **URLs only through `src/lib/nav/route-tree.ts` builders.** Keep `prepackHref` as the single
  writer for both `/m/prepack` and `/inventory/qc-labels?task=prepack`.
- **Sidebar-controls contract.** Search and filters live in the left contextual sidebar; Find stays
  the source for the Products column.
- **Migrations.** Hand-written, idempotent SQL in `src/lib/migrations/`, per
  `.claude/skills/db-migration-author/SKILL.md`. Ask the operator before applying.
- **No shims.** Migrate every caller of a changed signature. Delete source-text tests instead of
  re-pinning them.

## Acceptance (observable)

1. **Desk at 1440×960** (`/inventory/qc-labels?task=prepack`): there is no horizontal gap between
   the column boxes. Measure the bounding boxes: right edge of one column = left edge of the next.
2. **Mode chooser on both surfaces:** the title's top is within the first 120 px of the task area.
3. **Saved view:** the sidebar view and the empty-state copy read "All".
4. **Serial entry:**
   - Desk: the unit step has a floating-label "Serial number" `TextField` and "Scan with phone",
     and no element from `MobileV2ScanInput`.
   - Phone: `/m/prepack` shows the camera scan input.
5. **Two serials, one package:**
   - In Single mode, add two serials of the same SKU (one may be brand new to the database).
   - Finish produces one package, both units STOCKED at the chosen location with PUTAWAY/MOVED
     events, and exactly one `label_print_jobs` row.
   - A pick scan of that label resolves to both serials.
6. **Unknown serial:** `GET /api/prepack/unit?scan=<never-seen serial>` no longer 404s with the
   Unbox message, and the serial can be added and finished.
7. **Side columns:**
   - The Products and Recently printed lists contain different rows.
   - Clicking a product in Products sets the form's product; clicking a Recently printed row sets
     the form's product to that row's SKU.
8. **Find:** typing a SKU in Find narrows Products to that SKU within one debounce, and one click
   loads it.

## Verification

- `pnpm verify:fast` is green for every file you touched. Other people are editing this worktree,
  so name any failures outside your diff.
- Update `scripts/e2e-prepack.mjs` to prove acceptance items 1–8. A real Finish/Print may run only
  on a throwaway test unit you create through the new unknown-serial path; report its id.
- Run `ds_critique` on each new or changed UI file and fix what it flags.
- Final report: the decisions you made for the open questions with evidence, files changed,
  migrations written / applied, and exactly what was exercised on :3050.
