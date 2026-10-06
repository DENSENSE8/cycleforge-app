# Fast scan → stock adjust (mobile) — handoff 2026-10-05

Paste this into a fresh session in `cycleforge-lanes/prod`. Dev origin is
`http://localhost:3050` only; lane lifecycle is operator-only (AGENTS.md).

## Goal

A floor operator iterates stock as fast as they can scan:

1. Tap the top-right **Scan** button → the camera is live almost instantly.
2. Scan a location label.
   - **Exactly one item at that location** → land directly in that item's
     stock adjust (±1 strip, scan-backed put/take). No list, no extra tap.
   - **Two or more items** → **Select item** first (one tap), then the same
     adjust.
   - **No items** → the location record as today (pair / add flow).
3. Adjust, then the scan button again for the next location. Repeat.

The scan page shows **no recent-scan history on open**. History loads only
when the operator taps for it.

## Delete list — acknowledge before writing code

- [ ] The server seed on `/m/scan`: `seedMobileReceivingFeed('triage')` +
      `ShellQuerySeed` in `src/app/m/(shell)/scan/page.tsx`. It awaits a
      server self-fetch of `/api/receiving-lines` before the page can paint.
      This is the main delay between the Scan button and the camera.
- [ ] The eager `useArrivalHistory()` read in
      `src/components/mobile/scan/MobileScanIdentify.tsx` (~line 131), and the
      `seeded` effect that pours history into the tape (~lines 132–143).
- [ ] The second record fetch after a location scan.
      `authorizeScannedLocation()` already calls `fetchLocationRecord(code)`,
      then `/m/loc/[code]` fetches the same record again through
      `useLocationRecord`. Seed the cache from the first read instead.
- [ ] No new list component for "Select item". The location record's stock
      rows (`LocationStockPositions` rows) are the selector.
- [ ] No second adjust UI. The stock position sheet's `adjust` stage
      (`LocationQtyStrip`, ±1 with rose/emerald, count → Take/Put keypad) is
      the only adjust surface.

## Exact current source identifiers

**Scan button (top right)**
- `src/components/mobile/v2/MobileV2ScanCta.tsx`: `router.push(...)` to
  `/m/scan`. It sends `?intent=location&returnTo=/m/stock` only when called
  from `/m/stock`.

**Scan page**
- `src/app/m/(shell)/scan/page.tsx`: `force-dynamic`, awaits
  `seedMobileReceivingFeed('triage')` (`src/lib/queries/mobile-feed-seed.server.ts`).
- `src/components/mobile/scan/MobileScanIdentify.tsx` (619 lines). Two
  location branches:
  - `locationOnly` (`intent=location`), ~lines 210–276: handles `moveLpn`,
    `moveSku`/`moveFrom`/`moveQty` and `pairSku`. Otherwise it pushes
    `withLocationScanProof(withJobReturn(locationHubPath(code), returnTo), proof)`.
  - General scan, ~lines 415–435: a `bin`/`bin-paired-order` route pushes
    `withLocationScanProof(locationHubHref(code), proof)`.
- `authorizeScannedLocation(code)` (~line 81) runs two requests in sequence:
  `fetchLocationRecord` (which also registers a new flat location), then
  `POST /api/locations/[code]/verify` → scan-proof token.
- `src/components/mobile/receiving/useArrivalHistory.ts`: React Query on
  `mobileFeedQueryKey('triage')`, the same key the `/m/triage` seed fills.

**Location record**
- `src/app/m/(shell)/loc/[code]/page.tsx` → `useLocationRecord()`
  (`src/components/mobile/location/useLocationRecord.ts`, query key
  `locationRecordQueryKey(code)`; reads `?verified=`) →
  `MobileV2LocationRecord` → `LocationStockPositions`.
- `src/components/mobile/scan/location-bind-api.ts`: `fetchLocationRecord`
  keeps a content row only when `qty > 0 || isProvisional`;
  `locationRecordQueryKey`.
- `src/lib/mobile/location-hub-href.ts`: `locationHubPath`,
  `locationHubHref`, `withLocationScanProof`, `locationKeypadHref`.

