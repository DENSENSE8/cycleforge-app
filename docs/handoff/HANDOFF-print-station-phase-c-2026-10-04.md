# HANDOFF — Print station Phase C + rest of D (enrolled org stations, control plane) — 2026-10-04

Continue from here. Parent spec: `docs/handoff/HANDOFF-fnsku-print-station-2026-10-04.md` (owner rulings §1, phases §4).
Dev origin `http://localhost:3050` only (lane `cycleforge-lane@prod`). Probe auth: `tests/.auth/admin.json`.
Playwright: `createRequire('<repo>/package.json')('@playwright/test')`. Headless reports `(hover: none)`.
Other sessions have unrelated in-flight edits in this worktree. Never revert files you did not change.

## 1. Already landed (do not redo)

| Work | Where | Proof |
|---|---|---|
| Row hover **Print** (FNSKU list, Compact + Full) | `TriageRow.trailingAction`, `FnskuBulkPrint.tsx` (`FnskuPrintPanel`, `FnskuBulkPrint`, `FnskuRowPrint`) | RECORD-CARD-MIGRATION.md row "Row hover verb" |
| **Phase A** (done by a subagent): CTA under the quantity row, 20·30·99 range (`fnskuCopyRange` pref), StopSlider changed in the component itself (dots = track height, grey not blue, applies to every consumer) | `FnskuQuantityPicker.tsx`, `fnsku-copy-range.ts`, `labelCopies.ts`, `StopSlider.tsx`, `SegmentedGlyphSwitch.tsx` (`wordless`) | handoff Phase A status. Not measured: ProductPackTimeCard, MobileProductPackTimeCard, TaskStatus slider. Spot-check them. |
| **Phase B**: shared `StationPicker.tsx` (live + default + chosen; Show offline (N); hover pencil + **Make default**; printer glyph); `canRenameOthers` → `canManage` | `StationPicker.tsx`, `usePrintStations.ts`, `PrintStationsCard.tsx` | handoff Phase B status |
| **G-then modes**: G F FNSKU labels · G S Stations (`/print-station/stations`) | route-tree lane `print-station` + `PRINT_STATION_PATHS`; `sidebar-navigation.ts` (children `fnsku-labels`, `fnsku`, `fnsku-reprinted`, `stations`, `stations-all`); `nav/context/{pages,parity}.ts`; `nav/go-keys.ts`; `routing/desk-page-routes.ts`; `triage/views/print-stations.ts` | handoff Phase D status |
| **Stations control plane, v1**: list + record (rename, Make default / Clear per stock, Test print) | `PrintStationsDesk.tsx`, `PrintStationRecord.tsx`, `station-faces.ts` | same |
| **Add FNSKU** is now a popover under the header's Add FNSKU button (bottom-end), not inline. **Condition is required** in it. | `FnskuCreateForm.tsx` (`FnskuCreatePopover`), `FnskuPrintDesk.tsx` (`addRef`) | Playwright: gap 6px, right edge flush, Save disabled until FNSKU + condition |

**Open question for the owner:** `/api/fba/fnskus` POST still accepts a missing condition, and
`FbaQuickAddFnskuModal.tsx` relies on that (its condition is optional). Making the server require it
also changes that modal.

## 2. Migration — APPLIED (owner approved)

`src/lib/migrations/2026-10-04c_print_station_devices.sql` has been applied to the `.env` DB.
It is immutable now: any fix goes in a new file.

- `kiosk_devices.kind`: `'kiosk'` (all existing rows) or `'print_station'`.
- `print_stations`:
  - `kind`: `'browser'` (all existing rows) or `'enrolled'`
  - `device_id` → `kiosk_devices.id`
  - `enrolled_by_staff_id` (FK to staff)
  - `paused_at`, `revoked_at`
  - CHECK: an enrolled station has a real name (not "Unnamed computer") and a `device_id`
  - unique index `ux_print_stations_device`
- `label_print_jobs.station_id`, plus index `(organization_id, station_id, created_at DESC)`.

Afterwards: `npm run tenancy:coverage`.

