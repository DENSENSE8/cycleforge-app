# HANDOFF — Kiosk "one cart system" (2026-09-24)

Paste everything below the line into a fresh agent session started in
`~/Projects/cycleforge-lanes/prod`.

---

You are continuing work on the counter tablet `/kiosk/v2` (origin
`http://localhost:3050` only; lane `systemctl --user … cycleforge-lane@prod`).
The operator is dogfooding and wants speed: **no forks, one cart system for sales,
custom amounts and repairs; recent carts for juggling customers; link existing
repairs without a signature; no PIN to remove a line.**

## What is DONE (code written, unit-tested; see "Verify" for what is not)

1. **Remove = one tap, no PIN, no reason.** Void floor, `customerSeenLineIds`,
   `voidedLines`, `voidLines` are deleted from `kiosk-session-store.ts`,
   `KioskCartLedger.tsx`, `KioskKeypadFace.tsx`, `submit-kiosk-visit.ts`,
   `kiosk-intake-payload.ts`, `/api/kiosk/intake`. The `void` approval kind and
   org `voidReasons` setting are gone (`price-approval*.ts`,
   `/api/kiosk/price-approval`, `KioskPriceApprovalSheet`, `tenancy/settings.ts`,
   `OrganizationSection.tsx`). `KioskLineReasons` is `{ comp }`.
2. **One cart line list.** `src/components/kiosk/KioskCartLineList.tsx` (cards +
   swipe Edit/Remove + editor) is mounted by the cart ledger AND the Keypad's
   Current sale. Shared header `KioskStepTitleRow` (`title · N · $total`, optional
   `meta` → `Cart #N`). `cartUnitCount()` in `cart-money.ts`.
   `KioskCartSwipeRow` only captures the pointer after 8px of sideways travel —
   this fixed "cards can't be tapped".
3. **One field system in the line editor** (`KioskCartLineEditor.tsx`, rewritten):
   all `KioskEntryField`. Repair lines = Serial / Price / Notes exactly like the
   Device & quote card, quote written by `repairQuotePatch()`
   (`src/lib/kiosk/repair-line-payload.ts`, also used by `KioskRepairPane`), no
   PIN. Custom (keypad) amounts: "Change amount" keypad, no PIN. Catalog sales
   keep Price adjustment / Comp behind the PIN. Linked repairs are read-only.
4. **Device & quote** (`KioskRepairPane.tsx`): units grouped per SKU
   (`repairDeviceGroups`, `repairUnitToDrop` in `repair-devices.ts`), cart's
   `− N +` via shared `KioskQuantityStepper.tsx`, one serial field per unit,
   "Price (each)". Resumes at the first unsatisfied step on remount.
5. **Phone companion** (QR → `/m/repair-scan` scans serials into the tablet):
   table `kiosk_companion_links` (migration `2026-09-24c`, applied+recorded),
   `companion-link.server.ts`, `companion-shape.ts`, `/api/kiosk/companion[/sync]`,
   `/api/counter/companion`, `useKioskCompanionLink`, `KioskCompanionPanel`,
   `RepairScanCompanion`. Verified tablet↔phone on :3050.
6. **Link existing repair** (no signature/serial/reasons/new ticket):
   `RepairPayload.linkedRepairId/linkedTicketNumber`, `isLinkedRepairLine`,
   `src/lib/kiosk/linked-repair-line.ts` (+test), `KioskLinkRepair.tsx` (mounted
   under the Cart step list), `Add to cart` in `KioskHistoryDetail.tsx`. Submit
   sends `linkedRepairs:[{repairId}]`; `submit-counter-transaction.ts` verifies
   org + not-on-another-visit, links, adds quote to totals and staged order.
   Triage / signature checks skip linked lines (visit-triage, submit-blocker,
   session-events, KioskCustomerFace, session-line-payload).
