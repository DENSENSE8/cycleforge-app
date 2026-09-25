# HANDOFF — Mobile picking: stock updates fail in production, location scan full page, take reasons (2026-09-25)

Paste this whole file into a fresh session in `~/Projects/cycleforge-lanes/prod`. Read `AGENTS.md`
first. Dev origin is `http://localhost:3050` only. Production is `https://app.cycleforge.ai`
(Vercel, manual `vercel deploy --prod` from this lane; branch `prod/worktree-2026-09-11`).
Scope is the phone picking/stock system only.

## The owner's ask (verbatim intent)

1. "I am not able to update stock, it's displaying realtime connection refused."
2. "When I scan the location it must display a full page, not just a mounted display at the bottom."
3. "Remove all the taking reasons. I must be able to add a reason like for FBA or for orders when
   taking products from locations, with the ability to add a custom reason."

## 1 · Stock updates fail in production — root cause (verified)

Every phone stock/pick write goes ONLY through a WebSocket:

- `src/components/mobile/realtime/WmsRealtimeProvider.tsx:108` — `socketUrl()` is
  `wss://<same host>/__wms/attach`. `execute()` (`:149-172`) rejects with
  "Realtime execution connection is not ready." when the socket is not open; `onclose` rejects
  pending commands with "Realtime connection interrupted; retrying is safe."
- `/__wms/attach` exists only on this box: the local switchboard
  (`~/Projects/Garisek-OS/scripts/switchboard/server.ts:133`, `WMS_PROXY_PREFIX = '/__wms'`) proxies
  it to `garisek-wms-gateway.service` (`127.0.0.1:31183`), which spawns
  `scripts/wms-domain-adapter.ts` → `executeWmsExecutionCommand`. **Vercel has no gateway**, so on
  `app.cycleforge.ai` the socket can never open and every command fails. (Works on `:3050` and the
  `*.michaelgarisek.com` tunnel hosts because they go through the switchboard.)
- Socket-only callers (all broken in production):
  - `src/components/mobile/pair/MobilePairQty.tsx:159` — `putaway.adjust` (the take/put keypad).
  - `src/components/mobile/picker/directed/useDirectedPick.ts:96` — `pick.confirm` / `pick.short` (`/m/pick`).
  - `src/app/m/(shell)/pick/[orderId]/_picker/useMobilePicker.ts:149,208` — legacy order picker.
  - `src/components/mobile/photos/MobilePackerPhotoStudio.tsx:224` — `pack.verify`.
- The server core is transport-agnostic already: `executeWmsExecutionCommand(raw, identity)` in
  `src/lib/realtime/wms-execution-command.ts:131` (zod `WmsExecutionCommandSchema`, org/staff
  identity check, idempotent by `commandId`, receipts `committed | replayed`).
  `PATCH /api/locations/[barcode]` (`src/app/api/locations/[barcode]/route.ts:180-201`) already runs
  the same `executeWmsPutawayAdjust` over HTTP with `Idempotency-Key`.

**Fix (one place, not per caller):**
- Add `POST /api/wms/commands` (withAuth; body = one `WmsExecutionCommand`; identity from the
  session, never the body; returns the receipt; 4xx on zod/identity errors with the message). It
  calls `executeWmsExecutionCommand` — no second business path. Use the `new-route` skill.
- In `WmsRealtimeProvider.execute`, send over HTTP when the socket is not OPEN (and keep the socket
  as an accelerator where it exists). Same `commandId` both ways, so a retry after a dropped socket
  replays instead of double-writing. Resolve/reject exactly as today so no caller changes.
- `WmsRealtimeStatus` / the provider must not paint "connection refused/interrupted" as an operator
  error when HTTP is serving commands; show an error only when a command actually fails.
- Regenerate `docs/security/route-permissions.json` (`pnpm audit-route-auth:emit`) — the pre-push
  gate fails otherwise.

Acceptance: on `https://app.cycleforge.ai` (after deploy) a phone can take/put stock at a location,
confirm a pick on `/m/pick`, and short a pick, with no realtime error shown. Same on `:3050` with
`systemctl --user stop garisek-wms-gateway` (HTTP path) and started (socket path). A replayed
`commandId` returns `replayed`, one ledger row.

## 2 · Location scan must open a full page

Today: scanning a location on `/m/scan` (`src/components/mobile/scan/MobileScanIdentify.tsx:48,380`)
swaps the camera for `MobileLocationBindSheet` (`src/components/mobile/scan/MobileLocationBindSheet.tsx`)
— a fixed-height `MobileStationSheet` at the bottom (`STATION_SHEET_HEIGHT_CLASS`). Faces: empty
(pair a Zoho SKU) and paired (`LocationQtyStrip` ± per SKU via `use-bin-qty-commit.ts`, unpair via
`location-bind-api.ts`). APIs: `GET/PATCH /api/locations/[barcode]`, `POST /api/locations/register`,
`GET /api/sku-catalog/search?searchField=zoho_catalog`. The keypad job is `/m/pair/[code]/[sku]`
(`MobilePairQty`).

