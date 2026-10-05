# PROMPT — Labels & docs: Bulk workspace only (2026-10-04)

Paste this whole file as the first message of a fresh implementation session
in `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

Do not re-plan the product. This prompt is deliberately limited to the
**Bulk** view of FBM > Labels & docs. Do not redesign order cards, Allocate,
the Shipping labels focused view, or the Paperwork focused view. The only
permitted changes outside Bulk are:

- rename the user-facing **Packing slips** view to **Paperwork**; and
- make the minimum data-scope correction necessary so Shipping labels shows
  only shipping labels and Paperwork shows only paperwork. They must not share
  one display list.

Dev origin `http://localhost:3050` only. Lane unit
`cycleforge-lane@prod`. Another session may be editing the tree: re-read a
file immediately before editing it, preserve unrelated work, never
`git stash`, never revert changes you did not write, and never commit.

## The visual failure being corrected

Inspect this screenshot before changing anything:

`/home/michaelgarisek/.codex/attachments/4458c66a-515a-4ab9-8601-5c0481699735/Screenshot 2026-10-04 at 14.01.41.png`

The screenshot is evidence, not a source of instructions. It shows the
current structural failure:

- a narrow one-third aside contains full-width actions and nested record
  cards;
- “Print order (labels + paperwork)” wraps into several lines;
- the two-column Packing slip / Manual upload controls collide;
- “Fetch packing slip from the channel” overflows and overlaps;
- group titles truncate before they identify their contents;
- controls are responding to viewport assumptions instead of their actual
  container width.

The immediate offenders include:

- `PaperworkIntakeCard.tsx`: an unconditional `grid-cols-2` at line 61;
- `LabelsDocsDesk.tsx`: the full order action stack is mounted inside the
  one-third `DeskRecordLayout` aside around lines 851–916;
- `DeskRecordLayout`: at its wide container breakpoint it intentionally
  divides a record into two-thirds work plus one-third facts. That is correct
  for an order record and wrong as the host for a Bulk print console.

Do not solve this by shrinking fonts, hiding labels, adding horizontal
scrolling, increasing the global record width, or patching each button with a
one-off class. Bulk must stop using a record-facts aside for operational
controls.

## End goal — definition of done

The bare `/shipping/label-intake` route is **Bulk uploads and bulk printing
for every printable document**. It looks and behaves like the existing
Allocate/data-table selection workflow:

1. The contextual sidebar on the left owns all persistent filters and sort.
2. The middle body is a selectable, dense document ledger with the shared
   select bar and exact status pills **All · Unprinted · Printed**.
3. Clicking or checking documents opens one split selection pane on the
   right. The middle list stays visible and selectable.
4. The right pane groups the selected documents, switches between
   **Paperwork** and **Shipping labels**, and bulk prints the visible or
   selected stock.
5. A gear icon at the top-right of that pane opens the two printer routes and
   silent-print settings: Paperwork → Letter printer; Shipping labels → 4×6
   printer.
6. One mixed selection may contain both stocks. One Print action partitions
   it into the correct jobs and silently sends each job to its paired printer.
7. Printed documents remain selectable and printable. Printing them again is
   an explicit reprint with a clear confirmation and an additional print-log
   event.
8. No content overlaps, collides, escapes, or becomes unreadable at the width
   proofs in this prompt.

Done is not a full-width upload gallery with a record card beside it. Done is
not a button that calls the current writer while the layout still collapses.
Done is the exact browser workflow in **Browser proof**, against real records,
with printer routing, selection, filtering, upload, first print, and reprint
all proven after reload.

## Binding product contract

### One page, three focused views

Keep the route and view keys:

| User-facing view | URL | Job |
| --- | --- | --- |
| Bulk | `/shipping/label-intake` | Upload and print across every printable document |
| Shipping labels | `?view=labels` | Find an order, upload/pair its shipping label, and manually print a backup label |
| Paperwork | `?view=paperwork` | Find an order, upload/pair its packing slip or manual, and manually print paperwork |

