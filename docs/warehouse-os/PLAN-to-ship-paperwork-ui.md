# PLAN — To-ship paperwork walk (compose existing UI)

**Written 2026-09-01.** Paste this file into a fresh session and say "build Lane 0."
Sibling to [`PLAN-order-flow-spine-3h.md`](./PLAN-order-flow-spine-3h.md) (R-FLOW-6 / R-FLOW-7).
Where this file and the 3h plan disagree on *UI hosts*, **this file wins**. Domain
(cage = unpaired only, G2/G3 as packet facts) stays in the 3h plan.

This is **not** a new page, a new documents table, or a fork of `ExceptionEditor`.
It is the map of which **existing To-ship components** grow, which already exist
but are unwired, and which must stay untouched.

---

## 0 · Why the last change touched UI at all

Two jobs landed in one session. They look like "UI work" if you only read the
diff, but they are different grains:

| What changed | Where it belongs | Why it is UI |
|---|---|---|
| Cage membership, auto-cage unpaired-only, pair → un-cage | `src/lib/orders/exception-membership.ts`, `auto-cage-core.ts`, `pairing-queries.ts` | It is **not** UI. Domain predicate. |
| Strip tracking / Release / docs-exempt from the exceptions form | `ExceptionEditor`, `ExceptionOrderFields` | Exceptions **are** a walk UI. After R-FLOW-7 the walk's job is pairing. Leaving G2/G3/Release on that form would be a lying contract. |

The exceptions record face had to shrink because pairing *is* that face. Growing
manuals, buy-label, or a document viewer **inside** `Exception*` would put
paperwork back on the wrong desk.

**Paperwork is still unbuilt.** The domain split is live: a paired order with a
stale cage stamp is already on To-ship. There is no To-ship walk that attaches
the print packet (shipping label PDF + packing slip + SKU manuals) so pack print
has something to dispatch.

Do not "finish paperwork" by adding cards back onto `ExceptionEditor`.

---

## 1 · Operator target (verbatim, then mapped)

Operator sketch:

1. A CTA **left of Export / Sync Google Sheet** with a badge: count of orders
   that still need linking.
2. Press CTA → leave compare-mode and walk **one order at a time**.
3. Per-order chrome: product title, item number, order ID (open listing),
   `k of n` top-right.
4. Split: form left, **closable** document viewer right.
5. Later: upload a multi-page label PDF; AI matches pages to orders; confirm in
   the viewer.

What that is **not**:

- Not dumping a form **under** the full To-ship table. Exceptions already
  measured that: table + form at desk width (~1152px) forces horizontal scroll.
  Pattern: **table for compare, then swap to one record + recents rail.**
- Not a second composer in the form (I8). AI talks through the station mouth
  (`StationComposerHost`), same as every other desk.
- Not tightening G3 so tracking-without-PDF cages again. G3 can pass on tracking
  alone. The CTA counts **print-packet incomplete**, not "G3 red."

---

## 2 · Two grains, two entry points, one packet

| Piece | Grain | Existing engine |
|---|---|---|
| Manuals | SKU / item number (`sku_catalog_id`) | `listAssignedManualsForOrder`, `promoteProductManualToDocument` |
| Shipping label + packing slip | Order (+ shipment) | `OrderDocumentsSection`, `BuyLabelSection`, `attachOutboundDocument` |
| Pack print | Order | `dispatchPrintBundle` / `resolvePrintBundle` |

**Print-packet incomplete** (the badge) is:

- missing `shipping_label` **document** (PDF/bytes), **or**
- missing packing slip when the org expects one, **or**
- no assigned manuals **and** G2 not exempt (`docs_not_required`)

It is **not** `evaluateReleaseGates` G3. Tracking without a printable label is a
live To-ship row that still needs this walk.

Two operator motions must not collapse into one button:

| Motion | Who | Host |
|---|---|---|
| **A. Collection walk** | "Walk everyone whose packet is incomplete" | Table XOR record+rail (exceptions chrome clone). Header CTA. |
| **B. Selection run** | "I checked these rows — buy/upload labels, advance" | Band **under the active row**. Status-bar verb **Labels · `L`**. |

A is the original sketch. B is R-FLOW-6 and is **already designed**, not mounted.

---

## 3 · What already exists (compose, do not rebuild)

### 3.1 To-ship desk (the page)

```
OutboundOrdersDesk
  → ToShipWmsShell          process | details (inspector)
    → DashboardOrdersView
      → UnshippedTable / UnshippedSheet
        → useOrdersSpreadsheet → DataTable
        → useToShipChrome     (filter facets; `caged` last)
        → useRailStatusBarActions  (Assign / Copy / … — no Labels verb yet)
```

Header CTA cluster (`DeskActionSlot`):

