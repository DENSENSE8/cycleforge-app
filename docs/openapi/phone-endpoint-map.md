# Phone → API map (input to Phase 2.2: `/api/v1` as the only native door)

Measured 2026-09-26 on `:3050`: iPhone 14 viewport, one throwaway cookie session,
each top-level `/m` screen loaded to network idle (**load**), plus the `/api/*`
literals in phone-owned files (`src/app/m/**`, `src/components/mobile/**`) reachable
from that screen's imports (**actions**). Deep screens (`/m/r/[id]`, `/m/u/[id]`,
`/m/rs/[id]`, shipments, photos) and calls made through shared `src/lib`/`src/hooks`
helpers are not in this table yet — the scan verb on `/m/scan` is one of those.

Already v1: `GET /api/v1/outbound/work` (order hub), `/api/v1/session`, `/api/v1/reminders`.

## Shell — every screen, on every load

`GET /api/staff` · `/api/staff-preferences` · `/api/staff-messages` · `/api/inbox/support` ·
`/api/inbox/tech-queue` · `/api/realtime/token` · `/api/realtime/wms-ticket` ·
`/api/station-commands/aliases`

## Per screen

| Screen | Load | Actions |
|---|---|---|
| `/m/home` | `GET /api/tasks`, `GET /api/daily-checks` | — |
| `/m/scan` | `GET /api/receiving-lines`, `GET /api/settings` | `/api/receiving/preview-scan`, `/api/receiving/lookup-po`, `/api/receiving/{id}`, `/api/receiving-logs`, `/api/receiving-lines`, `/api/admin/fba-fnskus` |
| `/m/work`, `/m/orders` | `GET /api/orders`, `GET /api/catalog/platforms`, `GET /api/catalog/platform-accounts` | `/api/orders/exceptions`, `/api/orders/{id}/flag`, `/api/orders/{id}/documents` (+ `/upload`) |
| `/m/pick` | **`POST /api/picking/next`** (opens/reuses a pick session on visit), `GET /api/reason-codes`, `/api/settings`, `/api/orders/{id}/documents`, `/api/orders/{id}/manuals`, `/api/zoho/items/{id}/image` | `/api/picking/release`, `/api/picking/tote`, `/api/picking/session/{id}/note`, `/api/serial-units/{id}/move`, `/api/update-sku-location`, `/api/product-manuals/search` |
| `/m/pick/unassigned` | `GET /api/picking/board`, `/api/zoho/items/{id}/image` | — |
| `/m/pack` | `GET /api/packerlogs`, `GET /api/packing/policy` | `/api/packing/resolve-tote`, `/api/product-manuals/search` |
| `/m/exceptions` | `GET /api/orders/exceptions` | — |
| `/m/repair-scan` | — | `/api/counter/companion` |
| `/m/settings` | shell only | — |

## Promotion order (one endpoint family per step)

1. **Pick loop** — `/api/picking/{next,release,tote,board,session/{id}/note}`: phone-only
   callers (`useDirectedPick`, `PickBoardScreen`), the densest core verb.
2. **Work / orders** — move `/m/work` onto the existing `GET /api/v1/outbound/work`
   rather than promoting `/api/orders`.
3. **Tasks + daily checks** (home).
4. **Scan** — trace the shared scan helper first; the receiving calls above are its
   carton path only.
5. **Shell** — decide which of the eight a native app needs (realtime token, staff,
   preferences likely; `station-commands/aliases` likely not).