The wire token remains `paperwork`. Rename the visible **Packing slips** label
to **Paperwork** in navigation, shortcut teaching, empty copy, headings, and
accessible names. Do not rename `documents.document_type = 'packing_slip'`,
API payloads, migrations, or database columns. “Paperwork” is the operator
category; `packing_slip` remains the stored subtype.

Bulk is the only view where both stocks coexist. Outside Bulk:

- Shipping labels renders shipping-label documents only.
- Paperwork renders packing slips and manuals only.
- Neither focused view renders the other view's documents in its document
  strip, action list, selected set, or default print operation.
- Do not redesign those views in this task. Make only the smallest scoping and
  naming correction needed to enforce this boundary.

### Bulk terminology

- **Paperwork** = packing slips plus printable manuals, Letter stock.
- **Shipping labels** = carrier labels, 4×6 stock.
- **Document** = one physical printable asset shown exactly once.
- **Unprinted** = no successful print event exists for that physical asset.
- **Printed** = one or more successful print events exist.
- **Reprint** = print a Printed asset again; never mutate it back to Unprinted.
- **Paired** = the asset has an order association.
- **Unpaired** = stored bytes exist without an order association.

Do not call Bulk “Uploads” in visible UI. Uploading is one Bulk action; it is
not the identity of the view.

## Non-negotiable identity rule — one physical document, one row

Fix the canonical projection before building the layout. Bulk cannot be
trusted while one label can appear twice.

Known example: order number `100618` (internal order id `15312`) has:

- `label_ingestions.id = 50`, state `APPLIED`;
- `documents.id = 1066`, type `shipping_label`;
- `label_ingestions.document_id = 1066`;
- tracking `1ZJ22B100338094607`;
- shipment `179241`.

Those are lifecycle records for one physical label, not two labels. The
current selected-order document hook first maps the ingestion as `label:50`
and then appends the canonical document as `doc:1066`, so it displays twice.
Bulk must never repeat this bug.

Use these canonical UI identities:

1. A `label_ingestions` row with `document_id IS NOT NULL` is represented only
   by `document:<document_id>`. Do not also emit `ingestion:<id>`.
2. A staged ingestion with no document row is
   `ingestion:<label_ingestions.id>`.
3. A stored outbound document is `document:<documents.id>`.
4. A printable product manual with no `documents` row is
   `manual:<product_manuals.id>`.
5. If legacy dual-read finds the same document through `documents.entity_*`
   and `document_entity_links`, `documents.id` collapses it to one row.
6. Tracking number alone is not a unique document key: one package can have a
   replaced label. Use the explicit `document_id` relationship first, then
   stored SHA-256/object identity where necessary. Never hide two genuinely
   different label versions solely because their tracking matches.
7. A multi-page uploaded label PDF becomes one printable row per stored page,
   because pages can have different orders, tracking numbers, and print state.
8. A manual with no readable stored content may appear only as a disabled
   “Not printable” fact when associated with a selected order. It does not
   enter Bulk's printable counts or selection.

Write focused projection tests before UI work. The test for order `100618`'s
shape must produce one shipping-label face, not two.

## What exists — reuse, do not fork

### Bulk host and current reads

- `src/features/labels-docs/LabelsDocsDesk.tsx` selects bare view
  `uploads` and mounts `LabelBatchesDesk`.
- `src/features/labels-docs/LabelBatchesDesk.tsx` currently merges label
  batches with unlinked packing-slip documents using synthetic numeric ids.
  It supports checkbox/range selection, `TriageSelectBar`, All/To print/
  Printed cuts, label-page printing, paper printing, uploads, and deletion.
- `src/lib/triage/views/label-intake.ts` declares the view and URL params.
- `NAV_PAGE_DECLS['label-intake']` in
  `src/lib/nav/context/pages.ts` owns the search, actions, and current upload
  date range.

Promote/replace `LabelBatchesDesk` into a real Bulk document ledger. Do not
create a second page or a fourth saved view.

