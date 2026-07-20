# Handoff — To Ship · Pending table → Sheets-like WMS grid

> **Audience:** next coding agent (or human) continuing the Pending Orders UX rewrite.  
> **Surface:** Dashboard · Outbound · **To Ship** · Pending lane (`OrdersQueueTable` / `OrdersQueueTableRow`).  
> **North star:** Kinetic Ledger ops density + 2026 premium SaaS table craft (Linear / Stripe Dashboard / Sheets hybrid) — **legible throughput**, not marketing chrome.  
> **Do not** restyle header tabs, KPI strip, or swimlane chrome. **Only** the queue table body + sticky column header.

---

## 1. Verdict (what “done” looks like)

A warehouse operator opens **To Ship → Pending** and sees a **single continuous spreadsheet**:

- One sticky column header **above** day bands.
- Every fact in its **own column**, vertically locked header ↔ cell.
- **No per-row drag grips** — grip exists **only** in the sticky header (select-all context).
- Platform / order / tracking cells are **quiet text or underline chips without leading icons** (this table only).
- Scan path reads left → right like Google Sheets: select → status → title → qty → condition → age → notes → platform → order → tracking.

If you can still “feel two zones” (fat title left / chip soup right), it is not done.

---

## 2. Design intent — modern 2026 WMS table

### Principles

| Principle | Apply as |
|-----------|----------|
| **Data is the chrome** | Facts own columns; chrome (grip, ☐) is 1–2 quiet leading tracks. |
| **Sheets grammar** | Fixed column tracks, hairline dividers, sticky header, no card soup. |
| **Scan before decorate** | Status = 1 dot. Age = tabular urgency. Notes = truncated text. IDs = mono last-4 / short labels **without** icon noise. |
| **One select model** | Header ☐ = select all / clear. Row ☐ = row select. **No pencil toggle** on To Ship (already true). |
| **Compose, don’t fork** | Grow `ordersQueueGridTemplate` + row/header — do **not** invent a second table engine beside `OrdersQueueTable`. |
| **Kinetic Ledger** | Semantic tokens only; `text-role-*`; `QUEUE_ROW.px`; day bands stay. No foreign design kit. |

### Anti-goals

- Per-row `GripVertical` (clutters the vertical scan line).
- Icon-heavy CopyChips in this surface (platform glyph, hash, pin, external-link stacks).
- Collapsing platform + notes + order into one “busy” cluster.
- Raising DS-ratchet baselines or `--no-verify`.
- Rewriting Packed / Shipped / Receiving rows in the same PR unless free (recommend as promote-next).

---

## 3. Target column model (strict order)

Desktop grid — **one track per column**, header label locks to cell:

| # | Key | Header label | Cell content | Width intent |
|---|-----|--------------|--------------|--------------|
| 0 | `select` | (☐ only — optional micro grip **in header only**) | Row checkbox | `1.25rem`–`1.5rem` |
| 1 | `status` | Status (or icon-only / sr-only) | Pipeline status **dot** (+ tooltip) | `1.25rem` (`META_COL.dotTrack`) |
| 2 | `title` | Product | Product title (`text-role-data`, truncate) | `minmax(14rem, 1.6fr)` — **only** flexing track |
| 3 | `qty` | Qty | Tabular qty | `2.5rem` |
| 4 | `condition` | Cond | Condition SoT label / tone | `3.5rem` |
| 5 | `age` | Age | Days-late pill **or** lane-age mono — never both | `3.25rem` |
| 6 | `notes` | Notes | Truncated notes text; empty → quiet `—` or blank | `minmax(6rem, 0.7fr)` |
| 7 | `platform` | Platform | Short label (`ebay` / `amazon`) — **no platform icon** | ~`5.5rem` |
| 8 | `order` | Order | Order id / last-4 — **no `#` glyph icon** | ~`4rem` |
| 9 | `tracking` | Tracking | Tracking / scan last-4 — **no pin / truck icon** | ~`4rem` |

### Header lead cell

- **Grip:** only here (affordance for future column/lane reorder — decorative OK if DnD not wired).
- **Select-all ☐:** already wired via `emitToggleAll(selectionScope)`.
- **Do not** render grip in `OrdersQueueTableRow`.

### Day bands

Keep `DateGroupHeader` sticky **below** the column header (`ORDERS_QUEUE_DATE_STICKY = top-9` or remeasure). Do not merge dates into the column header.

---

## 4. Current code map (start here)

| Concern | Path |
|---------|------|
| Grid tokens / sticky offsets | `src/lib/dashboard-order-row-layout.ts` |
| Sticky column header | `src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx` |
| Row renderer | `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` |
| Table shell + sticky date offset | `src/components/dashboard/OrdersQueueTable.tsx` |
| Multi-product group summary | `src/components/dashboard/orders-queue/OrderGroupSummary.tsx` |
| Identity chips (icons live here) | `src/components/ui/OrderIdentityChips.tsx` + `CopyChip` family |
| Chip column widths | `src/components/ui/ChipColumns.tsx` (`CHIP_COL`) |
| To Ship always-select / no pencil | `src/hooks/useDashboardBulkSelection.tsx`, `OutboundWorkspaceHeader.tsx` |
| Pending lane host | `src/components/unshipped/UnshippedShelfBoard.tsx` |

