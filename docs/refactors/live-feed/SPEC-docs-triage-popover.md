# Docs triage popover — layout spec (operator rulings 2026-10-06)

Replaces the current `PrintPacketsDialog` body (stacked label / slip / paperwork
sections + `LineSkuLink` free-text SKU field). Design only; not built.

## Hierarchy (progressive disclosure)

| Level | Surface | Shows |
|---|---|---|
| 0 | Live feed card | Order # (top left), platform (top right); three marks — Label · Slip · Paperwork — bright = linked, muted = missing, faint = not required. A mark opens level 1 on that tab. |
| 1 | Popover header + rail | Identity strip (pinned, never scrolls). Rail of selected orders, 3 marks each, filter "missing only". Toggle: **Rail ↔ Matrix**. |
| 2 | Tab body | One document type for one order: preview if linked, suggestions + search if missing. |

## Identity strip (all four, ruling)
Order # + platform · Tracking + carrier · SKU + item title + photo + qty · Buyer + ship-by (late state).
Full numbers, mono, copyable. Multi-line orders: one strip row per line, collapsed to "N lines" past 2.

## Tabs — top level
`Shipping label` · `Packing slip` · `Product paperwork` — `PaneHeaderTabs`, each with a linked/missing mark
and count. Opens on the tab of the mark pressed; from the bulk bar, on the first missing tab.

- **Linked →** large preview (`DocumentPreviewFrame` / `FetchedPdfFrame` / `LabelFacePreview`), quiet action row:
  Replace · Unlink · Open in tab. Paperwork tab lists one preview per pinned manual.
- **Missing → suggestions, then search (ruling).** Top 3 ranked matches with one-click Link, search field below,
  Upload as secondary; Buy label / Fetch from channel live inside their tab.
  - Label: stored `label_ingestions` (QUARANTINED, has tracking), tracking-match first (`UnpairedLabelPicker` source + `/candidates`).
  - Slip: Fetch from channel first (`/api/orders/[id]/documents/fetch`), Upload.
  - Paperwork: manual library (`/api/product-manuals/search`) ranked by SKU → item # → part number in title → title similarity.

## SKU — always suggest, operator confirms (ruling)
No free-text "Link to SKU" field. When a line has no `sku_catalog_id`, the strip shows the best catalog match
("SKU 00822 · matched by part no. 360148-0010") with **Confirm** / pick another. Confirm writes through the
learning path (`batchPair` → `sku_platform_ids` + backfill), not the one-line `/api/orders/assign`, so the
next order of that listing resolves on ingest. `LineSkuLink` is deleted.

Root cause to fix alongside: order 19611 (`19-15205-47811`, `account_source='ebay purchasing'`) arrived with
blank SKU and item number and no title match — find the writer that bypassed `resolveCatalogLink`.

## Multi-order — both, toggle (ruling)
- **Rail (default):** per-order 3 marks, pick one to drill into tabs.
- **Matrix:** orders × (Label, Slip, Paperwork) cells; click a missing cell to link; select a column's cells to
  link one document to many orders (new — no bulk SKU/manual linker exists today).

## Footer
Print (bottom right) for the active tab's stock across the selection; skipped-order count on the left.

## Rulings round 2 (operator 2026-10-06)

- Bulk dock quick verb: the text **Open** with a package icon — no pointer glyph.
- SKU shows its platform ("ECWID SKU 01241") with an external link to **the listing on the platform**
  (stored listing URL, else built from the item number) — check it, confirm it, then pair.
- Wrong / missing SKU: Confirm also offers a **catalog search** (SKU or title), each result with its listing link.
- Layout: a **full-screen sheet** — rail | work column | tall portrait viewer. The viewer shows whatever is
  selected: a linked document, or a search result **before** it is linked.
- Paperwork search: click a result → preview in the viewer → **Link** on the viewer (pairs to the SKU). Nothing
  links on click.
- Label upload, root cause: the client stops on "Page N has no readable tracking number" and the server's
  confirm refuses a label without tracking. Ruling: **ask for tracking, allow skip** — a Tracking field
  (carrier detected as typed), File with it, or File without tracking (linked, printable, no tracking yet).
- Tracking already on a **different order**: warn and choose — Move to this order · Keep on both · Cancel,
  with the label preview and both orders shown.
- This order already has a **different tracking**: warn — Replace · Add as another box.
- Motion: purposeful and quick (~150 ms fades/slides, viewer cross-fade, marks pop on link, list reorder);
  honours reduced motion.
