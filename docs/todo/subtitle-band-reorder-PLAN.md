# Under-title fact reorder — plan of record

**Drafted** 2026-08-31 · **Companion** [`seller-table-program-PLAN.md`](seller-table-program-PLAN.md) ruling 12 (headers drag to reorder) · **Engine** `reorderFieldBinding` / `useSlotTableLayout`

Status columns and sheet `subtitle:N` tracks already reorder by click-and-hold on the **header**. Facts painted **under the product title** (compound morph) must use the same gesture, the same write, and the same reliability — on every family, every morph.

---

## 00 · What is already true

| Surface | Gesture | Payload | Write |
|---|---|---|---|
| Column **header** (`LedgerGridColumnHeader`) | HTML5 drag on the header cell | `dataTransfer` key → drop key | `onReorderColumn(dragKey, dropKey)` → field ids → `reorderFieldBinding` → org `PUT /api/tables/layouts` |
| Fields picker | Bind / unbind only | — | Same org write. ↑/↓ arrows were removed 2026-08-31; order is edited where the operator can see it. |
| Compound **subtitle line** (pre-this-plan) | HTML5 drag on each part | React `dragKey` state + **inline index** | Orders-only `handleReorderSubtitle` mapped the index through a notes-stripped list, then `onReorder` |

The header path is the one that works. The subtitle path forked it three ways, which is why click-and-hold under the title felt dead.

---

## 01 · Why the under-title drag failed

1. **Index, not key.** Headers report `dragKey` / `dropKey`. The subtitle drop reported the index in the **inline** list (notes stripped). Notes are right-pinned (ruling 8) so they leave the inline flow; their binding may still sit in the **middle** of `subtitleBindings`. Landing at inline index 2 was not "the third bound fact" whenever notes was not last. A drop that names a **destination field** cannot go wrong that way.
2. **React state gated `preventDefault`.** `onDragOver` only allowed a drop while `dragKey` was set on that row instance. Virtualized rows remount; Firefox withholds `getData` until `drop`. A remount mid-drag cleared `dragKey` and the browser refused the drop. Headers always `preventDefault` on `dragOver` and read the payload **on drop**.
3. **Buttons ate the drag.** Qty-as-plain-span could start a drag. Condition (dropdown `button`), listing (`button`), qty-editor (`button`), and `CopyChip` (`button`) cannot: HTML5 does not start a parent `draggable` from a button / link. The facts the operator actually grabs were the ones that did not drag.
4. **One family wired it.** Only `useOrdersSpreadsheet` passed `onReorderSubtitle`. `CompoundRow` (Daily, Tasks, catalog-link, …) and Receiving's compound cells never received a handler, even though they paint the same `CompoundItem` and write through the same `useSlotTableLayout`.

---

## 02 · The one primitive

```
dragFieldId + dropFieldId
  → reorderFieldBindingByDrop(layout, dragField, dropField)
  → reorderFieldBinding(layout, dragField, indexOf(dropField))
  → writeOrgLayout
```

Laws:

- A drop names a **destination field**, not a hop count (`moveFieldBinding` stays the neighbour-swap for any leftover arrows).
- Cross-band drops refuse (status onto subtitle is a **bind** change, owned by the Fields picker).
- Same-field drop is a no-op (`ok`, same layout).
- Notes stay **pinned right** in paint. They are not an inline drop target. Key-to-key among the inline facts still lands at the correct **binding** index even when notes sits in the middle of the array.
- The write is organization-wide (ruling 7). `canManage` false → toast, no personal fork.

Track keys stay positional (`status:1`, `subtitle:2`). Field ids travel in `SlotTrackFields.fieldId` (header) or `CompoundSubtitlePart.key` (under-title). The primitive never sees a track key.

---

## 03 · Two gestures, one handler

```
                    ┌─ LedgerGridColumnHeader ─┐
 click-and-hold ──► │ HTML5 · text/plain key   │
                    └──────────┬───────────────┘
                               │ dragKey, dropKey  (track keys)
                               ▼
                    DataTable synthesizes field ids
                    via dropSlotColumns(columns)
                               │
                               ▼
                    fields.onReorderByDrop(dragFieldId, dropFieldId)
                               │
          ┌────────────────────┴────────────────────┐
          │                                         │
   SlotLayoutReorderContext              useSlotTableLayout
   (compound subtitle line)              (org write)
          │                                         │
          ▼                                         ▼
   CompoundItem reads context            reorderFieldBindingByDrop
   HTML5 · text/plain = part.key         → PUT /api/tables/layouts
```