## 3. Phase C — build next, in this order

Decisions taken; owner didn't object:
- Reuse the kiosk credential with `kind`.
- One station page `/print-station/device`: code entry when unpaired, the always-on station once paired.
- Do not delete the 1,843 old browser rows.

1. **Kiosk isolation (do first; security).** In `src/lib/auth/kiosk-device.ts`, add `AND kind = 'kiosk'` to:
   - `loadKioskDeviceByToken` (:53) — otherwise a print-station token passes `withKioskAuth`
   - `pairKioskDevice` (:175)
   - `listKioskDevices` (:304)
   - `revokeKioskDevice` (:362)
   - `issueActiveKioskDeviceToken` lookup (:236)
   - `revokeStaleDogfoodKioskDevices` (:215)

   Kiosk inserts keep the default `'kiosk'`.
2. **Server lib** `src/lib/print/print-station-device.ts` (server-only). Mirror the kiosk-device.ts shapes:
   - `createPrintStationEnrollment(orgId, { name, staffId })` — in `withTenantTransaction`:
     - insert a `kiosk_devices` row: kind `print_station`, label = name, status `enrolled`, code hash, TTL ~24h
     - insert a `print_stations` row: `station_id = 'ps_' + uuid`, kind `enrolled`, `device_id`, `enrolled_by_staff_id`, `last_seen_at = to_timestamp(0)` (so it never reads as online)
     - map 23505 to a name conflict
     - return `{ stationId, code, expiresAt }`
   - `pairPrintStationDevice(code)` — owner `pool`, like `pairKioskDevice`, filtered to `kind='print_station'`. Then look up the station by `device_id`. Return the token, org, `stationId` and name.
   - `loadPrintStationDevice(token)` — owner pool: join `kiosk_devices` (`kind='print_station'`, active) with `print_stations` (`revoked_at IS NULL`). Return `{ organizationId, deviceId, stationId, name, paused }`.
   - Cookie `cf_print_station` (httpOnly, lax, 1y; copy `setKioskCookies` options) plus `readPrintStationToken(req)`.
   - `withPrintStationAuth(handler)` in `src/lib/auth/` (model on `withKioskAuth.ts`). 401 `PRINT_STATION_UNPAIRED`.
   - Registry (`print-station-registry.ts`):
     - `listPrintStations`: exclude `revoked_at` rows; always include enrolled stations; return `kind` and `paused`; treat epoch `last_seen_at` as never heard
     - `recordPrintStationHeartbeat` (browser): set `revoked_at = NULL` on upsert, so a Forget-ed browser reappears when used
     - add `setPrintStationPaused(orgId, stationId, paused)` and `revokePrintStation(orgId, stationId)`; for an enrolled station, also revoke its device (status `revoked`, token null)
     - add `listStationJobs(orgId, stationId, 50)` from `label_print_jobs`
   - Update the contracts in `print-station-registry-contracts.ts`.
3. **Routes.** Use the `new-route` skill. Then:
   - update `docs/security/route-permissions.json` (`pnpm audit-route-auth:emit`)
   - run `node scripts/tenancy-route-audit.mjs`
   - add PUBLIC_PATHS entries in `src/proxy.ts` (~:40)

   Routes:
   - `POST /api/v1/print-stations/enroll` — `withAuth` `settings.hardware`. Body `{ name }`. Returns `{ stationId, code, expiresAt }`. Audit (add `AUDIT_ACTION` constants).
   - `PUT /api/v1/print-stations/pause` and `POST /api/v1/print-stations/revoke` — `settings.hardware`.
   - `GET /api/v1/print-stations/jobs?station=` — `print.label`.
   - Device routes under `/api/print-station-device/` (add to PUBLIC_PATHS):
     - `pair` — anonymous, sets the cookie
     - `heartbeat` — POST ready/printers; returns `{ name, paused }`
     - `realtime-token` — Ably token request with a capability on `getPrintStationChannelName(org, stationId)` only, subscribe + publish. Copy `src/app/api/realtime/kiosk-token/route.ts` and its `capabilityLeaksOutsideOrg` check.
     - `fnsku/[fnsku]` — catalog title/condition, the same shape as `/api/admin/fba-fnskus/[fnsku]`
     - `print-jobs` — logs `label_print_jobs` with `station_id`; actor null