---

## 5. Implementation brief

### 5.1 Grow the grid SoT

Update `ordersQueueGridTemplate()` to **ten tracks** matching §3 (drop the bundled `ids` mega-column and the lead “grip+checkbox” combo width).

```ts
// Conceptual — implement in dashboard-order-row-layout.ts
select | status | title | qty | condition | age | notes | platform | order | tracking
```

Header + row + `OrderGroupSummary` **must share the exact same template string**.

### 5.2 Row anatomy (desktop)

1. Remove `GripVertical` from each row; keep only the checkbox in `select`.
2. Split product: **status dot** in `status` track; **title text only** in `title` (do not nest dot inside a flex that steals title width unevenly).
3. Move notes out of the Age cluster into dedicated `notes` column.
4. Render platform / order / tracking as **separate cells** (not one `OrderIdentityChips` flex blob), so headers `Platform | Order | Tracking` lock.

### 5.3 Quiet chips — this table only

Add a presentation mode for identity cells, e.g.:

- `OrderIdentityChips` prop `variant="plain" | "icons"` (default `"icons"` for other surfaces), **or**
- Small pending-table cell helpers that call CopyChip with `icon={false}` / dense plain text while preserving copy + hover menus.

**Hard rule:** do not globally strip icons from CopyChip — Labels / Receiving / Station still want them.

Plain cell recipe:

- Mono / caption text, optional underline for link affordance.
- Hover menu / click-to-copy behavior **preserved**.
- Empty → aligned placeholder or empty cell (no icon ghost).

### 5.4 Sticky stack (already partially landed)

- Column header: `sticky top-0 z-sticky` + opaque/blur fill.
- Day bands: `sticky` with `ORDERS_QUEUE_DATE_STICKY` (`top-9`).
- Remeasure if header height changes after the new columns; update the token, don’t hardcode a second magic class in `QueueDateSection`.

### 5.5 Mobile

Keep stacked fallback (`ordersQueueRowShellClass(true)`). Prefer: title + meta line; IDs row without icons. Don’t force ten columns on phone.

---

## 6. Visual QA checklist

- [ ] Header cells align with data columns at 1280 / 1440 / 1680 widths (no Plat over Order).
- [ ] No grip on rows; grip only in sticky header lead.
- [ ] Notes never sit under Age header; platform never shares a cell with notes.
- [ ] Status dots share one vertical x across rows.
- [ ] Select-all ☐ checks / clears visible Pending rows; action bar still appears.
- [ ] Day band sticky docks **under** column header, not over it.
- [ ] Shipped / Receiving / Station tables unchanged (icons still present).
- [ ] `npm run verify` green (full gate before commit).

---

## 7. Acceptance criteria

1. **Column order** matches §3 exactly on desktop Pending.
2. **Per-row drag icon removed**; header retains grip + select-all.
3. **Platform / order / tracking** render without leading icons on this table.
4. Layout reads as a **Sheets-like grid** (even gutters, locked tracks), not title-stack + right chip pack.
5. Scope limited to To Ship queue table UX; chrome tabs / lane header untouched.
6. Pattern evolution: prefer growing `dashboard-order-row-layout` + optional `plain` chip variant over a page-local fork.

---

## 8. Compound opportunities (recommend, don’t block)

| Tier | Item |
|------|------|
| **Do now** | Ten-column grid + quiet chips + header-only grip |
| **Promote next** | Same grid recipe for Packed / Labels queue |
| **Deferred** | True column drag-reorder; virtualized sticky header height measurement SoT |

---

## 9. Suggested agent kickoff prompt

```text
Implement the Sheets-like Pending table handoff in
docs/todo/to-ship-pending-sheets-grid-handoff.md.

Scope: To Ship Pending OrdersQueueTable only.
1) Expand ordersQueueGridTemplate to:
   select | status | title | qty | condition | age | notes | platform | order | tracking
2) Remove per-row GripVertical; keep grip + select-all only in OrdersQueueColumnHeader.
3) Split notes / platform / order / tracking into own cells.
4) Add a this-table-only plain (no-icon) presentation for platform/order/tracking
   without stripping icons globally from CopyChip.
5) Keep sticky header above day bands; verify alignment; npm run verify.
```

---

## 10. References

- House identity: `AGENTS.md` → Kinetic Ledger; `.claude/rules/ui-design-system.md`
- Improve-UI skill: `.claude/skills/improve-ui/SKILL.md` (normalize + compound; no bolder/delight)
- Prior work already landed: sticky header, always-select To Ship, 6-col prototype — **replace** the bundled `ids` track with explicit platform/order/tracking + notes columns per this doc
