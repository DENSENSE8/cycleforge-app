# PROMPT — Labels & docs: the Orders view (order-anchored pairing) (2026-10-05)

Worktree: `/home/michaelgarisek/Projects/cycleforge-lanes/labels-print` — every
edit lands HERE, never in `cycleforge-lanes/prod`. Lane lifecycle is
operator-only; the running lane is `cycleforge-lane@prod`, so browser proof of
this worktree waits for the operator to hand the lane over.

## Operator rulings (2026-10-05, binding)

1. **Merge** the Shipping labels (`?view=labels`) and Paperwork
   (`?view=paperwork`) views into ONE order-anchored view, **Orders**
   (`?view=orders`). Bulk (bare route) stays the document-anchored print
   console under its 2026-10-04 contract (no pairing in its pane).
2. **Default pair scope = SKU** when pairing product paperwork from an order
   line (falls back to item number, then order, only when the line has no SKU).
3. **Custom paperwork = a `product_manuals.type`** (new type `insert`, label
   "Insert"). `product_manuals` is the one store for SKU paperwork; the shadow
   store (`documents.document_type = 'manual'` + `document_entity_links`
   SKU rows, written by `src/lib/documents/manual-documents.ts`) is removed.
4. **One definition of "has paperwork"**: the release gate G2
   (`caged-orders.ts`, `order-exceptions.ts`) uses the same product-paperwork
   match predicate as the print queue (`paperworkDocsSql`,
   `src/lib/label-prints/print-queue.ts`).
5. **SKU-level Not required**: `sku_catalog.paperwork_not_required` — "this
   SKU never ships with product paperwork". A line on such a SKU is
   `not_required`, never `missing`, and satisfies G2 for that line.

## Foundations (design law for this view)

1. The order is the unit of intent; its slots are its shape. Every slot is
   exactly one of Filled · Missing · Not required · Needs review.
2. Missing is the queue: sidebar status **Missing · Ready · Printed · All**
   (absence = All), Priority sort puts gaps first. Every list row carries a
   slot strip (label · slip · product paperwork) so gaps read without opening.
3. Fix where you see it: every Missing slot is an action target AND a file
   drop target. Expanding a row shows its lines with the same line-slot
   control as the right pane (one component, two placements).
