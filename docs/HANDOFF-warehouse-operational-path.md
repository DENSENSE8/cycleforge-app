# HANDOFF: Warehouse operational path on the phone — pick → pack → scan out (2026-09-29)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is the state it
relies on. Other sessions edit this tree at the same time: re-read before every edit.

Supersedes the pick sections of `docs/HANDOFF-outbound-ops-e2e-order-to-scan-out.md` (§2 "Phone pick
list: directed" and its steps 3–4: the directed Next-pick stack is deleted).

## 1. Owner intent (verbatim direction, 2026-09-28 → 29)

"Identify the operational path within the warehouse" and remove every pain point on it, phone first:
an order goes in → the picker walks their list → the packer scans the unit or its bin and the phone
shows exactly what to do → the order is scanned out. Pick is a **triage** task (rounded, calm,
investigating); pack and scan-out are fast industrial steps. Every operator verb must be completable
on `/m/*` (`docs/mobile-first/SURFACE_LAW.md`).

## 2. What exists now (verified 2026-09-29 on :3050 at 390×844)

**Pick — `/m/pick` (one screen, triage on every device; BRIEF §14)**
- List: `src/components/mobile/picker/PickScreen.tsx`. My To-pick orders first (live PICK assignee,
  `work_assignments`), then unowned; other pickers' orders hidden. No chips, no filters, no
  Take/Pass, no tabs. One segmented progress header (`PickProgress.tsx` over
  `src/design-system/primitives/ProgressBar.tsx` `segments`/`activeSegment`/`ariaLabel`; counts in
  ARIA only). Floating fixed-width **Start picking · N** (`DetailDock placement="float"`).
- Card: `src/design-system/components/record-card/RecordCardMobile.tsx` fed by
  `orderCardModel` (`src/lib/orders/order-card-model.ts`, shared with the desk card). Top row: bin
  (`LocationBadge`, "No bin" → set-bin sheet) + SLA. Body: square photo exactly two text rows tall
  (`RECORD_MOBILE_PHOTO_SIZE_CLASS`), one-line title, subtitle `×qty · condition · price · platform`.
  No state rail, no order number.
- Walk: `/m/pick?order=<id>` → `PickOrderScreen.tsx` + `usePickOrder.ts`. Header X · bar · Skip.
  Per line: photo, title, ×qty · condition · price; "More order details" fold. First serial/SKU scan
  picks the order **anchored by order id** (`scanDeskOrder` → `POST /api/picking/desk/scan
  {type:'ORDER', orderId}`; Pickup orders with no label work). Inline serial edit/delete
  (`PickSerialList.tsx`, `removeDeskSerials` via `/api/picking/desk/serial` `update`). Flush 3-cell
  dock: Undo · Scan · **Pair bin / Update location** (camera → `/api/locations/:code` →
  `/api/update-sku-location` → existing ± count `/m/pair/:code/:sku`, `usePairBin.ts`). Floating
  white **Listing ↗** pill over Pair bin; greyed out when the listing would open another platform's
  store than the order's (`listingMatchesOrderPlatform`, `src/utils/external-item-url.ts`).
- Allocation on create: `createOrder` → `autoAllocateAfterIngest` (`src/lib/orders/create-order.ts`).
- Picker ownership: `sku_staff_pairings` seeded from pick history (100 SKUs: Sang 59, Thuc 33,
  Michael 8 incl. 7 update-disc overrides); rule in `src/lib/picking/pick-history-owners.ts`
  (≥3 own picks, ≥60% share, 60-day window else all-time); every org re-derived every 10 min in
  `src/app/api/cron/feed-membership-projection/route.ts` (never replaces an owner). Team-step and
  import default picker falls back to the SKU owner (`apply-listing-assignment.ts`, source
  `history`).

**Pack — `/m/pack`**
- `MobilePackingList.tsx` scan door → `GET /api/packing/resolve-scan` (`src/lib/packing/pack-scan.ts`):
  serial or tracking → `PackOrderSheet` (order card, picked-by, tote, serial, **Pack** →
  `/m/pack/start/[orderId]`); paired bin → `PackBinSheet` (SKUs paired there, ready-to-pack and
  to-pick orders, ± count); tote → pack job as before.
- Pack job `/m/pack/start/[orderId]` → `POST /api/packing-logs/draft` → photos
  `/m/p/[id]/photos` → `/api/packing-logs/update` (PACK_COMPLETED).

**Scan out** — desk only: `POST /api/shipped/scan-out` (`/shipping/scan-out`); phone
`/m/id/scan-out/[orderId]` is read-only.

## 3. Open pain points (ranked by operational cost)

1. **No phone scan-out.** The last hop needs the desk. Build it on the existing
   `POST /api/shipped/scan-out` writer (Pickup = handover, skips tracking gates).
2. **`POST /api/pack/ship` has no caller** — units never move to PACKED/SHIPPED and stock is not
   decremented at pack; only a best-effort mirror in scan-out (`src/lib/outbound/scan-out.ts:178-181`).
   Decide the one writer for pack-time unit state and wire it.
3. **Pack needs a bought label** (`/api/packing-logs/draft` refuses without tracking) and the To-ship
   queue hides unlabeled orders; Pickup orders need a no-label pack path.
4. **Locations are empty**: 42/43 To-pick orders have no bin anywhere (`sku_stock.location`,
   `bin_contents`, unit locations). Pair-bin fills it one SKU at a time; consider a bulk pairing
   pass and `PICK_FACE` roles / `sort_order` so the walk can sort by shelf.
5. **`/m/scan` can't resolve a raw serial** (letter-first → bin, digit-first → SKU,
   `src/lib/barcode-routing.ts:280-291`). Owner decision: should the universal scanner open the pack
   sheet for a serial?