**Stock position sheet**
- `src/components/mobile/location/LocationStockPositions.tsx`:
  - The selected SKU is internal state (`selectedSku`), opened by `open(row)`.
  - Stages are `rest | adjust | move | more | photos`.
  - `startAdjust(row)` sets `adjust`; with no scan proof it also seeds
    `countDraft`.
  - With a proof (`verificationToken`), ±1 commits through `useBinQtyCommit`
    as put/take.

## Required changes

### 1. Scan button → camera with minimal delay

- `src/app/m/(shell)/scan/page.tsx`: render `<MobileScanIdentify />` with no
  server await. Drop `seedMobileReceivingFeed` / `ShellQuerySeed` from this
  route. They stay for `/m/triage`, `/m/home` and `/m/receiving` if those
  still use them.
- `MobileV2ScanCta`: call `router.prefetch('/m/scan')` (and the
  `intent=location` variant on `/m/stock`) once on mount, so the tap only
  swaps the client tree.
- Do not change camera start (`MobileCaptureWindow`). Measure before touching
  it.

### 2. History only on demand

- In `MobileScanIdentify`, gate `useArrivalHistory` behind user intent. Add
  `enabled` to the hook (default `true`, so other callers are unchanged); the
  scan page passes `enabled: showHistory`.
- Add one quiet "Recent scans" control in the station's empty area. Tapping
  it sets `showHistory = true`, then loads and lists history.
- This session's live tape rows (scans made on this visit) still show
  immediately; they cost nothing.
- Keep the history error/retry face, but only after the operator asked.

### 3. Location scan → one item: straight to adjust

Make both location branches (the `locationOnly` default path and the general
`bin` route) use one helper. Suggested home:
`src/lib/mobile/location-scan-landing.ts`, a pure function with a unit test:

```ts
/** Where a verified location scan lands. */
export function locationScanLanding(record: LocationRecord): { kind: 'adjust'; sku: string } | { kind: 'select' } | { kind: 'record' }
// exactly one content row and no handling units → adjust that SKU
// two or more content rows (or any rows plus totes) → select
// no content rows → record (today's hub: pair / add)
```

- "Paired items" means `record.contents` exactly as the location record
  shows them (qty > 0 or on-hold placeholder). Totes/LPNs
  (`record.handlingUnits`) are not adjustable items. If a location holds totes
  plus one loose SKU, treat it as `select`, so a tote is never skipped
  silently.
- `authorizeScannedLocation` must return the record it already fetched along
  with the proof. Then:
  - `queryClient.setQueryData(locationRecordQueryKey(code), record)`, so
    `/m/loc/[code]` paints with no second fetch.
  - Build the href from `locationScanLanding(record)`:
    - `adjust`: `locationHubPath(code)` + `?sku=<SKU>&stage=adjust` + `verified`
      proof + the existing `returnTo`/back.
    - `select`: `locationHubPath(code)` + `?pick=1` + proof.
    - `record`: today's href, unchanged.
- Keep the `pairSku` / `moveSku` / `moveLpn` branches exactly as they are;
  they run before the landing decision.

### 4. Location record honours `sku` / `stage` / `pick`

- `useLocationRecord` (or the page) reads `sku`, `stage=adjust` and `pick=1`
  and passes them down: `MobileV2LocationRecord` → `LocationStockPositions`
  (`initialSku`, `initialStage`).
- `LocationStockPositions`: on first render with a matching `initialSku`,
  `open(row)` then `startAdjust(row)`, so the sheet opens straight on the ±1
  strip.
- Remove `sku`/`stage` from the URL with `router.replace` after use, so a
  refresh or Back does not reopen the sheet.
- `pick=1`: keep the record page but put the stock rows first (Loose filter,
  scrolled into view, headed "Select item"). Tapping a row runs `open(row)` +
  `startAdjust(row)`; it does not stop at `rest`.
- Closing the sheet after an adjust returns the operator to the scan loop. The
  record's existing X/back already goes to `/m/scan` when opened from scan
  (`locationHubHref`); keep that, and add no new navigation.

## Verification