7. **Recent carts** (server-persisted, `#id`, any tablet can open, single writer):
   table `kiosk_carts` (migration `2026-09-24d_kiosk_carts.sql`),
   `kiosk-carts.server.ts`, `kiosk-cart-snapshot.ts`, `/api/kiosk/carts/**`,
   `useKioskCartSync` (mounted in `KioskShell`), `KioskRecentCarts` in a `carts`
   utility slot (Carts button + badge in `KioskTopChrome`). Store gained
   `cartId/cartVersion/cartDone`, `loadCart/startNewCart/completeCart/…`;
   `completeCart()` is called after successful submits in ledger + repair pane.
8. `src/lib/auth/kiosk-device.ts`: device ids from BIGSERIAL are now `Number(...)`
   (pg returned strings; broke `===` holder checks).

## Open items — do these in order

1. **`pnpm verify:fast`** currently fails on:
   - `src/lib/picking/sessions.ts` → missing `@/lib/picking/tote-scan` (NOT ours;
     someone else's in-flight work — report, don't fix).
   - Boundary: STALE exemption `MobilePrintWorkspace.tsx => useSendToDevice.ts`
     (not ours; baseline needs shrinking — report or shrink if trivially safe).
   - Confirm `src/lib/counter/submit-counter-transaction.test.ts` lines ~231,
     ~740 have no TS errors (a subagent claimed pre-existing; check with a scoped
     `tsc` including test files).
2. **Browser-verify the integrated build on :3050** (headless
   `/usr/bin/chromium --headless=new --no-sandbox --disable-gpu
   --user-data-dir=/tmp/<fresh>` — reuse of a profile hangs CDP; hide the Next dev
   overlay with `document.querySelectorAll('nextjs-portal').forEach(n=>n.style.display='none')`):
   - Cart: tap a repair card → editor shows Serial / Price / Notes (entry style);
     typing a quote updates `N · $total`; Remove line removes with no PIN.
   - Keypad: add $12.50 → Current sale header `1 · $12.50`; tap card → Change
     amount → saves with no PIN.
   - Customer saw the line (Verify stance) → Remove still one tap.
   - Link existing repair: find a standalone repair
     (`select id, ticket_number from repair_service where organization_id='00000000-0000-0000-0000-000000000001' and counter_transaction_id is null limit 5`),
     link it, Review shows no signature. Check that clearing the cart also
     clears the prefilled customer (subagent reported it did not — the store's
     `emptyVisit` clears it; find what re-fills it).
   - Recent carts: build cart, New cart, switch back, `Cart #N` in title.
   - **Never press Save / Check in & print / Pay.** Clear every cart you build.
3. **Migration `2026-09-24d_kiosk_carts.sql`** was applied by psql directly but is
   NOT recorded in `schema_migrations` (two other pending files belong to other
   work: `2026-09-24_platform_short_labels.sql`, `2026-09-24_repair_videos.sql`).
   Do not run `db:migrate` until those owners are done; it will then record ours
   as a no-op.
4. **Decisions for the operator** (ask, don't guess):
   - A linked repair counts as "Due at pickup", so a pickup-only visit shows
     "Check in & print", not Pay. Should picking up a finished (e.g. Ecwid)
     repair take payment now? Rule would live in `cart-money.ts`.
   - Done face lists only NEW devices; linked-only visit reads "Sale staged".
   - History `Add to cart` is untested in the browser (History needs a staff PIN).
5. Cleanup noise: several `Dogfood auto-bind` rows in `kiosk_devices` from test
   probes (leave unless the operator asks).

## Constraints

- AGENTS.md rules apply (`:3050` only, `pnpm verify:fast` before done).
- Don't edit other people's in-flight files (`picking/*`, `InstallPrompt.tsx`,
  the two pending migrations).
- Every write in the kiosk stays single-path: cart lines via the session store,
  repair quotes via `repairQuotePatch`, line list via `KioskCartLineList`,
  headers via `KioskStepTitleRow`. Do not add a second copy of any of these.