### Shared selection and Allocate behavior

- `TriageCardList` already owns checkbox selection, Shift-range selection,
  select-all over visible rows, status cuts, J/K/Enter behavior, and the
  `TriageSelectBar` bulk-action position.
- Allocate uses it through
  `src/components/outbound/orders/cards/OrderCardList.tsx` and
  `OrdersMorphingHost`.

Reuse this interaction grammar. Bulk may use the compact row density/table
face, but it must not create a second checkbox-selection implementation or a
floating toolbar with different rules.

### Canonical document and queue reads

- `src/lib/documents/queries/library.ts` already queries linked and unlinked
  `shipping_label`/`packing_slip` documents with order, tracking, type, dates,
  and search filters. Its current use through a photo-library route is not an
  acceptable permanent Bulk API name. Reuse/extract the server query into a
  dedicated Bulk documents endpoint rather than making Bulk depend on
  `/api/photos/library`.
- `src/lib/label-prints/print-queue.ts` already resolves label and paperwork
  print counts/events and manuals.
- `src/lib/label-batches/batches.ts` already resolves pages and their print
  counts.
- `src/lib/documents/outbound-documents.ts` is the order-linked document
  source of truth.
- `src/lib/documents/print-bundle.ts` already proves the intended rule:
  applied labels and staged ingestions must not print twice, mixed bundles are
  separated by stock, and printed tracking is reconciled.

Create one Bulk projection over these roots. Do not load every label batch and
then N+1 fetch every batch detail in the browser to assemble a print job.

### Upload writers

- Shipping-label upload: existing label-batch/ingestion writer used by
  `useLabelUploads`; multi-page PDFs split through the existing batch path.
- Unpaired paperwork upload: `uploadBulkPaperwork` in
  `src/lib/documents/unlinked-client.ts`; it writes the existing document
  store with no order identity.
- Order-specific label and paperwork upload writers remain owned by the two
  focused views. Bulk does not invent another order attachment writer.

Bulk upload must select an explicit stock before file selection:

- Paperwork: PDF, PNG, JPEG → existing unpaired paperwork writer.
- Shipping labels: PDF → existing label ingestion/batch writer.

Do not guess a document type from filename when the operator has already
chosen the type. A drop over Bulk opens a small choice when no type lens is
active; it must not silently file a packing slip as a label.

### Printing and station routing

- `useDeskPress` is the existing document-print orchestrator.
- `usePrintStations` resolves this device's per-stock choice, org defaults,
  live/offline state, and remote-station bridge.
- `usePrintRoutes` reads this workstation's paper and label routes.
- `PrinterConnectCard` contains the existing silent switch, printer-profile
  pairing, language, and test-print logic.
- `PrintStationsCard` contains station selection and organization assignment.
- `isSilentPrintEnabled` / `setSilentPrintEnabled` in
  `src/lib/print/printMode.ts` remain the one silent-print switch.

Reuse their ports and writers. Bulk's gear popover/sheet is a different
presentation of those existing capabilities, not a second printer-settings
store.

## Exact Bulk layout

### Overall frame

Bulk is permanently a split-capable selection workspace. Remove the current
effect that forces the stage to `in-place`.

At desktop widths:

```text
┌ contextual sidebar ┐ ┌ middle document ledger ──────────────┬ selection pane ─────┐
│ Search              │ │ All  Unprinted  Printed             │ Paperwork | Labels ⚙ │
│ Sort                │ │ ☐ Document · order · identity ...   │ 12 selected           │
│ Type                │ │ ☐ Document · order · identity ...   │ grouped by order       │
│ Pairing             │ │ ☐ Document · order · identity ...   │                       │
│ Source              │ │                                     │ Print selected         │
│ Uploaded            │ │ selection bar / pager               │ route/status           │
└─────────────────────┘ └──────────────────────────────────────┴───────────────────────┘
```

