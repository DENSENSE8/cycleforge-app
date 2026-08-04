---
name: receiving-grid-cell
description: Edit Unbox / History / Testing workbench spreadsheet cells (Receiving LedgerGrid). Use when changing PRODUCT, BY/date, QTY, STATUS/condition, stage clock, ORDER, TRACKING, or other RECEIVING_GRID_COLUMNS display — not the open-carton PO accordion, not outbound orders, not Incoming POS.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Receiving workbench grid cells — agent load map

Unbox has **two** table surfaces. This skill is only for the **Workbench LedgerGrid**
(Queue · Viewed · History spreadsheet). Do not open the Station PO accordion unless the
user names line chips / expand-edit.

Full map: `docs/todo/unbox-receiving-grid-CONTEXT-MAP.md`. Display law:
`.claude/rules/display/workbench.md` → **Receiving spreadsheet agent waist**.

## Open only (allowlist)

1. Column SoT — `src/lib/receiving/receiving-grid-layout.ts` (`RECEIVING_GRID_COLUMNS`)
2. The specific cell under `src/components/station/receiving-grid/cells/` (not the whole tree)
3. Align helpers — `resolveGridColumnAlign` / `gridCellAlignClass` from `@/design-system/components/grid`
4. Shared value atoms if needed — `src/components/ui/grid-cells.tsx`
5. Row shell only if wiring columns → cells — `ReceivingGridRow.tsx` (thin). Prefer
   `LedgerGridLeafRow` + `render*GridCell` (Receiving / Incoming / Catalog / Ready /
   Bins already follow this). Cell chrome SoT: `ledgerGridCell` in
   `@/design-system/components/grid`.
6. Header only if the task is header/sort/resize — grow `LedgerGridColumnHeader`; thin adapter `ReceivingGridColumnHeader.tsx` (do not re-fork select-all / sort / frozen chrome)

## Column → file

| Column key | File |
|---|---|
| `select` | `cells/ReceivingSelectCell.tsx` |
| `title` | `cells/ReceivingTitleCell.tsx` |
| `date` | `cells/ReceivingDateCell.tsx` |
| `qty` | `cells/ReceivingQtyCell.tsx` |
| `condition` | `cells/ReceivingConditionCell.tsx` |
| `stage` | `cells/ReceivingStageCell.tsx` |
| `location` | `cells/ReceivingLocationCell.tsx` |
| `platform` | `cells/ReceivingPlatformCell.tsx` |
| `order` | `cells/ReceivingOrderCell.tsx` |
| `tracking` | `cells/ReceivingTrackingCell.tsx` |
| `serial` | `cells/ReceivingSerialCell.tsx` |
| dispatcher | `cells/index.ts` (`renderReceivingGridCell`) |

## Do not open unless the task names them

- `PoLineRow`, `PoLineMetaGrid`, `LineEditPanel`, `useUnboxLineController`, `useReceivingLineCore`
- `OrdersQueueTableRow`, `OrdersGridView`, `orders-queue/*`
- `incoming-grid/*`, `INCOMING_GRID_COLUMNS`
- KPI / filter chrome (`UnboxKpiStrip`, `ReceivingLinesTable` wiring — only if host bug)
- `ReceivingLinesTable` — composition host; skip for cell display

## Hard laws

- Grow `RECEIVING_GRID_COLUMNS` for column model changes — never a page-local twin.
- Justification via `resolveGridColumnAlign` only — never per-cell `justify-*`.
- Compose `GridDateCellValue` / `GridCellDash` / CopyChip family — do not invent parallel markup.
- Visual redesign / column add-remove is Ask-first unless the task says so.