- Unit test `locationScanLanding`: 0 rows → record; 1 row, no totes → adjust;
  1 row + 1 tote → select; 2 rows → select; an on-hold placeholder counts as
  a row.
- On the lane at `:3050`, with the Playwright mobile project or a phone:
  - Scan button → camera live. Compare against the current build: the
    `/m/scan` document should no longer wait on `/api/receiving-lines`.
    Confirm in the network panel that no `receiving-lines` request runs until
    "Recent scans" is tapped.
  - Type a one-SKU location code into the manual field → the stock sheet
    opens on adjust with no second `GET /api/locations/<code>`.
  - A multi-SKU location → Select item, then one tap → adjust.
  - Real one-SKU locations: `A0202800`, `C0207400` (on-hold TMP SKUs with
    photos). A multi-item location: find one with `bin_contents` count > 1 in
    the `.env` DB.
- `pnpm verify:fast`; then `node tools/design-mcp/ds.mjs critique` on
  `MobileScanIdentify.tsx` and `LocationStockPositions.tsx`.

## Constraints and known state

- The testing IP is plain http, so the browser exposes no
  `navigator.mediaDevices`. The continuous camera falls back to the device
  camera there. That is expected; test the camera on https (production or the
  dev tunnel).
- `surface-selected` is now a real token (`tailwind.config.mjs` →
  sunken). Press faces are quiet washes; never `active:bg-mode-ink` or
  black.
- Production was last deployed from this worktree as
  `dpl_8qUixHaWUbCSAguoN6s9LcsxWbgA` (commits `3fdbb13a0`, `016db9963` on
  `prod/worktree-2026-09-11`). Git deploys are off. Deploy only when the
  operator asks.

## Shipped (2026-10-05) — read before changing the loop

The goal above is built, plus the QoL pass. Contracts a next session must keep:

- **One request per location scan.** `scanLocation(code)`
  (`src/components/mobile/scan/location-bind-api.ts`) → `POST
  /api/locations/[barcode]/verify` returns `{ token, expiresAt, record }`,
  registering a new flat location server-side (needs `print.label`, else
  403). GET and verify share `readLocationRecord`
  (`src/lib/locations/location-record.ts`). No index was needed: every query
  but the room walk is < 0.2 ms; the walk is 2–3 ms but O(org locations).
- **Landing.** `src/lib/mobile/location-scan-landing.ts`: one item → `?sku=&stage=adjust`,
  several or beside a tote → `?pick=1` (rows ordered by last moved), none →
  record. The scan sounds `success` for adjust, `warn` (look first) otherwise.
  `intent=location&resumeSku=` re-lands on that SKU after an expired proof.
- **Hardware scans on `/m/loc`.** The hub page claims printed location labels
  (same shelf renews the proof in place; another shelf lands like a camera
  scan). `LocationStockPositions` claims item scans while picking/adjusting
  (`resolveScannedItemSku`, `GET /api/sku-catalog/scanned-item`): first scan
  picks, each further scan of that item is +1. A bare letter-led code is tried
  as an item first, then handed to the hub with `detail.location = true`. The
  folded "Scan items to count" camera in the adjust stage fires the same
  `wedge-scan` event.
- **Next / Done.** Adjust shows `Next · <face>` (room or rack walk, prefetched;
  lands on the count path — no proof) and, when opened by a scan, Done returns
  to the camera.
- **Session memory.** `scan-tape-session.ts` keeps the scan tape across the loop
  (random row ids — counters restart per mount); `stock-adjust-session.ts`
  records every landed burst/count. The scan page paints adjusted locations as
  "TMP-1 +2" rows, a "N locations · M units" status, and Undo (inverse
  put/take, reason `UNDO`, only while the stored proof is unexpired).
- **Warm camera.** `src/lib/scan/warm-camera.ts`: a `MobileCaptureWindow` parks
  its stream on unmount; the next one reattaches without `getUserMedia`.
  Released after 90 s, on a hidden page, or on leaving the `/m` shell
  (`useWarmCameraOwner` in `src/app/m/(shell)/layout.tsx`).
- Still owed: an on-device https check of the warm camera and the camera
  item-count path; the http testing IP has no camera.