Use the existing `DeskRecordPlane`/stage mechanics only if they can provide
this stable contract without forcing a 46rem record layout inside the right
pane. The selected pane is not an order record and must not mount
`DeskRecordLayout` with a nested one-third aside.

- With no checked/open document, the middle ledger uses the available width
  and the right pane is closed.
- Clicking a row opens it and selects it only according to the shared Allocate
  interaction rules; checking rows builds the bulk selection.
- When one or more rows are selected, the right pane opens and the middle
  ledger stays visible.
- The right pane never covers the list on desktop.
- Esc closes preview/focus but must not silently clear a multi-selection.
- Clearing selection closes the pane.
- J/K walks rows; X or the existing selection key checks a row; Shift-click
  selects a range; select-all selects the visible filtered set.

### Width contract — permanent, container-driven

Implement against the actual pane container, never the viewport.

Desktop contract:

- middle ledger: `minmax(36rem, 1fr)`;
- right selection pane: preferred 28rem, minimum 24rem, maximum 34rem;
- one hairline seam between them;
- both children carry `min-w-0`;
- the page itself never gains horizontal overflow.

When the available workspace cannot hold a 36rem ledger plus a 24rem pane:

- keep the ledger readable;
- open the selection pane as a full-height overlay/drawer with a real close
  control;
- do not squeeze the pane below 24rem;
- do not keep a narrow two-column layout.

Inside the pane:

- every text wrapper is `min-w-0`;
- identity text truncates with a tooltip/title containing the full value;
- action rows use `grid-cols-[minmax(0,1fr)_auto]` or a single column;
- primary action labels do not wrap to three lines;
- no unconditional `grid-cols-2` for buttons;
- two buttons may share a row only above a pane container breakpoint where
  both full labels fit; otherwise stack them;
- status and count have `shrink-0`; titles take `minmax(0,1fr)`;
- no fixed 5.5rem term column survives where it leaves the value less than
  12rem; narrow faces stack term over value;
- do not add `overflow-x-auto` as a substitute for correct disclosure.

The screenshot's Paperwork card and printer cards are not to be copied into
this pane. Their capabilities are re-presented as compact rows and a gear
popover.

## Middle document ledger

The middle is a compact data-table/list selection face matching Allocate's
selection grammar. One row equals one canonical printable asset.

### Columns and disclosure

Always visible:

- checkbox;
- type icon and document/file name;
- order identification, or **Unpaired**;
- print status: **Unprinted** or **Printed ×N**.

Visible when width permits:

- shipment tracking for labels;
- item number/SKU for manuals;
- source;
- uploaded/created time;
- last printed time and station.

Everything hidden at a compact tier remains available in the row tooltip and
right selection pane. Do not ellipsize every column until the table becomes
unidentifiable.

### Status pills in the middle

Immediately above the rows, use exactly:

- **All** — every printable document in the filtered scope, regardless of
  print history;
- **Unprinted** — `printCount = 0`;
- **Printed** — `printCount > 0`.

Each pill has an exact server-backed count for the current sidebar filters.
Only one status is active. Bare/default is **All**, because the operator must
be able to print anything, including a previous print. Use one URL parameter,
for example the existing `printing=to-print|printed`; absence means All. Do
not create separate booleans that can contradict one another.

Replace visible “To print” copy with **Unprinted**. Preserve the existing wire
token if avoiding a migration is safer.

### Default sort and priority

Default order is operational priority:

1. Unprinted before Printed.
2. Within Unprinted, oldest ready-to-print first.
3. Within Printed, most recently printed first.
4. Stable tie-breaker by canonical id.

Sidebar sort choices:

- Priority (default)
- Newest uploaded
- Oldest uploaded
- Order identification
- Last printed

Printed rows must never disappear merely because Priority is the default.

## Contextual sidebar filters

Declare Bulk controls in `NAV_PAGE_DECLS['label-intake'].items.uploads`.
Filters belong in the contextual sidebar; do not add a second filter toolbar
over the ledger.

Exact controls, in this order:

