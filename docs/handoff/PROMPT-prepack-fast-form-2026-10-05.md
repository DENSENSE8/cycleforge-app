# Prompt — Prepack fast form: serial-first, two columns, Motion choreography (2026-10-05)

Paste this whole file as the first message of a fresh session in `~/Projects/cycleforge-lanes/prod`.

---

## Goal

Replace the prepack wizard with one fast form. The operator finds a product on a rack, gathers its
items, scans the serial first, confirms the product, sets how many labels to print and the condition
of each, confirms the contents (pairing anything missing inline), and prints. One screen, no modes,
no photo requirement, no layout shift.

This is a **clean cutover**. The current wizard is not patched; it is replaced and its dead parts are
deleted.

## Operator rulings (binding)

1. **Quantity = number of labels = number of packages.** Each package has its own condition and its
   own label.
2. **Serial is optional** on every package. A package without a serial gets a CycleForge `U-…`
   handle. A package may still carry 2+ serials (Bose Companion 2 Series III: two speakers, two
   serials, one package).
3. **Refurb source** (none / manufacturer / seller / Amazon Renewed) hides behind **More** on each
   package row. Default: none.
4. **Right column is always displayed.** At rest it shows the hint:
   "Scan the serial number to identify the product. If the serial number is not in the system, pick
   the product manually." with the product browser under it.
5. **Product browser** = `TabSwitch` slider **Recently printed | All products** + a combobox that
   searches SKU, title, and every identifier (ASIN, FNSKU, UPC, EAN, GTIN, MPN, platform IDs). Each
   result: square image, title, SKU underneath.
6. **Selected product** renders with the same square image, title and SKU as the browser — never a
   small single row. Left column carries an Edit icon that flips the right column back to the
   browser.
7. **Conditions offered:** New, Like new, Refurbished, Used A, Used B. **Used C and Parts are gone**
   from prepack (the DB enum keeps them). Choosing a condition causes **zero layout shift**.
8. **No photo requirement.** Remove the serial-label and condition photo handoff and the server gate.
   Packers photograph at pack-scan time.
9. **Inline pairing.** If the product has no contents list, no child-SKU pairing, or no manual, the
   operator resolves it inside the form. A paired manual must print for packers when they scan the
   QC label.
10. **Do not test.** The operator tests by hand. No browser, Playwright, `scripts/e2e-*`, or `:3050`
    probes. Do not create test units. `pnpm verify:fast` (lint + typecheck) is still required.

## Current state (read before editing)

- **Wizard:** `src/features/prepack/PrepackFlow.tsx` (1033 lines, 16 `useState`s). Modes Single
  (`unit → facts → evidence → contents → label`) and Bulk (`product → unit → evidence → contents →
  label`). Siblings: `PrepackProduct.tsx` (`ProductPicker`, `ProductCard`), `PrepackPackageParts.tsx`
  (`PackageSerialList`, `PackageEvidenceList`, `ContentsChecklist`), `prepack-ui.tsx`
  (`ProductThumb`, `PrepackChoiceTiles`), `PrepackUnitFacts.tsx`, `PrepackHandoff.tsx`,
  `prepack-client.ts`, `serial-entry.ts`.
- **Desk mount:** `src/components/inventory/qc-labels/QcLabelsLedger.tsx` (`task=prepack` branch):
  three-column grid with `PrepackProductsColumn.tsx`, `MobileFirstFrame` + `PrepackFlow`,
  `PrepackPrintedColumn.tsx`. Desk serial entry: `PrepackSerialField.tsx`.
- **Phone mount:** `src/app/m/(shell)/prepack/page.tsx` → `MobilePrepackFlow.tsx` →
  `PrepackFlow surface="mobile"` with `src/components/mobile/prepack/PrepackSerialScan.tsx`.
- **URL:** `prepackHref` / `PREPACK_QUERY_KEYS` / `PrepackStepId` in `src/lib/nav/route-tree.ts`
  (nodes `prepack-mobile`, `prepack-desktop`); parsed by `parsePrepackRouteState`
  (`src/lib/prepack/url.ts`).
- **Search:** `searchPrepackCatalog` (`src/lib/prepack/server.ts:29`) matches SKU, title, UPC, EAN,
  GTIN, MPN only. `src/app/api/sku-catalog/search/route.ts` already joins `sku_platform_ids` and
  `catalog_external_ids` (ASIN, FNSKU, …). `listRecentPrepackProducts` (`server.ts:400`).