6. **11 of 43 To-pick orders have no SKU**; ownership, bins and listings can't key them. Needs the
   catalog link fixed at intake.
7. Queue counts tally the loaded 200-row window only (desk and phone alike).
8. Quality-of-life backlog offered to the owner (not built): scan auto-advances the walk, group
   repeated SKUs into one card, walk sorted by bin once bins exist, "N without a bin" header chip,
   tap-to-zoom photo, swipe skip / can't-find, haptics, pace/streak.

## 4. Rules

- Dev origin `http://localhost:3050` only; lane `systemctl --user … cycleforge-lane@prod`
  (env `~/.config/cycleforge/lanes/prod.env`, `DEFAULT_TENANT_SLUG=usav` set so the Tailscale host
  `http://100.72.226.55:3050` signs in via "Sign in on a shared station"). A stuck "Opening…" after a
  hard reload is browser HTTP cache pinning an old chunk — reload with cache disabled or a private tab;
  a real compile error shows in `journalctl --user -u cycleforge-lane@prod` as "Parsing ecmascript".
- Browser: managed tabs `browser.open({ app: { relay: false } })`, 390×844; sign in with
  `/api/auth/staff-picker` + `POST /api/auth/signin {staffId, deviceKind:'personal'}` header
  `x-tenant-slug: usav` (Michael 1, Thuc 2, Sang 3).
- Never write a pick/pack/scan-out on a non-`CF-TEST-` order; intercept writes. Create `CF-TEST-`
  orders via `POST /api/orders/add`; delete every row you create in ONE transaction and print counts
  (`audit_logs` is append-only — leave it).
- One writer per fact: reuse existing routes; no parallel paths. Multi-tenant: every query org-scoped
  (`withTenantTransaction`/`tenantQuery`); the tenancy guard must stay green without loosening it.
- Design system: `node tools/design-mcp/ds.mjs contract|tokens|critique`; change a pin in
  `src/design-system/pinned.json` and BRIEF §14 when the owner overrides it, citing the date.
- `pnpm verify:fast` green before done; attribute any red by file.

## Prompt

> You own the warehouse operational path on the phone in CycleForge: pick → pack → scan out, for
> every product line, multi-tenant. Read `docs/HANDOFF-warehouse-operational-path.md` first, then
> `docs/design-system/BRIEF.md` §14 and `docs/mobile-first/SURFACE_LAW.md`. Work on :3050 only in
> managed tabs at 390×844. Other sessions edit this tree: re-read before each edit.
>
> Do, in order, proving each step in the browser + DB before the next:
> 1. **Walk the path yourself** as Thuc (2) on a `CF-TEST-` order: Start picking → scan pick →
>    Pair bin → `/m/pack` scan the serial → Pack → photos → scan out. Write a table: step, screen,
>    taps, seconds, what blocked you. Add any pain point missing from §3.
> 2. **Phone scan-out** on the existing `POST /api/shipped/scan-out` writer (Pickup handover +
>    labelled parcel), reachable from the pack sheet and `/m/scan`; order leaves To ship live on a
>    desk tab (Ably `order.changed`), ms measured.
> 3. **Pack-time unit state**: decide and wire the one writer for PACKED/SHIPPED + stock decrement
>    (`/api/pack/ship` or delete it); no double decrement with scan-out.
> 4. **Pickup / no-label pack path** so a walk-in order can be packed and handed over from the phone.
> 5. Ask the owner once, batched, after step 1: `/m/scan` serial → pack sheet? which §3.8 QoL items
>    first? bulk bin pairing now?
> 6. **Report** one row per hop (surface, operator action, ms, DB proof, screenshot, pass/fail), every
>    fix with its file, then clean up every `CF-TEST-` row in one transaction with counts, and
>    `pnpm verify:fast` green.
>
> Everything else: decide conservatively and say what you chose.
