# Phone → API map (input to Phase 2.2: `/api/v1` as the only native door)

Measured 2026-09-26 on `:3050`: iPhone 14 viewport, one throwaway cookie session,
each top-level `/m` screen loaded to network idle (**load**), plus the `/api/*`
literals in phone-owned files (`src/app/m/**`, `src/components/mobile/**`) reachable
from that screen's imports (**actions**). Deep screens (`/m/r/[id]`, `/m/u/[id]`,
`/m/rs/[id]`, shipments, photos) and calls made through shared `src/lib`/`src/hooks`
helpers are not in this table yet — the scan verb on `/m/scan` is one of those.

Already v1: `GET /api/v1/outbound/work` (order hub, via `v1Request` + `outboundWorkPageSchema`),
`/api/v1/session`, `/api/v1/reminders`, `/api/v1/label-ingestions`, the pick loop (below).

**One envelope on v1 (2026-09-26).** Every `/api/v1/*` answer is `{ data }` or
`{ error: { code, message } }` — including refusals raised in front of the handler
(`proxy.ts` 401, `withAuth` 401/403/`STEPUP_REQUIRED`/402/`FEATURE_GATED`/500). v1 500s
carry `requestId` only, never a stack. Handlers answer through `src/lib/api/v1-route.ts`
(`v1Data`, `v1Error`, `v1DomainError`, `readV1Json`, `readV1Query`, `v1PathId`); each
family keeps its own code list, merged into the published `Error.code` enum by
`buildV1OpenApi` (`src/lib/api/v1-openapi.ts`, the one OpenAPI root). Web routes keep
their legacy bodies (`{"error":"UNAUTHENTICATED"}`).

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
| `/m/pick` | `GET /api/orders?inWarehouse=true&listShape=queue` (the To-ship desk's read), `GET /api/locations` (Set bin sheet, on open) | `/api/update-sku-location` (Set bin); Start picking / a tapped card → `?order=` below |
| `/m/pick?order=<id>` | `GET /api/orders?orderId=…&inWarehouse=true`, `GET /api/orders/{id}/pick-tasks` | `/api/picking/desk/scan` (`type: 'ORDER'` anchors the pick on the order), `/api/picking/desk/serial`, `/api/picking/desk/sku`, `/api/picking/desk/unpick` |
| `/m/packing` | `GET /api/packing/photo-feed`, `GET /api/packing-photos?packerLogId=` (in-place gallery) | Ably `scan_ready` on the packer's staff channel (desk `POST /api/packing-logs`) refetches the feed; rows open `/m/p/{packerLogId}/photos?back=/m/packing`; `DELETE /api/packing-photos?id=` from the gallery |
| `/m/exceptions` | `GET /api/orders/exceptions` | — |
| `/m/repair-scan` | — | `/api/counter/companion` |
| `/m/settings` | shell only | — |

## Promotion order (one endpoint family per step)

1. **Pick loop — DONE 2026-09-26.** `/api/v1/picking/sessions` (contract
   `src/lib/picking/picking-v1-contract.ts`, client `src/lib/api/v1-client.ts`; `next`, `board`,
   `release`, `sessions/{id}/tote` and `sessions/{id}/notes` were deleted with the directed pick
   stack 2026-09-28 — `/m/pick` walks my list on the desk scan flow); the six `/api/picking/*` routes are deleted, and
   so are the three caller-less `/api/picking/session/{id}/{confirm-pick,short-pick,complete}`.
   Still off v1 on the pick screens: confirm / short-pick / complete run over the realtime
   WMS channel (`/api/realtime/wms-ticket` + `execute({ name: 'pick.confirm' | 'pick.short' })`,
   `completeSession` flag) — a native picker needs that channel as its own v1 face next.
2. **Work / orders** — move `/m/work` onto the existing `GET /api/v1/outbound/work`
   rather than promoting `/api/orders`.
3. **Tasks + daily checks** (home).
4. **Scan** — trace the shared scan helper first; the receiving calls above are its
   carton path only.
5. **Shell** — decide which of the eight a native app needs (realtime token, staff,
   preferences likely; `station-commands/aliases` likely not).