- **Serial lookup:** `GET /api/prepack/unit?scan=` → `loadPrepackUnit`; unknown serial →
  `POST /api/prepack/unit` → `createPrepackUnit`. Refusals: `prepackUnitRefusal`
  (`prepack-client.ts`) — shipped, on an open order, scrapped, in another package.
- **Save:** `POST /api/prepack/package` → `finishPrepackPackage` (`src/lib/prepack/finish.ts:58`).
  One condition for every unit (`finish.ts:175`). Photo gate: `missingPackageEvidence` /
  `packageEvidenceRefusal` (`finish.ts:151-155`) fed by `loadPrepackEvidence` (`server.ts:428`).
  2+ serials → `createSealedPackageTx` mints a `KIT-…` PREBOX manifest.
- **Print:** `qcLabelWireKey` → `printQcLabelStationJob` (this device) or
  `printStations.sendQcLabel` (station). Face: `qcLabelFaceInput` (`src/lib/print/printQcLabel.ts`).
- **Contents / pairing data:** `sku_kit_parts` (name, type REMOTE|CABLE|ACCESSORY|MANUAL|PACKAGING,
  qty, `document_url`), `sku_relationships` (parent/child SKU), `serial_unit_prepack_contents`
  (per-unit decisions). `loadPrepackKit` (`server.ts:151`).
- **Paperwork packers print:** pack scan → order → `listOrderPaperworkForPrint`
  (`src/lib/manuals/order-manuals.ts:316`) reads **`product_manuals`** with precedence order >
  item_number > sku (`src/lib/manuals/paperwork-pairing.ts`). SKU link writer:
  `linkManualToSkuInTx` (`order-manuals.ts:617`) + `settleManualRepair`.
  **`sku_kit_parts.document_url` is NOT read by pack print.** Inline manual pairing writes
  `product_manuals`; never `document_url`.
- **Phone handoffs:** `src/lib/realtime/prepack-serial-request.ts` (serial request, serial selected,
  catalog photo request); receiver `PrepackSerialRequestReceiver.tsx`; photo capture via
  `unitPhotoCaptureHref` / `useUnitPhotoRequestPublisher`.
- **Motion:** `motion` 12 + `motion-plus` installed. Motion+ only through
  `src/design-system/motion/plus.ts` (exports `AnimateNumber`, `AnimateText`, `Typewriter`,
  `useMagneticPull`; lint-enforced). Presets: `src/design-system/foundations/motion-presets.ts`
  (`motionTransition`, `motionPresence`, `motionTransitionMobile`, `motionPresenceMobile`), springs in
  `src/design-system/motion/tokens.ts`, roles in `roles.ts` + `useMotionRole`. Height:
  `CollapseItem` (`src/design-system/components/Collapse.tsx`). Slider: `TabSwitch`.

## Target

### Layout

- **Desk (`/inventory/qc-labels?task=prepack`):** two columns, edge to edge, 1px rule between.
  Left = form. Right = context column (always rendered). `PrepackProductsColumn` and
  `PrepackPrintedColumn` are deleted.
- **Phone (`/m/prepack`):** one column. The context column becomes a sticky top card (hint →
  product → label preview). The product browser opens as a bottom sheet
  (`motionPresenceMobile.sheet`). Every verb stays completable on the phone.
- Shared code lives in `src/features/prepack/`; serial entry stays surface-specific
  (`PrepackSerialField` desk, `PrepackSerialScan` phone) per the mobile/desktop boundary.

### Left column — sections appear in order; a finished section collapses to a one-line summary
with an Edit icon

1. **Serial** — desk: floating-label `TextField` "Serial number" + "Scan with phone"; phone: camera
   scan. "No serial" link skips to Product. Outcomes:
   - **Matched** → product loads from the unit; right column switches to preview.
   - **Not in the system** → hint changes to "Not in the system. Pick the product." and the browser
     takes focus. The serial is kept and created on save.
   - **Refused** (shipped / on an order / in another package) → one sentence with the fix; nothing
     else changes.
2. **Product** — same identity card as the browser (square image, title, SKU). Edit icon → right
   column back to the browser with this product highlighted.
3. **Quantity** — stepper (− / value / +), typed entry allowed, min 1. Changing it adds/removes
   package rows.
