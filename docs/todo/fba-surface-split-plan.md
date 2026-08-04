# FBA surface — product contracts

**Status:** Ready folded into FBA workbench (2026-08-03)  
**Related:** Kinetic Ledger region contracts, reseller-flow FBA prep lane, packing KPI FBA fill.

## Goal

One FBA inbound workbench under Shipping (industry pattern: Amazon Send to Amazon /
Sellercloud wizard / Dynamics outbound workbench) with lifecycle stage tabs:

| Tab | Job | Density |
|---|---|---|
| **Ready** | Post-test channel allocation (FBA vs pre-box/stock vs hold) | `ops` |
| **Plan** | Add FNSKUs to today's planned board | `floor` |
| **Combine** | Consolidate packed units under one FBA shipment ID | `floor` |
| **Shipped** | Shipment / plan history | `ops` |

| Job | Home | Notes |
|---|---|---|
| Inbound FBA workbench | `/shipping/fba` (`?fbaMode=`) | Ready · Plan · Combine · Shipped |
| KPIs, capacity, backlog health | `/operations` | Monitor |
| Amazon connect | Settings → Integrations | Admin |

Legacy `/shipping/ready` and `/shipping?mode=ready` permanently redirect to
`/shipping/fba?fbaMode=ready`. Top-level `/fba` redirects to `/shipping/fba`.

## Channel allocation waist

SoT: `src/lib/channel-allocation/`.

Pure `recommendDisposition(facts)` → `{ disposition, reasons, score }`.

| Priority | Rule | Destination |
|---|---|---|
| 1 | Explicit hold | `HOLD` |
| 2 | Amazon OOS (or below cover) **and** velocity A/B | `FBA` |
| 3 | Open FBA plan still unfilled | `FBA` |
| 4 | FBA filled **or** low velocity | `PREBOX_STOCK` |
| 5 | Tenant default | policy |

Views render chips only; they do not re-derive rules. Ready disposition facets
use `?rtab=` (KPI strip filters), not a second solid tab band.

## Shipping L2 children

| Child | URL | Notes |
|---|---|---|
| To ship | `/dashboard` | Order queue |
| Postage | `/shipping/labels` | MF order documents |
| FBA | `/shipping/fba` | Inbound workbench (includes Ready stage) |
| Packing Review | `/review` | Packing QA |

Scan out remains its own floor station L1 (`/shipping/scan-out`).

## Non-goals

- FBA schema spine fold onto `inventory_events`
- Full SP-API inbound create if not already present
- Restoring a standalone Ready L2 nav item