- `role="overall"` — Export (DataTable registers it).
- `role="primary"` — Sync Google Sheet (`OrdersDeskAddAction`).
- House comment in `DeskActionSlot.tsx`: print / labels / filter / columns /
  zoom stay **off this row** — they act on chosen rows or on how the sheet is
  drawn.

**Implication:** do not steal Export's `overall` slot, and do not put **buy
label** in the header. The Paperwork **count** is a collection door (like
Export), not a row verb. See §5 for the slot change.

Row click today opens the right-pane inspector with
`documentsMode: 'preview'`. Manage/upload is `panelContext='labels'`, which
nothing mounts (`open_labels` still points at a missing `/ops/labels`). The
walk in this plan is what finally mounts manage.

### 3.2 Shipping component (already the SoT)

| File | Job | Status |
|---|---|---|
| `src/components/outbound/labels/OrderShippingPanel.tsx` | Parcel + buy + upload tray (`OrderDocumentsSection` `readOnly={false}`) | Built. Intake host (a) mounts it. |
| `src/components/outbound/labels/LabelRunBand.tsx` | Thin caption + Skip/Next/Exit + lazy `OrderShippingPanel` | Built. **Zero callers.** |
| `useOrdersSpreadsheet` `activeWorkRowId` + `renderActiveWorkBand` | Outline the working row; render the band beneath it | **Declared, unused.** `renderLeaf` never reads them. |
| `SELECTION_STATUS_BAR_META.labels` hotkey `l` | Presentation SoT for the foot verb | Meta exists. `useDashboardBulkSelection` has **no** `key: 'labels'` action — only `print-shipping` (print already-bought labels). |
| `DocumentSlideOver` + `DocumentPreviewFrame` | Closable right viewer | Built. Used by `OrderDocumentsSection`, Testing `ManualsSection`. |
| `ShippingEntityContextHeader` / `CartonContextCard` | Title · item · listing · order id | Built. Exceptions editor already uses it. |
| `TriageScrollLayout` | Record-face knobs + scrollport | Built. |
| `OrderExceptionsWorkbench` | Table XOR (rail + editor); `?order=`; Escape; "Open full-screen form" | **Clone the shell, do not import the editor.** |
| `ExceptionsRecentRail` | Recents of the walk | Clone or extract a shared `WalkRecentRail`. |
| Testing `ManualsSection` / `ManualPicker` | Pair manuals | **Wrong grain** — `receivingLineId`. To-ship must pair **SKU / `sku_catalog_id`**, via `listAssignedManualsForOrder` / catalog manuals routes. |

### 3.3 Intake is not the To-ship walk

`OrderIntakeForm` still has G1–G4 Release, a documents **count + exemption
checkbox**, and `OrderShippingPanel` as its G3 card. Leave it. Add/intake is
how a *new* caged order is authored. The To-ship walk is for orders **already
in the live queue** that still lack a printable packet.

Extract the G2 exemption write (`useOrderTriage` `setDocsNotRequired` /
`cage-release` `docs-not-required`) as a small shared control if both surfaces
need the checkbox. Do not mount the whole intake overlay on To-ship.

---

## 4 · Component map (grow vs leave)

### Grow (To-ship hosts)

1. **`src/lib/orders/print-packet.ts`** (pure, no React) — packet-ready facts
   from `resolvePrintBundle` + manuals + `docs_not_required`. One function the
   badge, the facet, and the walk progress all call. Tests first.
2. **`UnshippedTable`** — pass `activeWorkRowId` / `renderActiveWorkBand` into
   `useOrdersSpreadsheet`; append the Labels verb to `selectionActions`.
3. **`useOrdersSpreadsheet.renderLeaf`** — when `activeWorkRowId` matches,
   outline the row (M3: colour only) and return `<>row + band</>`. DataTable
   needs **no** new engine prop if `renderRow` may return a fragment.
4. **`useDashboardBulkSelection` / `order-inspector-context.ts`** — add
   `labels` to the bulk-action union for the fulfillment lane. `run` starts
   the label run (does **not** print). Keep `print-shipping` as print-already-
   bought.
5. **`useToShipChrome`** — optional facet `needs_paperwork` that **narrows**
   the live queue (unlike `caged`, which swaps data source).
6. **`DeskActionSlot`** — third role so Paperwork can sit left of Export
   without last-writer-wins clobbering CSV. See §5.
7. **`PaperworkWalkHost`** (new file under `src/components/outbound/orders/paperwork/`)
   — clone `OrderExceptionsWorkbench` shell: URL `?paperwork=<id>` (or
   `?packet=`) **replaces** the table body with rail + editor. Mount from
   `OutboundOrdersDesk` / `ToShipWmsShell` the same way intake overlay is
   mounted: a mode of the desk, not a route.
