# Handoff — To-Ship CSV import staging + Add desk host

**Status:** shipped + confirmed (session staging; no durable `pending_imports` table)
**Date:** 2026-08-09 · confirmed 2026-08-09

## Confirmation pass (2026-08-09)

Two gaps closed while proving the path end to end:

1. **The staging grid is now the house Workbench spreadsheet.** It was a
   hand-rolled `<table>` — the surface `ui-design-system.md` → Always ban names.
   It mounts `NonlinearTableHost` over a new `orders-import.staging` table
   definition, so each row shows its real details (order · SKU · qty · customer ·
   tracking · platform) with the **triage state in its own `status` column**
   (`GridStatusCellValue`, structural — no `hideKey`). Frozen pane `select · order`;
   own prefs bucket `orders-import` so a staging column pref never touches the
   live queue.
2. **The surface could not open at all in a browser.** `loadCsvImportStagingFromFile`
   publishes the draft synchronously, so the desk's "leaving staging via URL drops
   the draft" effect fired one frame before `?import=csv` landed and threw the
   draft away. Fixed per `source-of-truth.md` → Optimistic URL-param paint:
   `useCsvImportStagingParam` (shared `useOptimisticUrlParam` channel — the popover
   and the desk are separate trees) plus a sync-guard ref on the teardown.

E2E: `tests/e2e/csv-import-staging.spec.ts` (`--project=qa-desktop`) — auto-map,
remap, the `order_number` gate, triage counts, rail fix, and a real
`POST /api/orders/import-csv`.

## One-sentence goal

CSV import on `/shipping/orders` lands in a **session staging table** with sticky top-right batch CTAs (Confirm / Discard) and Ready / Action required triage; Add / `?new=true` hosts on the rail-less desk.

## Locked decisions

| Decision | Choice |
|---|---|
| Confirm before transfer | Yes — `requestConfirm` before POST |
| Motion | Standard right-rail reveal — no shared-layout row morph |
| Live-queue batch verbs | Stay on right-rail selection plane (Pattern E) |
| Staging durability | In-memory store + `?import=csv` only |

## Key files

| Role | Path |
|---|---|
| Parse / classify SoT | `src/lib/orders/csv-order-import.ts` |
| Session draft store | `src/lib/orders/csv-import-staging-store.ts` |
| Staging UI | `src/components/outbound/orders/CsvImportStagingHost.tsx` |
| Staging grid (definition · columns · header · row) | `src/components/outbound/orders/import-staging/` |
| `?import=csv` paint-pending | `src/hooks/useCsvImportStagingParam.ts` |
| Row editor rail | `src/components/outbound/orders/CsvImportStagingRail.tsx` |
| Import popover CSV entry | `src/components/unshipped/OrdersSyncPopover.tsx` |
| Add host | `src/components/outbound/orders/OutboundOrdersDesk.tsx` |
| Guard | `src/components/outbound/orders/csv-import-staging.guard.test.ts` |

## Operator path

1. Band-1 **Import** → **Import from CSV** → pick file.
2. Map columns (if needed) → staging grid.
3. Fix Action required rows in the right rail → Ready.
4. Select Ready rows → **Confirm N ready** → dialog → live To-Ship Pending.

## Non-goals (still open)

- Durable quarantine / `pending_imports` table
- Bottom detail pane replacing `RightRailHost`
- Moving live-queue Assign / Flag / Delete into the table header

---

## Claude Code — confirmation prompt (paste as-is)

```text
Confirm To-Ship CSV import staging + column mapping (Cycle Forge).

Repo: cycleforge-app. Desk: /shipping/orders. Do NOT start/restart the
dev server (user's is on :3050 — attach only). Stay on the current branch.
Do NOT commit unless I ask. Read AGENTS.md + docs/todo/to-ship-csv-import-staging-HANDOFF.md first.

## Goal
Prove an operator can (1) import orders via CSV from Band-1 Import into
desk staging, (2) identify and change column mapping ("column locking"),
then (3) confirm Ready rows into the live To-Ship queue. Fix any gaps you
find; leave Pattern E + right-rail selection plane alone for the live queue.

## What shipped (verify, don't redesign)
- Band-1 Import → "Import from CSV" → session staging (`?import=csv` +
  in-memory draft in src/lib/orders/csv-import-staging-store.ts)
- Parse / auto-map / Ready vs Action-required SoT:
  src/lib/orders/csv-order-import.ts
- Staging UI: src/components/outbound/orders/CsvImportStagingHost.tsx
  (sticky QueueTableToolbar Confirm/Discard — NOT a page-bottom capsule)
- Row fix: right rail detail:order-import-staging
  (CsvImportStagingRail.tsx)
- Confirm → requestConfirm → POST /api/orders/import-csv (Ready-only)
- Add / ?new=true hosted on OutboundOrdersDesk (rail-less Pattern E)

## Column locking (must verify explicitly)
"Column locking" = which CSV header is bound to each canonical field
before triage/confirm. Canonical keys (order_number required):
  order_number, sku, quantity, customer_name, tracking_number, platform

Prove all of:
1. Auto-map: headers like "Order ID" / "Item Number" / "Qty" / "Buyer" /
   "Tracking" / "Channel" bind via autoMapCsvOrderHeaders.
2. Mapping UI is visible and editable:
   - Forced when order_number is unmapped (showMapping / "Map columns")
   - Re-openable from staging toolbar ("Map columns")
   - Each canonical field has a select of detected CSV headers
   - Changing a select calls setCsvImportStagingMapping and reclassifies rows
3. Gate: cannot Continue / Confirm without mapping.order_number.
4. When SKU column is mapped, blank SKU ⇒ Action required; when SKU is
   unmapped, blank SKU does not block Ready.
5. Settings CsvOrderImport still composes the same SoT (no forked parser).

## Operator path to exercise (browser on :3050 if auth allows)
1. /shipping/orders → Band-1 Import → Import from CSV → pick a small CSV
   (include at least one bad row: missing order # and/or blank SKU when
   SKU is mapped).
2. Identify the column-mapping step — name which header locked to
   order_number / sku / etc. Remap one field intentionally.
3. Continue to staging → Ready / Action required badges + filters.
4. Open an Action required row → right rail → fill missing field → Apply.
5. Select Ready rows → Confirm N ready → accept dialog → rows land in
   Pending; staging exits (import=csv cleared).
6. Band-1 Add / ?new=true still opens NewOrderEntryOverlay on desktop.

If QA org / auth blocks write, still prove UI + unit/guard coverage and
document what you couldn't POST.

## Automated checks
- node --test --import tsx \
    src/lib/orders/csv-order-import.test.ts \
    src/lib/orders/csv-import-staging-store.test.ts \
    src/components/outbound/orders/csv-import-staging.guard.test.ts
- npm run verify (full) before you say done — never raise DS/knip baselines.

## Report back
1. Pass/fail per column-locking proof (1–5) with file:line evidence.
2. Whether CSV → staging → Confirm path works (or what blocked it).
3. Any bugs fixed (files + one-line why).
4. Residual risks / non-goals still open.
```