4. **Packages** — one row per package:
   - serial chip(s) (row 1 prefilled with the scanned serial; "Add serial" for pairs);
   - condition: one row of **five equal fixed-width cells**; selection is a sliding indicator, never
     a size, border-width, or icon insertion change;
   - **More** → refurb source (default none).
   - The first condition chosen copies down to rows the operator has not touched.
5. **Contents** — the product's parts list, every part checked Included by default; tap to mark
   Missing. If the product has **no parts list, no child-SKU pairing, or no manual**, a
   **Resolve pairing** block shows inline:
   - add a part: name, type, qty, optional child SKU (same identifier combobox) →
     `sku_kit_parts` (+ `sku_relationships` when a child SKU is chosen);
   - attach the manual: pick an existing `product_manuals` row or upload a file → linked to this
     `sku_catalog_id` through the existing writers.
   - Pairing saves immediately (it is product data, not package data) and survives an abandoned form.
6. **Print N labels** — one primary `Button`, label carries the live count. Enter submits from any
   field once the form is complete.

### Right column — one region, state follows the form

| Form state | Right column shows |
|---|---|
| Nothing entered | Hint + browser (Recently printed / All products + combobox) |
| Serial not in system | Hint text changes; browser focused |
| Product chosen | Large product hero (image, title, SKU) + label preview deck |
| Quantity / condition change | Deck shows N label faces; each face shows its condition |
| Contents / pairing | Contents list with Included / Missing; "Manual paired — packers get *title*" chip |
| Edit product | Back to browser, current product highlighted |
| Printing → printed | Deck cards leave one by one as jobs confirm; then reset to hint for the next product |

## Motion choreography (binding intent; exact presets named)

Rules: transform + opacity only, except height through `CollapseItem`. No animation gates input — a
scan or keypress commits in the same turn and the motion catches up. Reduced motion → crossfade or
0 ms via `useMotionRole` / the reduced-motion bridge. No new springs or durations; add a named
preset in `motion-presets.ts` if one is truly missing.

1. **Section progression (left).** Finished section collapses into its summary row: `CollapseItem`
   height + `layout` on the stack (`motionTransition.cardExpansion`). The next section enters with
   `motionPresence.workbenchPane` / `motionTransition.workbenchPaneMount`. Vertical accumulation, not
   a sideways wizard slide — context above stays visible.
2. **Serial verdict.** Match → `motionTransitionMobile.scanSuccess` pulse on the field; refusal →
   `scanFailure` shake. "Not in the system" is neutral, not an error: status text morphs
   (`motionTransition.liveValueMorph`).
3. **Hint microcopy.** Motion+ `AnimateText` per-word blur-in when the hint changes (rest →
   not-in-system → matched). Short; never `Typewriter` (it delays reading).
4. **Browser → preview morph.** The chosen result card and the preview hero share
   `layoutId={\`prepack-product-${id}\`}` inside a `LayoutGroup`; the card flies from its list row
   into the hero on `motionTransition.photoHeroMorph`. The rest of the browser leaves via
   `AnimatePresence mode="popLayout"` with `motionRole.swap.focus`. Edit plays it in reverse: the hero
   shrinks back into its row. A serial match (no row clicked) mounts the hero with `swap.focus`.
5. **Tab slider.** `TabSwitch` pill (`sliderIndicator`). The list underneath slides by direction
   with the existing tab pager variants (`motionTransition.tabPager`, reduced → `tabPagerReduced`).
6. **Search results.** Rows enter with `motionPresence.findListRow`, cascading by the
   find-list row stagger; as the query narrows survivors reflow with `layout` on
   `motionTransition.findListGlide`.
7. **Quantity.** Motion+ `AnimateNumber` in the stepper and in "Print N labels" (`trend` follows
   direction). Right-column deck: label faces stacked with a per-index `y`/`scale` offset; add/remove
   via `AnimatePresence mode="popLayout"` on `motionTransition.quantityBump`.
8. **Condition.** Selected indicator shares a `layoutId` per row and glides between the five fixed
   cells on `motionTransition.armedTrack`. The matching label face's condition text morphs
   (`liveValueMorph`). Cells never resize.
9. **Contents and pairing.** Include/Missing toggles acknowledge with `motionRole.feedback.hitMarker`.
   Resolve pairing opens with `CollapseItem` on `findListPanelOpen` / `findListPanelClose`; saved
   parts enter with `findListRow` stagger on both columns; the "Manual paired" chip enters with
   `motionPresence.statusMessage`.