8. **`PaperworkEditor`** — `TriageScrollLayout` + `ShippingEntityContextHeader`
   + two knobs: **Manuals** (`SkuManualsPanel`) and **Shipping**
   (`OrderShippingPanel`). `k of n` in the header. Escape / ◁ / ✕ exit to
   table. **No pairing UI. No Release.**
9. **`SkuManualsPanel`** — SKU-grain list + picker + `DocumentSlideOver`.
   New, or a thin adapter over catalog manuals APIs. Do not import Testing's
   `pairManual(receivingLineId)`.
10. **Queue count API** — `GET` (or existing queue-counts field) for
    packet-incomplete N, cache-bumped with the membership version.

### Leave alone

- `ExceptionEditor`, `ExceptionCatalogPairing`, `/shipping/exceptions`.
- `StationComposerHost` internals — AI later talks **to** it, not a second mouth.
- Compound slot engine / `PRODUCT_TABLES` unless a packet-status **cell** is
  explicitly added (then `pnpm run eval:cohort slot-table`).
- Pack station print path — it already consumes the packet. This plan fills
  the packet; it does not change `dispatchPrintBundle`.

### Never

- Fork `ExceptionEditor` into `PaperworkEditor` by copy-paste of pairing +
  leftover G2/G3.
- Stack the walk under the full DataTable.
- New `/shipping/labels` page (R-FLOW-6: shipping is a component).
- Standing keycaps; cheat sheet from table-foot `?`; `title` on the
  question-mark (`eval:cohort shortcuts`).
- Name-only auto-attach of label PDF pages (AI lane: tracking → order id →
  ZIP+address → name as **tie-break only**, confirm in the viewer).
- Put buy-label in the page-header primary/overall cluster.

---

## 5 · Header CTA vs DeskActionSlot law

Operator asked for Labels **immediately left of Sync Google Sheet**. Export
stays `overall` (further left). Last writer still wins **per role**.

**Ruling encoded here (2026-09-01, operator override same day):**

- Extend `DeskActionSlotRole` with **`leading`**.
- Paint order: `overall` · `leading` · `primary` (**Export · Labels · Sync**).
- Labels is immediately left of Sync Google Sheet. Export stays further left.
- Labels is a **collection door** (walk incomplete packets), not buy-on-selection.
- `L` binds on the To-ship desk while this CTA is mounted. No standing keycap.

