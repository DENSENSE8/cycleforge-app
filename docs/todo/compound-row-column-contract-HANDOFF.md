# HANDOFF — The compound row column contract (HARD RULES)

**Session:** 2026-08-20 · **Status:** implemented for Receiving + Orders · **Next:** Incoming
**Companions:** [`table-row-thumbnail-hard-cache-HANDOFF.md`](table-row-thumbnail-hard-cache-HANDOFF.md) · [`one-table-engine-orders-host-PLAN.md`](one-table-engine-orders-host-PLAN.md)

---

## 0. The hard rules

These are **operator rulings, not preferences**. A surface does not get to
reinterpret them, and a new table adopts them by writing an adapter — never by
declaring a different column order.

| # | Rule |
|---|---|
| **HR-1** | **The image is ALWAYS the leftmost column.** Only the select gutter may precede it. It is the frozen row handle. |
| **HR-2** | Column order is **image · ids · title · status**. No surface reorders it. |
| **HR-3** | **IDS** = order/PO number on top, tracking number below it. |
| **HR-4** | **TITLE** = product title on top, the operator **note** below it. |
| **HR-5** | **STATUS** = state pill on top, **delay timing** below it. |
| **HR-6** | Every identity mark is a **colour dot**. There is no glyph face in the table engine. |
| **HR-7** | One display method. **No density / layout settings** until every table is on this row. |

---

## 1. Why each rule, so nobody "improves" it back

- **HR-1 (image leftmost).** On a floor an operator matches the *object in their
  hands* to a row. The photo is the fastest match a human can make, so it is the
  first thing the eye lands on and the thing that stays pinned while facts
  scroll. Any other leftmost column makes them read before they can match.
- **HR-3 vs HR-4 (codes are NOT under the title).** A SKU under a product title
  duplicates the IDS column two tracks away. The second line under a title is
  the only place a row can say something the schema has no field for — so it is
  the note.
- **HR-5 (delay, not a timestamp).** "When did this happen" is not a triage
  question; "is this late and by how much" reorders the queue. On time renders
  as an explicit **On time**, never blank — blank is ambiguous between *no
  deadline*, *not computed* and *fine*, and a floor should not resolve that
  ambiguity a hundred times a screen.
- **HR-6 (dots, not glyphs).** House identity law: the leading mark on an
  identity cell is the brand dot. This shipped wrong twice — once as hardcoded
  `OrderIdChip`/`TrackingChip` faces (the `#` hash and MapPin), once as an
  `omitCellIcon`-derived `identityVariant` whose **`'icons'` default** caught any
  column model that did not happen to declare `order`/`tracking` keys. Both are
  deleted; the grid row now passes `variant: 'plain'` unconditionally.
- **HR-7 (no settings yet).** Every toggle multiplies the states each surface has
  to be verified in. Get all tables onto one row first.

---

## 2. How it is built (do not fork this)

```
family row ──(pure adapter)──▶ CompoundRowView ──▶ ONE shared cell set
```

| Piece | Path |
|---|---|
| View model + `firstNote` | `src/components/tables/compound/compound-row-model.ts` |
| The ONLY cell implementation | `src/components/tables/compound/CompoundCells.tsx` |
| Fixed geometry (48px row / 32px thumb) | `src/components/tables/compound/compound-row-chrome.ts` |
| Receiving adapter | `src/lib/receiving/receiving-compound-view.ts` |
| Orders adapter | `src/lib/orders/orders-compound-view.ts` |
| Receiving columns | `RECEIVING_COMPOUND_COLUMNS` |
| Orders columns | `ORDERS_COMPOUND_COLUMNS` |

The view model is **strings and enums only — no React nodes**. A view model that
could carry JSX would let a family smuggle bespoke markup back in, which is a
fork wearing a different hat.

**Adding a table = one adapter + one column array. Never a cell.**

---

## 3. Adding the next table (Incoming is next)

1. Write `<family>-compound-view.ts` — pure `row -> CompoundRowView`.
2. Add `<FAMILY>_COMPOUND_COLUMNS` with the **same keys and the same widths** as
   the two existing arrays. A test asserts Receiving and Orders match; extend it
   to cover the new family.
3. Add the five thin cell wrappers that place the shared bodies inside that
   family's grid-cell chrome.
4. Point the surface's `columns` at the compound array.

---

## 4. Known gaps (state these, do not silently fill them)

- **Orders has no photo.** `ShippedOrder` carries no image field, so HR-1's
  column renders the typed placeholder. Fixing it is a query + row-model change
  (join the catalog listing image), tracked in the caching handoff.
- **Receiving has no delay.** Receiving lines have no ship-by deadline, so HR-5
  renders the on-time face. When a receiving SLA lands, thread `delayDays` in
  the adapter — no cell change needed.
- **Incoming is not ported.** Separate `INCOMING_TABLE_BINDING` mount.
- **Nothing is visually verified** — no signed-in session was available.

---

## 5. Guard

`src/components/tables/compound/compound-row-model.test.ts` pins HR-1, HR-2 and
the shared-not-forked property (both families declare identical keys AND widths).
If a family ever needs to diverge in geometry, that is a signal something is
wrong — not a licence.