1. **Sort** — choices above.
2. **Document type** — All documents · Paperwork · Shipping labels.
3. **Pairing** — All · Paired to order · Unpaired.
4. **Source** — Uploaded · ShipStation · Marketplace/channel · Generated ·
   Manual library, using the sources that actually exist.
5. **Uploaded** date range.
6. **Printed** date range.
7. **Printer/station** — optional only if print events can answer it without
   client-side guessing.

The sidebar Find field searches, server-side, across:

- order identification;
- full tracking number;
- filename;
- item number and SKU for manuals;
- canonical document/ingestion id.

Every filter is URL-backed, survives reload/back/forward, narrows pill counts,
and resets pagination. The API performs the filter; do not fetch the entire
library and filter it in React.

## Right selection pane

### Header

The top row contains:

- a two-option `TabSwitch`/segmented control:
  **Paperwork** and **Shipping labels**;
- count in each option for the current selection;
- one icon-only gear button at the far right, with accessible name
  **Printer and silent-print settings**.

This is a stock lens over the current selection, not another page navigation
system. Changing the lens does not clear selection or mutate filters.

If the current selection contains only one stock, keep both options visible;
the empty option shows zero and an honest empty message. Never mix label and
paper document controls in one undifferentiated list.

### Selected documents

Group rows by exact order identity:

- heading: platform mark + order number;
- subgroup Paperwork: packing slips, then manuals by item number/SKU;
- subgroup Shipping labels: package/box sequence and full tracking number;
- unpaired assets form an explicit **Unpaired** group.

Within the active stock lens, each selected asset shows:

- full title/filename;
- order association;
- tracking or item/SKU identity;
- Unprinted or Printed ×N;
- last print time/station when printed;
- remove-from-selection control.

Do not put upload, pairing, fetching, buy-label, document replacement, delete,
or order CRUD controls in this pane. Bulk's right pane is selection review and
printing. Those extra actions caused the screenshot's unusable density and
belong to their focused workflows.

### Print action

The pane has one stable primary action, visible without scrolling:

- active lens Paperwork: **Print N paperwork** or **Reprint N paperwork**;
- active lens Shipping labels: **Print N shipping labels** or
  **Reprint N shipping labels**;
- a mixed-selection secondary action: **Print all selected**.

`Print all selected` partitions in selection/display order:

1. Shipping-label documents → `stock='label'` → paired 4×6 station.
2. Paperwork documents → `stock='paper'` → paired Letter station.

One user action may create two jobs. Never send a Letter document to the label
route or a 4×6 label to the paper route. Preserve canonical display order
inside each job.

If any chosen document has `printCount > 0`, show one reprint confirmation
that names the count and most recent print evidence. After confirmation,
print every chosen asset—including previously printed ones—and append print
events. Do not silently exclude printed rows from a mixed selection.

The action is disabled with a specific reason when:

- the active lens has zero selected printable documents;
- its target printer/station is missing, offline, paused, or lacks the stock
  role;
- a selected asset has no readable bytes;
- a print is already submitting.

### Gear: printer pairing and silent printing

The gear opens one anchored popover on wide screens and a sheet on narrow
screens. It contains compact settings, using existing stores/writers:

1. **Silent printing** switch.
2. **Shipping labels · 4×6** — current station/printer, live state, Change,
   Test.
3. **Paperwork · Letter** — current station/printer, live state, Change,
   Test where supported.
4. Use organization default / make current station the organization default,
   gated by existing permissions.
5. A link to the existing full Hardware/Stations settings only for advanced
   management.

Do not leave `PrintStationsCard` and `PrinterConnectCard` as tall cards under
the selection. Do not introduce another localStorage key or station API. The
gear is a compact adapter over `usePrintStations`, `usePrintRoutes`, and the
existing silent-print/profile functions.

## Bulk upload behavior

The Bulk header/select bar exposes **Upload**. Opening it first chooses:

- **Upload paperwork** — PDF/PNG/JPEG, one canonical unpaired document per
  file, Letter stock.