If a later session refuses a third role, the fallback is: facet
`needs_paperwork` + an "Open paperwork walk" control in the table's existing
right-aligned strip (exceptions' `exceptions-open-form` pattern). Worse
discoverability; do not take that fallback without asking.

---

## 6 · Walk chrome (clone exceptions, swap the form)

`OrderExceptionsWorkbench` is the measured pattern:

```
selected ?  [ RecentRail | Editor ]  :  [ Open-form CTA + DataTable ]
?order=<id> in the URL is the selection.
Escape / header ◁ exits to the table.
```

Paperwork walk is the same XOR, different query param, different editor:

```
?paperwork=<id>  →  [ PaperworkRecentRail | PaperworkEditor ]
                   DocumentSlideOver overlays the editor column (closable).
```

Identity chrome (`ShippingEntityContextHeader`): product title, item number,
order id (listing link). Progress `k of n` is walk-host state (the rail's
filtered packet-incomplete list), not the table's selected-row count.

The right viewer is **`DocumentSlideOver`**, already closable. Items: shipping
label, packing slip, each assigned manual. Empty types still appear in the
type switcher (existing contract). Do not invent a second iframe pane.

Form column stays `max-w` of a single record (LabelRunBand already uses
`max-w-3xl` for the inline band). The full walk may use the exceptions editor
column width; the viewer is the overlay, not a 50/50 split that fights the
desk inspector.

When the walk is open, the To-ship **row inspector** does not also occupy the
right column (`ToShipWmsShell` `details={null}`), same as a focused exceptions
record. One occupant.

---

## 7 · Build lanes

### Lane 0 — Wire the designed label run (smallest, unblocks B)

**Files:** `useOrdersSpreadsheet.tsx` (`renderLeaf`), `UnshippedTable.tsx`,
`useDashboardBulkSelection.tsx`, `order-inspector-context.ts`, possibly
`OrdersQueueTableRow` for the M3 outline class.

1. Honor `activeWorkRowId` + `renderActiveWorkBand`.
2. Add `labels` selection action on the fulfillment lane; `run` sets the run
   to the checked ids, starting at the first.
3. Mount `LabelRunBand` as the band. Skip/Next/buy advances; Exit/Esc clears
   the run.
4. Bind `L` through `SELECTION_STATUS_BAR_META` (already `l`). Inert while an
   input/scan sink holds focus.
5. `pnpm run eval:cohort shortcuts`. Design-mcp session stamp before any
   `src/**/*.{tsx,jsx,css}` write.

**Done when:** select rows on `/shipping/orders` → Labels / `L` → band under
the active row with `OrderShippingPanel` (upload + buy). No new route.

### Lane 1 — Packet facts + count + facet

**Files:** `src/lib/orders/print-packet.ts` + test; queue-counts (or a thin
endpoint); `useToShipChrome.ts`; `dashboard-search-state.ts` if a new facet
token is added.

1. Pure `isPrintPacketIncomplete(facts)` + SQL/count for the live working set
   (`liveWorkingSetSql` already excludes unpaired-held).
2. Header badge reads that count.
3. Facet `needs_paperwork` narrows To-ship (does not swap to caged).

**Done when:** the number on the door matches the walk list, and both match
what pack print would call `missing`/`partial`.

### Lane 2 — Collection walk host (the original sketch)

**Files:** new `paperwork/` folder; `OutboundOrdersDesk.tsx` / `ToShipWmsShell`;
`DeskActionSlot.tsx` (`leading` role); DataTable header paint order.

1. `?paperwork=` XOR table, clone workbench shell.
2. `PaperworkEditor` composes `SkuManualsPanel` + `OrderShippingPanel`.
3. `DocumentSlideOver` from the editor (or a host-level mount keyed by order).
4. Header `leading` CTA "Paperwork" + count opens the walk at the first
   incomplete (or resumes `?paperwork=`).
5. E2E: open walk, attach/upload or exempt, advance, Escape returns to table;
   exceptions desk still has no tracking/release.

**Done when:** an operator can clear a packet without opening `/shipping/exceptions`
or Add/intake.

### Lane 3 — SKU manuals picker (G2 as a real link, not a count)

1. `SkuManualsPanel` against `GET/POST /api/sku-catalog/[id]/manuals` (and/or
   promote-to-document).
2. Viewer `showPrint={false}` here — pack prints. Same as Testing's comment.
3. G2 exemption checkbox as a shared control, not a second `docs_not_required`
   writer.

### Lane 4 — AI multi-page label PDF (later, not UI-first)

1. Upload lands as a **run artifact**, not an order document.
2. Split pages → extract tracking, then order id, then ZIP+address; **name is
   tie-break only**.
3. Ranked matches paint in `DocumentSlideOver`; operator confirms; confirm
   calls the existing attach path (same as upload tray).
4. Mutation ledger: `agent_mutations`. Prompt lives in the **desk composer**,
   not a form-local chat.
5. Never auto-attach on name alone.

---

## 8 · Design-mcp, graph, eval (gates, not suggestions)

Before any UI write under `src/**/*.{tsx,jsx,css}`:

```bash
node tools/design-mcp/ds.mjs contract "to-ship paperwork walk: header leading CTA + record face + document slide-over"
node tools/design-mcp/ds.mjs tokens radius
node tools/design-mcp/ds.mjs tokens space
node tools/design-mcp/ds.mjs tokens type
# after files exist:
node tools/design-mcp/ds.mjs critique src/components/outbound/orders/paperwork/PaperworkEditor.tsx
```

Code graph before shared edits: `find_symbol` → `impact_analysis` on
`useOrdersSpreadsheet`, `DeskActionSlot`, `TableStatusBar`, `OrderShippingPanel`.

Before claiming a lane done:

```bash
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
pnpm run eval:cohort shortcuts   # Lane 0 / any ? or L bind
# only if CompoundItem / slot layout / DataTable funnel changed:
pnpm run eval:cohort slot-table
```

Do not `git add -A`. Concurrent dirty tree. Stage only paperwork files.

---

## 9 · Session protocol

1. Re-read this file + R-FLOW-6/7 in the 3h plan.
2. Stamp design-mcp **before** the first `src/` write.
3. Build **one lane**. Lane 0 is the honest first PR: it mounts what is
   already written (`LabelRunBand`) instead of designing a third shipping UI.
4. Browser-verify `/shipping/orders`: selection Labels run **and** (once Lane
   2 exists) header Paperwork walk. Then `/shipping/exceptions` still pairing-
   only.
5. Do not claim done on a red `--fast` you introduced. Foreign red (other
   untracked files) — record and skip.

---

## 10 · Acceptance

- Exceptions form: catalog pairing only. Unchanged by this plan's UI.
- To-ship: packet-incomplete count is honest vs pack print.
- `L` / Labels: band under the active row, `OrderShippingPanel`, advance/exit.
- Header Paperwork: left of Export, opens the walk, not a dump under the table.
- Viewer: `DocumentSlideOver`, closable, types always listed.
- One composer. No `/ops/labels`. No standing keycaps.
- Pack scan still prints whatever this walk attached — no pack-station redesign.
