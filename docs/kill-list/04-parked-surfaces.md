# Parked surfaces — frozen, not dead

**Operator ruling (2026-08-20):** *"they are parked until the UI and UX components are updated and
ported over; the unbox are the best current component for overall consistency."*

Parked means: **do not delete, do not extend, do not fix cosmetically.** The next change any of
these routes receives should be its port to the Unbox frame. This is a freeze, not a kill list —
it is here so nobody mistakes "not on the daily path" for "safe to remove."

## Live daily — never park these

| Spine | Routes |
|---|---|
| **Inbound** | `/unbox` **(SoT)** · `/receiving/history` · `/incoming` · `/carton/[id]` · `/triage` |
| **Outbound** | `/shipping/orders` · `/shipping` · `/pack` · `/packer` · `/pickup` |

## Parked (~90 routes)

| Family | Routes | Port priority |
|---|---|---|
| Inventory | `/inventory/*` (14 routes), `/admin/inventory/*` (9) | High — real data surfaces |
| Products / catalog | `/products`, `/products/sku/[sku]`, `/s/[sku]`, `/studio/catalog` | High |
| Tech bench | `/tech` | **Next port after `/shipping/orders`** (operator-chosen) |
| Ops / observe | `/dashboard`, `/operations`, `/studio`, `/reports`, `/signals`, `/review` | Medium |
| Support | `/support`, `/tracking-exceptions` | Medium |
| Settings / admin | `/settings/*` (11), `/admin` | Low — not operator-facing chrome |
| Mobile shell | `/m/**` (~25 routes) | **Undecided** — operator did not mark dead; needs its own ruling |
| Kiosk | `/kiosk`, `/kiosk/v2` | Separate contract (`display/kiosk-shell.md`) — not an Unbox port target |
| Scan/short links | `/01`, `/414`, `/q`, `/l`, `/p`, `/qr`, `/bin`, `/serial`, `/o` | **Resolvers, not surfaces** — mostly redirect. Low/no port need |
| Warehouse family | `/warehouse`, `/warehouse/rma`, `/warehouse/replenishment`, `/replenish`, `/repair`, `/sourcing`, `/fba`, `/walk-in` | Medium |
| Utility | `/forge`, `/test`, `/wipe`, `/design-demo`, `/manuals`, `/calendar`, `/ai-chat`, `/photos`, `/ops/photos` | `/design-demo` is **dead** ([`01`](01-tier1-provably-dead.md)); the rest need a ruling |

## Open rulings needed from the operator

These I could not resolve and did not guess:

1. **`/m/**` (~25 mobile routes).** Offered as a delete candidate, not selected. Is the phone
   surface live, parked, or dead? It is the single biggest undecided block in the tree.
2. **`/test`, `/wipe`, `/forge`.** All three are wired into `nav-destinations.ts`, so they are
   one click away from an operator. Dev scaffolding in production nav is either intentional or a
   leak.
3. **`/receiving/unfound`.** Its 12 supporting components are knip-dead while both its routes
   still exist. Either the route is broken or knip is misreading a barrel — needs a browser check.

Until these are answered they stay parked, which is the safe default.