- **Upload shipping labels** — PDF, existing multi-page split/ingestion path,
  4×6 stock.

Multiple files are allowed. Show an upload tray above the ledger while work is
active. On success:

- insert/refresh canonical rows in the middle without a full reload;
- retain the current filters;
- if the new row is hidden by the current filter, say why instead of clearing
  filters;
- same bytes reuse the existing canonical ingestion/document identity;
- no order, marketplace id, item number, or tracking is invented in Bulk.

Bulk uploads are permitted to remain unpaired. Order-specific search and
attachment live in the Shipping labels and Paperwork focused views. Do not add
an order-matching wizard to Bulk in this task.

## Server projection/API contract

Build one paginated, tenant-scoped Bulk read endpoint. It returns canonical
printable rows and exact filtered counts, rather than making the browser join
four unrelated endpoints.

Suggested response shape (names may align with existing contracts):

```ts
interface BulkDocumentRow {
  key: `document:${number}` | `ingestion:${number}` | `manual:${number}`;
  kind: 'paperwork' | 'shipping_label';
  subtype: 'packing_slip' | 'manual' | 'shipping_label';
  stock: 'paper' | 'label';
  sourceId: number;
  documentId: number | null;
  ingestionId: number | null;
  manualId: number | null;
  filename: string;
  contentUrl: string | null;
  orderId: number | null;
  orderRef: string | null;
  accountSource: string | null;
  shipmentId: number | null;
  tracking: string | null;
  itemNumber: string | null;
  sku: string | null;
  source: string;
  createdAt: string;
  printCount: number;
  lastPrintedAt: string | null;
  lastPrintedBy: string | null;
  lastStationName: string | null;
}
```

The response also returns:

- exact All/Unprinted/Printed counts under the current non-status filters;
- total and cursor/page information;
- selected-row resolution by canonical key so a selection can survive a
  refetch without loading the whole library.

Use parameterized queries and organization predicates on every table.
Permissions remain `packing.review`/the existing page read gate and the
existing print/upload permissions for mutations. Do not grant Bulk a broader
permission to simplify the UI.

## Implementation phases

### Phase 0 — baseline and contracts

1. Start `cycleforge-lane@prod` if needed; use `http://localhost:3050` only.
2. Run `ds_contract 'bulk printable document selection ledger with a split
   review-and-print pane'`.
3. Read `docs/design-system/CONSOLIDATION_LEDGER.md`.
4. Capture the current Bulk, Shipping labels, and Paperwork views at the
   browser sizes in Browser proof.
5. Inspect the supplied screenshot and record the exact overflow/wrap
   failures as regression assertions.
6. Add tests for canonical identity, especially applied ingestion → document.

Do not begin by changing CSS.

### Phase 1 — canonical Bulk data projection

1. Define one client-safe Bulk row contract.
2. Build the tenant-scoped union/projection over documents, unapplied label
   ingestions/batch pages, and printable manuals.
3. Collapse applied ingestions onto their document rows.
4. Join print events and exact order/package/item identities.
5. Add server filtering, sorting, counts, and pagination.
6. Expose it through a dedicated Labels & docs Bulk API and client/query key.
7. Prove order `100618` produces one label face.

### Phase 2 — navigation language and focused-view isolation

1. Change visible Packing slips to Paperwork while retaining the wire token.
2. Update view icon labels, shortcut copy, empty messages, and accessible
   names.
3. Ensure focused Shipping labels data contains only labels.
4. Ensure focused Paperwork data contains only packing slips/manuals.
5. Do not otherwise change those layouts or actions.

### Phase 3 — middle ledger and selection

1. Replace the batch-card-only Bulk list with the canonical row ledger.
2. Reuse TriageCardList/TriageSelectBar selection semantics from Allocate.
3. Add the exact All/Unprinted/Printed pills with server counts.
4. Bind contextual-sidebar search, sort, type, pairing, source, and date
   filters.