4. **Station page** `src/app/print-station/device/page.tsx`:
   - Register it:
     - route-tree node under lane `print-station`, label e.g. "Station device"
     - a `ROUTE_BUILDERS` entry
     - a route params spec owning `code` (for QR `?code=`)
   - In `src/app/layout.tsx` (:63), serve it with **public chrome even when signed in**, so the staff shell and its `StaffPrintBridgeMount` never run there. Add a predicate in `src/lib/auth/public-chrome-paths.ts`.
   - Runtime is a client component:
     - `AblyProvider authUrl="/api/print-station-device/realtime-token"`
     - subscribe to `STAFF_PRINT_JOB_EVENT` and `STAFF_PRINT_CONTROL_EVENT` on its station channel
     - ack with `publishDeviceAck`; send progress the way `useStaffPrintBridgeHost.ts:233-271` does
     - heartbeat every `STAFF_PRINT_STATUS_POLL_MS` (use the printer readiness from `snapshotStatus`'s logic)
   - Paused: ack, then publish progress `{ state: 'failed', message: 'Paused' }`. Revoked or 401: show Revoked and stop.
   - FNSKU only: give `printFnskuStationJob` an options `api` (`catalogUrl`, `logUrl`, `stationId`) so the device uses its own routes; the staff defaults stay unchanged. Other grains: fail with "This station prints FBA labels only".
   - Documents need device-authed document bytes. That is a separate security review: state it, don't build it.
   - UI: station name, Online indicator, label printer readiness, the last jobs. No staff name.
5. **Senders.**
   - `stationBlocked`: `'Paused'` for paused stations.
   - `StationPicker`: an *Enrolled* tag.
   - `usePrintStations`: map `kind` / `paused`.
   - `printFnskuStationJob` staff path should also send `stationId` (this computer's id) so the job log covers browser stations.

## 4. Phase D rest (Stations mode)

- Header action **Add print station**: a popover under the header button, like Add FNSKU. Name → code, plus a QR of `<origin>/print-station/device?code=…`. Is a QR component in the repo already? Check with `ds_contract 'qr code'`.
- Record:
  - **Pause / Resume**
  - **Revoke** (enrolled) / **Forget** (browser), behind a confirm dialog (L4)
  - **Kind** fact
  - **Job log** (last 50: FNSKU, copies, time; reprint action)
  - **Last job** fact on the row

## 5. Verify (acceptance C/D)

- Enrol a station from Stations. In a second Playwright context with **no staff cookie**:
  - open `/print-station/device?code=…`; it pairs
  - reload and clear storage: the cookie keeps it the same station with the same name
- From `/print-station`, send 3 FNSKUs × 2 to it.
  - Station side, no printer: the jobs execute or log, and `label_print_jobs.station_id` is set.
  - Do NOT print on real floor printers.
- Pause → the sender sees Paused. Revoke → the device gets 401 and the page shows Revoked within one heartbeat. It disappears from lists.
- `pnpm verify:fast`: Tenancy isolation, Routes, Nav names. Typecheck at the end of this session had one error, in another session's file: `src/components/warehouse/RoomDetailForm.tsx(70,34)`. Earlier errors in other sessions' files (`PastedListGridRow.tsx`, `mobile-v2-destinations.tsx`, `RequesterDetailBand.tsx`, `LabelBatchesDesk.tsx`, `triage/views/index.ts`) were gone by then.
- Nav unit tests: 7 failures that existed before this work (Operations, `/customers` mode registry, Inventory parked). The round-trip test stops at its first failure, so check print-station with a scoped script (resolve each print-station item href; `parityGaps('print-station')` must be `[]`).
- Update the parent handoff §4 Phase C/D status, and `docs/design-system/RECORD-CARD-MIGRATION.md`.
- Clean up throwaway scripts in `/tmp`.