Required: a scanned location is a **full-screen record route** on the mobile exoskeleton
(`src/lib/mobile/detail-hub-law.ts`, kit `DetailHubScreen` / `DetailSummaryCard` / `DetailNav` /
`detailDoor` / `DetailDock`; reference hubs `/m/orders/[orderId]`, `/m/rs/[id]`,
`/m/pack/start/[orderId]`).
- Route: pick a NEW prefix — **not** `/m/b/` or `/m/l/`: `src/proxy.ts` `REWRITES` rewrites those to
  `/bin/` and `/receiving/lines/`. `/m/b/[barcode]` today only redirects to desktop `/inventory?bin=`.
  Suggest `/m/loc/[code]`.
- Hub: bar = location face (`locationCode(parseLocationCodeFlat(code))`), X back to `/m/scan`
  (`mobileJobReturn`/`withJobReturn`). Card = location summary (room/zone, SKU count, total units).
  Content = every SKU in the location with its live qty and the ± strip (reuse `LocationQtyStrip` +
  `useBinQtyCommit`); tapping a SKU opens the take/put keypad job. Empty location = the pair-a-SKU
  search as a job screen. Dock ≤3 verbs, one primary (e.g. Take · Put · Scan next).
- `MobileScanIdentify` navigates to the route on a location scan instead of mounting the sheet;
  delete `MobileLocationBindSheet` and its `mobile-sheet-roles.ts` entry if nothing else mounts it.
- Register the hub in `src/lib/mobile/detail-hub-cohort.ts` as `ported` with an `/info` page, and
  keep `pnpm verify:fast` green (Detail hub, Ground, Boundary gates). Mobile ground is
  `bg-surface-card`, never `bg-surface-canvas`.

## 3 · Take reasons: remove the preset list, add FBA / Orders / custom

Today the take/put keypad (`MobilePairQty.tsx:39,86,149-152,171-173,292-305`) renders
`ReasonCodePicker` (`src/components/sku/ReasonCodePicker.tsx`, fetches `/api/reason-codes` by
direction) and blocks confirm when a picked reason `requires_note`. The quick ± strip sends the
defaults `BIN_PULL` / `BIN_ADD` (`use-bin-qty-commit.ts:53-54`), unpair sends `BIN_UNPAIR`.

Required on the phone take flow:
- Remove `ReasonCodePicker` from the phone take/put UI (and any other phone surface that shows the
  preset reason list for a location take — check `BinStockNumpadSheet.tsx` callers; do not change
  desktop surfaces).
- Take shows a reason control: quick choices **FBA** and **Orders**, plus **Custom…** (free text).
  A reason is available on every take, including a quick − from the location page. Put keeps no
  reason (defaults as today).
- Storage (no migration): `sku_stock_ledger.reason` is `text` with no CHECK (only a `dimension`
  CHECK); `notes` is `text`; the command schema allows `reason` ≤200 and `notes` ≤2000
  (`wms-execution-command.ts:67-69`). Write a stable code in `reason` (e.g. `TAKE_FBA`,
  `TAKE_ORDER`, `TAKE_CUSTOM`) and the operator's text in `notes`; `reasonCodeId: null`.
  **Never write `SOLD`**: the replenish trigger fires on `reason='SOLD'`
  (`src/lib/sku/sku-stock-reasons.ts:3-5`).
- Make sure ledger/history views print the reason + note (check the SKU ledger row mapper
  `src/lib/inventory/sku-ledger-row.ts`).

## Verify

- `pnpm verify:fast` green. Unit tests for the new command route (identity mismatch refused,
  replay returns `replayed`) and for the provider's HTTP fallback choice.
- Live on `:3050` at 390×844 (QA org sign-in: `POST /api/auth/signin`, header
  `x-tenant-slug: cycleforge-qa`, body `{"staffId":67,"deviceKind":"personal"}`): scan a QA location
  → full page; take 1 with FBA, take 1 with a custom reason, put 1; confirm ledger rows
  (`reason`, `notes`, `staff_id`) in `sku_stock_ledger`. QA org only — never mutate USAV
  (`00000000-0000-0000-0000-000000000001`).
- Production: deploy (`vercel deploy --prod` from this lane; if it fails at "Deploying outputs",
  see `next.config.ts` — never re-add `outputFileTracingIncludes` for `docs/**`), then repeat the
  take/pick smoke on `app.cycleforge.ai`.

## Known context

- `.next-*` dirs are gitignored; never run a second `next build` into the lane checkout while the
  dev server runs (Tailwind scans it). Use a separate `git worktree` for local production builds.
- Separate issue, not this job: production and local use different `INTEGRATION_KMS_KEY`s, so
  vault connections saved on localhost (ShipStation, Ecwid) cannot be read in production.