**Header.** Every `DataTable` that already passes `fields` from `useSlotTableLayout` gets header drag with no per-family `onReorderColumn`. `onReorderColumn` remains an escape hatch (explicit wins if both are set).

**Under-title.** `DataTable` provides `SlotLayoutReorderContext`. `CompoundItem` reads it. No prop threading through `CompoundRow` / `OrdersQueueTableRow` / Receiving. A test may still pass `onReorderSubtitle(dragKey, dropKey)` as an override.

**Sheet morph.** Subtitle bindings are real `subtitle:N` columns. They reorder through the **header** path. There is no second under-title line to drag. Same primitive.

**Compound morph.** Status bindings are real `status:N` columns (header path). Subtitle bindings live inside the item cell (context path). Same primitive.

---

## 04 · Gesture contract

Headers stay HTML5 (`LedgerGridColumnHeader` is an empty `select-none` cell).

**Under-title uses pointer capture, not HTML5.** Qty is a caret editor, condition is a Radix menu that opens on pointerdown, listing is a hover chip, and the painted text is 1–2 characters Chrome will start selecting. `draggable` on the wrapper therefore never starts — that is why hold-and-move under the title felt dead. `useSubtitlePointerReorder` tracks the pointer on `window`, arms after 6px, and drops onto `data-subtitle-part`. Playwright `locator.dragTo` speaks this gesture.

| Rule | Header | Under-title |
|---|---|---|
| Start | `draggable` on the cell | pointerdown on the **part wrapper**; arm after 6px (`useSubtitlePointerReorder`) |
| Payload | `dataTransfer` key | field id from `data-subtitle-part` under the cursor |
| Drop | `onReorderColumn(drag, drop)` | `onReorderByDrop(drag, drop)` |
| Highlight | `bg-surface-sunken` | same class on the drop **part** |
| Click vs drag | drag suppresses the sort click | `skipClick` suppresses listing-open / editor-open / condition menu |
| Virtualization | no per-row drag context | no dnd-kit, no `DndContext` per row |
| Notes / chrome | `select`, `_fill`, paint tracks never reorder | the notes **glyph** is not a drop target |

Click-and-hold on qty, condition, or the listing icon must start a reorder. A click without a drag still opens the listing / condition menu / qty editor.

E2E: `tests/e2e/to-ship-subtitle-reorder.spec.ts`.

---

## 05 · Propagation (every family, every morph)

`useSlotTableLayout` already has twenty family configs. Putting `onReorderByDrop` on the **fields bag** and the context on **DataTable** is the propagation. A new family that mounts `DataTable` + `fields={useXxxTableLayout().fields}` inherits both header and under-title reorder. A family that paints `CompoundItem` outside `DataTable` (kiosk cart) gets no drag until it mounts the provider — that is correct; it has no layout writer.

Do **not** copy `handleReorderColumn` into each workspace. Orders deletes its local mapper.

---

## 06 · Listing control (same line, not a second job)

The item-number subtitle fact is an icon, not the word "Listing" and not the id.

- Face: `ExternalLink` at `h-3 w-3` — the same box as the notes `FileText` glyph, centred on the `text-xs` secondary track (`items-center`).
- Ink: `text-text-info`.
- Click: open `openHref`. Hover menu: copy the item number.
- Do not use `ExternalLinkActionIcon` / `IconButton` (14px chrome; steals the drag).
- Do not paint the item number.

---

## 07 · Tests

- `reorderFieldBinding` absolute move; clamp; no-op at same index; never mutates input.
- `reorderFieldBindingByDrop` same-band land; cross-band refuse; notes-in-the-middle still lands on the named field.
- `dropSlotColumns` maps track keys → field ids; ignores chrome tracks with no `fieldId`.
- Listing paint: icon + `aria-label="Open listing"`; no `Listing` word; no last-8 of the id.
- Subtitle parts with a reorder handler render `draggable` and `data-subtitle-part`.

---

## 08 · Out of scope

- Moving amount under the title.
- Making notes an inline drop target (width law).
- dnd-kit on virtualized rows.
- Keyboard reorder of the subtitle line (Fields picker is bind-only; header has no keyboard reorder either).
- Per-staff layout writes.
