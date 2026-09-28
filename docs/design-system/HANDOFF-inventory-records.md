# HANDOFF — the inventory records: Stock + QC labels on the order record (written 2026-09-28)

Run with the `remake-in-style` skill (`.claude/skills/remake-in-style/SKILL.md`). Scope confirmed by
the owner: **the records**, plus **the fixed-width stage** To ship and Inbound history use. The list
rows themselves (`IndustrialRecord` in `StockLedger` / `QcLabelsLedger`) are untouched (Stock stays
keep-sheet, `RECORD-CARD-MIGRATION.md` #36).

## 1. What landed

| Change | Where |
|---|---|
| `RecordLedger` takes `recordActions` → the open record's header band, top-right (DeskRecordPlane `actions`) — the `OrderRecordStatus` slot for every ledger desk | `design-system/components/record-ledger/RecordLedger.tsx` |
| `LifecycleCode` reads a desk's own `RecordStateFace` as well as an outbound `LifecycleState` — one badge for every desk | `record-ledger/LifecycleCode.tsx` |
| Stock has its own state token `STOCK_LIFECYCLE` (`STK` In stock · `OOS` · `HLD`), no longer the outbound lifecycle. The outbound `ready` state was renamed (`toPick` / `picked`) by another session, which crashed `/inventory/stock?status=catalog` (`LIFECYCLE.ready` undefined → `reading 'dot'`); a shelf's state is not an order's anyway | `design-system/tokens/stock-lifecycle.ts`, `inventory/stock/stock-record.ts` (`stockRecordState`, `stockRecordNext`) |
| Stock and QC labels on the fixed-width `card` stage (`DESK_STAGE_FIXED_CLASS`, `max-w-6xl`) instead of `flush` — measured 1152px at x 264 on a 1440 viewport, same as `/shipping/orders` and `/incoming?lane=docked`; Split still takes the full width. Replenish's need sheet stays flush | `inventory/InventoryDeskFrame.tsx` |
| Stock pair record: header = title · `SKU · bin`, ONE status `STK · In stock` + next (`Count`); main = Item (photo, title, SKU, qty, held as; **Open SKU** top-right) → Count at this location; aside = Location (bin, room, last moved, counted). `EvidenceTitle`, state strip, 4:3 photo and the decision bar are gone | `inventory/stock/StockEvidence.tsx` (`StockRecordStatus`), `StockLedger.tsx` |
| QC label record: header = the sticker (`unit id`) · `SN …`, ONE status (`STK · In stock` / `HLD · Held` …) + next (`Pick` / `Pack`); main = Item (title, SN, SKU, condition) → Label (**Reprint** top-right; unit id, printed, reprinted N× last · who) → Quality control; aside = Location (bin, unit status) → Outbound (order, allocation, serial). The "held for order" notice merged into Outbound's Serial row (it said the same thing). Print form = one group, **Print** top-right | `inventory/qc-labels/QcLabelsLedger.tsx` (`QcLabelRecordStatus`) |

Verified on :3050, deep-linked, In place + Split: `/inventory/stock?status=catalog&open=312:00099-P-1:bin`,
`/inventory/qc-labels?open=2476` (in stock, reprinted), `/inventory/qc-labels?open=2203` (held), and the
Print form (header **Print QC label**). **Floor** is not offered on either desk (no floor face registered).

## 2. Owner questions (not built)

1. **SKU exception record** — the on-hold (`TMP-`) face of Stock (155 of 216 pairs) is
   `SkuExceptionEvidence` + `SkuExceptionCreateForm` (~1.5k lines, shared with `/inventory/sku-exceptions`).
   Still the evidence stack. Same run, second target: `remake /inventory/stock?open=143:TMP-H5YM4-K68X4:bin&sku=TMP-H5YM4-K68X4 like the order record`.
2. **Triage badge face** (`HANDOFF-inbound-record.md` §2 F) — the header status is still the solid
   `stateBadgeClass` chip, same as the order record. Changes when F is decided at the token.
3. **QC label photo** — `QcLabelRow` carries no image; the item card shows initials. Needs the loader
   to join the SKU photo (`productImageUrl`) if the owner wants it.