10. **Print.** Button shows "Printing 1 of N" via `AnimateNumber`. Each deck card leaves as its job
    confirms with the `motionPresence.printBanner` exit shape. Then the form resets at scan cadence
    (`motionRole.swap.scan` — zero exit) with focus back in Serial.

Run `ds_critique` on every touched UI file; check `docs/design-system/CONSOLIDATION_LEDGER.md` before
adding any wrapper.

## Server and contract changes

- **Search:** prepack uses the shared identifier search (`/api/sku-catalog/search` or its lib
  function); it must return an image URL per result — add it there if missing. Delete
  `searchPrepackCatalog` and `/api/prepack/catalog` search once no caller remains.
- **Recently printed:** distinct products from printed QC labels, newest first (one row per
  `sku_catalog_id`). Replaces `listRecentPrepackProducts` for that tab; delete whatever loses its
  last caller.
- **Save:** `POST /api/prepack/package` takes
  `{ skuCatalogId, packages: [{ serials: string[], condition, provenance }], contents }`.
  - One transaction for all N packages. Unknown serials are created (prepack origin); a package with
    no serial gets a `U-…` unit; 1 serial → unit label, 2+ → PREBOX manifest (existing path).
  - Per-package condition and provenance.
  - Photo gate removed (`missingPackageEvidence`, `packageEvidenceRefusal`, the `loadPrepackEvidence`
    call). Shipped / on-order / other-package / catalog-mismatch refusals stay.
  - Returns N print units in order; the client prints N labels.
- **Conditions:** `PREPACK_CONDITIONS` (`src/lib/prepack/types.ts`) = the five. A matched unit
  graded Used C / Parts prefills nothing; the operator picks.
- **URL:** drop `mode`, `step`, `condition`, `provenance` from the prepack contract; keep only what
  restores the form on reload (`catalogId`, `unit`, `serialRequestId`). Update `PrepackRouteState`,
  `PREPACK_QUERY_KEYS`, `prepackHref`, `parsePrepackRouteState`, both route-tree nodes' `query` and
  `note`, and every caller.
- **Phone handoffs:** keep the serial request ("Scan with phone"). Delete the prepack photo capture
  path and the catalog-photo request event if prepack was their only user.

## Delete list (clean cutover)

Mode chooser, `PrepackStepId` step machine, evidence step, `PackageEvidenceList`, prepack photo
handoff, `PrepackProductsColumn.tsx`, `PrepackPrintedColumn.tsx`, `MobileFirstFrame` wrapper on the
desk if the new layout does not need it, `ProductPicker`/small-row `ProductCard` once replaced,
`PrepackChoiceTiles` if nothing else uses it, `scripts/e2e-prepack.mjs` (drives the deleted wizard;
the operator tests by hand). Do not delete the 26 `E2E-PP-*` units of 00326-BK.

## Delivery

One owner session (you). After you freeze the contract (save payload, search result shape, URL
keys, file list), spawn three subagents in one batch:

- **A — Search + Recently printed** (server + API only).
- **B — Save** (`finish.ts`, `/api/prepack/package`, `types.ts`, unit creation, gate removal).
- **C — Pairing** (parts / child SKU / manual writers + API, reusing `linkManualToSkuInTx` and the
  existing manual upload path).

You build the UI and motion yourself and integrate. No subagent runs a browser or a lane.

## Constraints

- `AGENTS.md`: never start, stop or restart a lane; never run `next dev`; this task runs **no**
  runtime checks at all.
- Design-system primitives only (`Button`, `TextField`, `TabSwitch`, `DropdownMenu`, …); no raw
  `<button>`, `<input>`, `<select>`.
- URLs only through `route-tree.ts` builders; domain words via `ds_vocabulary`.
- Migrations (if any): hand-written idempotent SQL per `db-migration-author`; ask before applying.
- No shims; migrate every caller of a changed signature.

## Done

- `pnpm verify:fast` green on your diff (name failures outside it).
- `ds_critique` clean on every new or changed UI file.
- Final report: files added / changed / deleted, the save payload, the search source chosen, any
  migration, and what the operator should click through on `/inventory/qc-labels?task=prepack` and
  `/m/prepack`.
