# FBA surface split — product contracts

**Status:** in progress (Phase 0–3 scaffolding)  
**Related:** Kinetic Ledger region contracts, reseller-flow FBA prep lane, packing KPI FBA fill.

## Goal

Stop treating FBA prep as a top-level primary page. Distribute by **job**:

| Job | Home | Contract | Density |
|---|---|---|---|
| Post-test channel allocation (FBA vs pre-box/stock) | `/outbound?mode=ready` | Workbench list | `ops` |
| FBA prep floor (plan / pack / combine / FC labels) | `/outbound?mode=fba` | Station | `floor` |
| Shipment / plan status | `/dashboard` FBA view | Workbench | `ops` |
| KPIs, capacity, backlog health | `/operations` | Monitor | `rollup` |
| Amazon connect | Settings → Integrations | Admin | — |

Top-level `/fba` nav stays parked; `/fba` redirects to `/outbound?mode=fba`.

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

Views render chips only; they do not re-derive rules.

## Outbound modes

| Mode | URL | Notes |
|---|---|---|
| `labels` | default | MF order documents (unchanged) |
| `scan-out` | `?mode=scan-out` | Dock scan (unchanged) |
| `ready` | `?mode=ready` | TESTED/GRADED ready queue + disposition |
| `fba` | `?mode=fba` | Rehomed FBA board/combine/plan |

## Non-goals (this initiative)

- FBA schema spine fold onto `inventory_events`
- Full SP-API inbound create if not already present
- Restoring top-level FBA nav item

## Phases

0. Contracts + inventory — this doc  
1. Domain allocator + ready-queue API  
2. Outbound Ready mode UI  
3. Outbound FBA mode rehome + `/fba` redirect  
4. Dashboard status deep-links  
5. Operations rollup enrichment  
6. Amazon inventory depth (when available)  
7. Cleanup (parked meta, search, e2e)
