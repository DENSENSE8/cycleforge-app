# Sales history → Dashboard domain

**Status:** Shipped 2026-07-30  
**Parent:** Dashboard IA follow-on ([`dashboard-ia-rework-HANDOFF.md`](dashboard-ia-rework-HANDOFF.md) §5)  
**Precedent:** [`foh-boh-surface-split/04-inbound-history-dashboard-mode.md`](foh-boh-surface-split/04-inbound-history-dashboard-mode.md)  
**Supersedes:** L1 Sales page as a permanent home ([`foh-boh-surface-split/03-sales-main-history.md`](foh-boh-surface-split/03-sales-main-history.md) P1–P2 still describe the Monitor composition)

## Goal

Fold the `/walk-in` Sales history Monitor into `/dashboard` as a **third domain**, delete the Sales L1 nav row, and redirect `/walk-in` bookmarks. Counter intake stays on `/pickup` + `/repair`.

## Shape

| Domain | Wire | Collection | Mode gate |
|---|---|---|---|
| `outbound` | bare / presence flags | order queue | `dashboard.view` |
| `inbound` | `?mode=inbound` | receiving lines | `receiving.view` |
| `sales` | `?mode=sales` \| `?mode=pickup` | walk-in transaction feeds | `walk_in.view` |

SoT amendment: [`.claude/rules/display/workbench.md`](../../.claude/rules/display/workbench.md) — top axis is direction **plus** front-desk commerce when its L1 home is deleted. FBA / Repair stay off the axis.

## What shipped

| Piece | Path |
|---|---|
| Domain registry | `src/lib/dashboard/dashboard-domains.ts` (`DASHBOARD_SALES_*`, `retiredWalkInHistoryTarget`) |
| Route params | `DASHBOARD_ROUTE_PARAMS` — `mode` includes `sales`/`pickup`; owns `tab` |
| View | `src/components/dashboard/DashboardSalesView.tsx` → composes `WalkInHistoryHub` |
| Page branch | `src/app/dashboard/page.tsx` |
| Nav | Sales L1 removed; Dashboard L2 pills `sales` + `pickup` |
| Redirect | `src/app/walk-in/page.tsx` — station deep-links first, then history → dashboard |
| Context panel | `DashboardOrdersContextPanel` mounts `WalkInHistorySidebar` on sales domain |

## Explicit non-goals

- Do not merge FBA or Repair into the dashboard axis
- Do not move kiosk / counter intake onto `/dashboard`
- Do not re-open entity-axis `Orders · FBA · Repair · Sales`
- Do not touch `/search` (dashboard-IA row G stays closed)

## Verify

`npm run verify`; unit suites for `dashboard-domains` + `sidebar-navigation`.