5. Keep selection stable across background refetches and remove only rows
   that truly leave the filtered result.

### Phase 4 — right selection pane

1. Remove Bulk's use of `DeskRecordLayout`'s facts aside.
2. Build the width-constrained selection pane with the two-stock switch and
   grouped selected rows.
3. Add remove-from-selection and print/reprint actions.
4. Prove one, many, mixed-stock, unpaired, and printed selections.

### Phase 5 — printer gear and silent routing

1. Adapt existing printer/station ports into one compact gear popover/sheet.
2. Show both stock routes, health, silent switch, change, and test.
3. Partition mixed selection into exact label/paper jobs.
4. Prove local silent printing and remote-station dispatch with the existing
   mechanisms; do not fake success when a station does not acknowledge.

### Phase 6 — bulk upload

1. Add explicit Paperwork versus Shipping labels upload choice.
2. Reuse the two existing writers.
3. Refresh canonical results and preserve current filters.
4. Prove multi-file and multi-page inputs plus same-byte idempotency.

### Phase 7 — responsive hardening

1. Implement pane container breakpoints and the drawer fallback.
2. Remove assumptions that a viewport breakpoint guarantees pane width.
3. Add overflow regression tests using DOM measurements.
4. Run `ds_critique` on every touched UI file.

### Phase 8 — browser proof and verification

Complete every acceptance case below, run the required verification, and
report screenshot paths.

## Required focused tests

### Identity/data

- Applied ingestion with `document_id` emits one canonical document row.
- Legacy direct ownership plus link-hub ownership emits one document row.
- Two genuinely different label documents for one tracking remain two rows.
- Multi-page upload emits one row per printable page.
- Printable manual is Paperwork; Drive-only/no-bytes manual is not selectable.
- All/Unprinted/Printed counts respect all non-status filters.
- Priority sorting is stable and retains Printed rows.
- Tenant A can never see tenant B rows or counts.

### Selection/layout

- Check, uncheck, Shift-range, select-visible, and clear follow the shared
  Triage selection behavior.
- Changing Paperwork/Shipping labels lens preserves selection.
- Clearing selection closes the pane.
- Mixed selection groups by order and stock correctly.
- Every pane child fits its container: assert
  `scrollWidth <= clientWidth` for the pane, header, action area, stock switch,
  selected groups, and printer popover at every proof width.
- No action label overlaps an icon or adjacent control.
- Keyboard focus order remains logical; gear returns focus when closed.

### Printing

- Paperwork goes only to `stock='paper'`.
- Shipping labels go only to `stock='label'`.
- Mixed Print all selected creates the two correct ordered jobs.
- Printed rows are selectable and produce a reprint confirmation/event.
- Unprinted filter excludes printed; Printed filter excludes unprinted; All
  includes both.
- Missing/offline printer disables only the affected stock with an exact
  reason.
- Silent switch and route changes repaint without reload.

### Upload

- Paperwork input accepts PDF/PNG/JPEG and uses the existing paperwork writer.
- Shipping-label input accepts PDF and uses the existing batch/ingestion
  writer.
- Same bytes are idempotent.
- Upload does not invent order identity.
- New rows respect active filters after refresh.

### View boundaries

- Bulk can show both stocks.
- Shipping labels shows no packing slip/manual faces.
- Paperwork shows no shipping-label faces.
- The visible view label is Paperwork while API/database tokens remain
  `paperwork`/`packing_slip` as appropriate.

## Browser proof

Use a throwaway Playwright script with
`storageState: tests/.auth/admin.json` and base URL
`http://localhost:3050`. Delete the script afterward.

Capture full-page and pane-close-up screenshots at:

- 1440 × 900;
- 1280 × 720;
- 1024 × 768;
- 900 × 700, proving the drawer fallback rather than a crushed rail.

For every size, measure and assert no horizontal overflow on the page,
document ledger, selection pane/drawer, stock switch, printer settings, and
primary action.

### Workflow A — filters and status

