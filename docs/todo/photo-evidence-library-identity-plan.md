# Plan 3 — Photo library identity + stage folders (WS-PHOTO)

> **Status:** Planned · 2026-07-20  
> **Parent:** [`photo-evidence-chain-INDEX.md`](./photo-evidence-chain-INDEX.md)  
> **Depends on:** Plan 1 (stage vocabulary + clean filters)

## Verdict

Library already filters by SKU/serial/PO but **tiles and folders are PO/ticket-centric**. Grow library SELECT + display SoT so operators browse **stage → PO → SKU → serial**, without inventing a second search engine.

## Verified gaps

| Capability | Status |
|---|---|
| Filter by `sku` / `serial` / `poFinder` | Backend EXISTS in `library.ts` |
| SKU in sidebar search fields | **Missing** (`PHOTO_SEARCH_FIELDS`) |
| SKU / serial on `LibraryPhoto` / tiles | **Missing** |
| Stage folders (arrival vs unbox carton vs item) | **Missing** — one “Unboxing” blob |
| Viewer context | Serials lazy via `photo-receiving-context`; SKU absent |

## What ships

### 1. Library row enrichment

Extend `src/lib/photos/queries/library.ts` SELECT (and `photo-library-types.ts`) with nullable:

- `sku` (from `RECEIVING_LINE` → line.sku / catalog; or `SERIAL_UNIT` → unit.sku)
- `serial_number` / `unit_uid` when linked or via provenance
- `stage` derived from Plan 1 `stageFromPhotoType` + entity_type
- Keep `po_ref` as today

Never join SKU string schemes incorrectly — follow existing library SoT (“never join the two SKU schemes on the string”).

### 2. Display names SoT

Grow `src/lib/photos/display-names.ts` + tests:

- Primary label preference: ticket → **PO · SKU · serial** → PO → type → id  
- File/share names include stage slug when known (`PO-14-4421_SKU-…_SNxxxx_arrival.jpg` style — keep path-safe)

### 3. Sidebar / folders

`PhotoStationFolders.tsx` + `image-type-defs.ts` / `library-filter-state.ts`:

**Option A (preferred, low blast):** keep built-in `unboxing` scope; add **sub-filters** `stage=arrival_package|unbox_carton|unbox_item` (URL params).  
**Option B:** new built-in scopes — only if sub-filters feel invisible in UX review.

Also add **SKU** to `PHOTO_SEARCH_FIELDS` + finder kind if needed (or map SKU into `poFinder` smart resolve — prefer explicit field).

### 4. Grid + context panel

- `PhotoCard.tsx` / list view — show SKU · serial pair under PO when present.
- `PhotoContextPanel.tsx` — SKU next to serials; stage chip; deep link to receiving line / unit journey.
- `library-context-label.ts` — header when filtering by SKU/serial.

### 5. Optional secondary SKU link (insurance-adjacent)

When uploading `receiving_item` with `sku_catalog_id` on the line, **optionally** `linkPhoto` → `SKU` with `link_role: 'primary'` or a dedicated role if product wants catalog browse of “all intake photos of this SKU.”

**Ask before shipping:** second link multiplies delete/cascade complexity. Default = display join only; dual-link deferred unless library “by SKU folder” needs it.

### 6. Tests / e2e

- Unit: display-names + library filter URL round-trip for stage/sku.
- E2E: `photos-library-context-panel.spec.ts`, `photos-library-deep-link.spec.ts` — assert SKU/serial visible when fixture has line-linked photos.

## Explicitly NOT in this plan

| Cut | Why |
|---|---|
| Capture UX | Plan 2 |
| Journey media rows | Plan 4 |
| Claim attach policy | Plan 5 |
| New search engine / embeddings | Forbidden — use existing library waist |

## Done when

- [ ] Library tiles show PO · SKU · serial when resolvable.
- [ ] Operators can filter Unboxing by stage (arrival / carton / item).
- [ ] SKU searchable from sidebar fields.
- [ ] Context panel shows SKU + stage.
- [ ] Verify green.

## Key files

- `src/lib/photos/queries/library.ts`
- `src/lib/photos/library-filter-state.ts`
- `src/lib/photos/display-names.ts`
- `src/lib/photos/library-context-label.ts`
- `src/lib/photos/image-type-defs.ts`
- `src/components/photos/PhotoStationFolders.tsx`
- `src/components/photos/photo-library-grid/PhotoCard.tsx`
- `src/components/photos/PhotoContextPanel.tsx` (path as in tree)
- `src/components/photos/photo-library-types.ts`