4. Pair at the true scope and show reach: SKU default; the action names how
   many open orders it fixes ("Pair to SKU · 14 open orders"). Every filled
   paperwork row shows its source (SKU · Item # · This order) and can be
   repinned or unpaired in place.
5. Uploads declare type and target before bytes land: dropping on a slot is
   typed + targeted; never guess type from filename.
6. One physical document = one row (canonical identity, see the Bulk prompt).
7. Corrections are reversible: unpair / repin / not-required → toast with
   Undo; SKU-scope unpair shows the reach first.
8. Labels pair in both directions: a Missing label slot lists suggested
   unpaired labels (buyer-name / reference matches) with one-click Accept,
   plus "Pair an uploaded label", "Upload", "Buy label".
9. Keyboard: J/K orders · → expand / ← collapse · Enter open · Tab moves
   through slots · P pair · U upload · N not required · X select ·
   ⌘/Ctrl+P print order(s).
10. Filters/sort/status live in the LEFT contextual sidebar
    (`rule://sidebar-controls-contract`, ruling A4) — never body chips.
    Identifiers in lists paint last-8 via the helpers
    (`rule://identifier-last8-contract`); the pane header shows the full id.

## Layout

```
┌ sidebar ─────┐┌ orders (list) ─────────────────────────┐┌ order pane (24–34rem) ─────────────┐
│ Find         ││ ▸ ☐ …00100618 eBay   [L✓][S✗][P 1/2]    ││ 100621 · Ecwid · 2 lines        ⚙  │
│ Status       ││ ▾ ☐ …00100621 Ecwid  [L✓][S✓][P✗]       ││ SHIPPING LABEL                      │
│ Missing slot ││    ├ SKU A ×1  Manual ✓ via SKU          ││  Box 1 · …38094607 · Printed ×1     │
│ Channel      ││    └ SKU B ×2  ✗ Missing [Pair] [Upload] ││ PACKING SLIP  ✓                     │
│ Sort         ││ ▸ ☐ …00100630 Amazon [L✗][S✓][P–]       ││ PRODUCT PAPERWORK                   │
└──────────────┘└─────────────────────────────────────────┘│  SKU B ×2 ✗ [Pair ▾] [Upload] [N/R] │
                                                           │ [ Print order · 4×6 + Letter ]      │
                                                           └─────────────────────────────────────┘
```

Width contract (container-driven, from the Bulk prompt): list
`minmax(36rem,1fr)`, pane 24–34rem, hairline seam, `min-w-0` everywhere;
below the threshold the pane is a drawer with a real close.

## Contracts (already written)

`src/lib/label-prints/order-packet-contracts.ts` — `OrderPacket`,
`OrderPacketQueue`, slot states, URL params, `packetStatus`, reach + not-
required wire shapes. Slot rules:

- Label: `not_required` when pickup; `filled` with ≥1 canonical label of the
  order (applied document / ShipStation label); `review` when only a matched
  but unapplied / quarantined ingestion exists; else `missing`.
- Slip: `filled` with ≥1 packing slip linked to any line; `not_required`
  when `docs_not_required`; else `missing`.
- Line: `filled` with ≥1 resolved product paperwork; `not_required` when the
  SKU or the order is exempt; else `missing`.
- Status: any gap → Missing; else every printable document printed → Printed;
  else Ready.

## Endpoints

- `GET /api/shipping/label-intake/orders` → `OrderPacketQueue` (one SQL
  round trip for rows + counts; reuses `paperworkDocsSql` and the label row
  SQL; no browser N+1).
- `GET /api/sku-catalog/[id]/paperwork-reach` → `SkuPaperworkReach`.
- `PATCH /api/sku-catalog/[id]/paperwork-required` ← `{ notRequired }`.
- Existing writers only for pairing/upload: `PaperworkPairingControls` /
  `LibraryPairPicker` writers, `uploadOrderManual`, order document upload,
  `confirmLabelOrderHttp`, label batch upload, `LabelBuyCard`,
  order `docs_not_required` toggle (`POST /api/orders/[id]/cage`).

## Migration (authored, NOT applied — operator runs `/db-migrate`)

- `sku_catalog.paperwork_not_required BOOLEAN NOT NULL DEFAULT FALSE`.
- Delete the 8 shadow `documents` rows (`document_type='manual'`,
  `document_data->>'source'='product_manuals_promote'`; 0 print jobs, 0 print
  events as of 2026-10-05) — their links cascade.

## Removed in the cutover

`PrintQueueDesk` and every file only it used; `LABEL_INTAKE_LABELS_VIEW` /
`LABEL_INTAKE_PAPERWORK_VIEW` declarations; `?view=labels|paperwork` hrefs
(migrated to `?view=orders`); `manual-documents.ts`.

## Done

- `pnpm verify:fast` green except failures pre-existing in this worktree
  (recorded before the change); new unit tests for slot/status derivation,
  G2 parity with the print queue, SKU-default scope, not-required.
- `ds_critique` on every touched UI file.
- Browser proof on `:3050` once the operator hands over the lane: Missing
  order → pair a manual at SKU scope → every open order with that SKU leaves
  Missing after reload; mark a SKU Not required; accept a label suggestion;
  print an order; reprint.

## Implementation status (2026-10-06)

Built in `labels-print`, landed into the `prod` worktree; operator tests by
hand. Not yet deployed.

- Projection: `src/lib/label-prints/order-packets.ts` (one SQL read) +
  `order-packet-derive.ts` (pure slots/status/filters/counts) +
  `GET /api/shipping/label-intake/orders`; facets `label-intake.orders`.
- UI: `src/features/labels-docs/orders/` (`OrdersDesk`, `OrderPacketList`,
  `pane/*`). `TriageRow` gained `expansion` + `face.strip`; `TriageFamily`
  gained `expandable`; `useTriageCardKeys` gained `onExpand` (→ / ←).
- Sidebar child ids under Labels & docs: `allocate`, `uploads`, `orders`.
- G2: `src/lib/orders/g2-paperwork-sql.ts` over
  `src/lib/manuals/paperwork-match-sql.ts` (same match + catalog-id
  resolution incl. platform crosswalk as `paperworkDocsSql`), backed by the
  `sku_platform_ids` crosswalk-key indexes.
- Bulk (bare route) is a FILE list (operator 2026-10-06): one row per
  uploaded PDF (`label_batches`), pages classified by size
  (`classifyPageStock`: 4×6-class → label, else paper), mixed PDFs split,
  exact label matches auto-applied, paper pages matched by order number and
  linked. Sidebar: Find, Sort (Newest uploaded · Oldest uploaded · Last
  printed — day headers follow it), Print status, Uploaded and Printed date
  windows. Rows show upload date/time + uploader and last print date/time + by.
- Removed API: `GET /api/v1/label-prints`, `GET|DELETE /api/documents/unlinked`
  (then the whole unlinked route), `/api/v1/label-prints/bulk`,
  `GET /api/v1/label-batches` (list). Kept `POST
  /api/v1/label-ingestions/[id]/retry` (Exceptions hub uses it).

Migrations: applied 2026-10-06 — `2026-10-05_sku_paperwork_not_required`,
`2026-10-06_sku_platform_ids_crosswalk_key_indexes`, `2026-10-06b_print_files`.
Pending until AFTER the production deploy — `2026-10-06c_retire_manual_document_shadows`
(kept out of `prod` until then, because the production build's migration gate
fails on any pending file).