1. Open bare `/shipping/label-intake`.
2. Assert the view is called Bulk, not Uploads.
3. Assert All · Unprinted · Printed are visible in the middle.
4. Apply each sidebar filter and verify the URL, rows, and all three counts.
5. Reload and use back/forward; state persists.
6. Select Printed and confirm printed rows remain checkable.

### Workflow B — selection pane

1. Check one Paperwork row. The right pane opens; the ledger remains visible.
2. Add a Shipping label with Shift-range selection.
3. Switch the pane between Paperwork and Shipping labels; selection remains.
4. Verify grouping by exact order and the explicit Unpaired group.
5. Remove one row from selection; the ledger checkbox updates.
6. Clear selection; the pane closes.

### Workflow C — printer gear

1. Open the gear with keyboard and pointer.
2. Verify Silent printing and both exact routes.
3. Change the label station and paperwork station independently.
4. Close and reopen; settings remain and focus returns to the gear.
5. Run a safe test print where hardware is available. If hardware is absent,
   prove the exact disabled/error state and do not claim a physical print.

### Workflow D — print and reprint

1. Select at least one unprinted label and one unprinted paperwork document.
2. Print all selected.
3. Verify two stock-correct jobs and print events.
4. Switch status to Printed; both assets are present.
5. Select them and reprint. Confirm once, then verify counts increment and no
   duplicate document rows appear.

### Workflow E — upload

1. Bulk upload multiple Paperwork files.
2. Bulk upload a multi-page label PDF.
3. Verify canonical rows, types, stock, and no invented order identity.
4. Upload the same files again; verify identity/count idempotency.
5. Reload and confirm persistence.

### Workflow F — focused-view boundary

1. Open Shipping labels and search an exact order identification.
2. Assert only shipping-label files render.
3. Open Paperwork and search the same order.
4. Assert only packing slips/manuals render.
5. Capture both as boundary evidence; do not redesign them.

## Acceptance criteria

- Bulk is the bare route and the only cross-stock workspace.
- Middle ledger mirrors shared Allocate/data-table selection behavior.
- Right selection pane opens only for selection/preview and never crushes
  below its minimum width.
- All · Unprinted · Printed are exact and Printed assets can be reprinted.
- All persistent filters live in the contextual sidebar and are server-backed.
- Paperwork/Shipping labels switch filters the selection pane without clearing
  selection.
- Gear exposes existing silent printing and both existing printer routes.
- Mixed print is partitioned by stock and sent to the correct stations.
- Bulk uploads both stocks through existing writers.
- Each physical document renders once; order `100618` does not duplicate its
  applied shipping label.
- Visible Packing slips terminology is Paperwork.
- Focused Shipping labels and Paperwork views do not share document faces.
- At all proof widths, no overlap, collision, accidental three-line primary
  action, clipped control, or horizontal page overflow exists.
- Icons remain on every retained view and action; icon-only gear has an
  accessible label.

## Verification

Run focused tests throughout, then:

```bash
pnpm verify:fast
pnpm verify
```

Run `ds_critique` on every touched UI file. Also run the route, nav context,
label batch, print queue, print bundle, document identity, station routing,
and tenant-isolation test families affected by the change.

Do not call the work done on a red verification run. If the repository begins
red for unrelated reasons, record the baseline before edits, prove no new
failure was introduced, and report the exact unchanged failures.

## Final report

Report:

- canonical Bulk row identity and how applied ingestions are deduplicated;
- exact sidebar filters and middle status pills;
- selection-pane dimensions, breakpoints, and drawer fallback;
- Paperwork/Shipping labels lens and grouping behavior;
- printer gear, silent-print behavior, and mixed-stock job partition;
- upload writers reused for each stock;
- minimal focused-view isolation/name changes;
- focused tests, `pnpm verify:fast`, `pnpm verify`, and `ds_critique` results;
- every browser workflow and screenshot path;
- any physical printer proof that could not run because hardware was absent.

Do not include unrelated cleanup or claim unrun hardware/browser cases passed.
