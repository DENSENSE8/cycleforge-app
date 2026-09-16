# PLAN — the overall kiosk page

**Status:** plan only, nothing below is built · **Created:** 2026-09-11
**Lane:** `~/Projects/cycleforge-lanes/prod` (port 3077 — never start `:3050`)
**Scope:** the tablet surface at `/kiosk` · `/kiosk/v2` · `/m/consult`. Settings' kiosk-devices page is in scope only where it already holds law.

This is the page-level plan. The behavior decisions (`C1`–`C7`) stay in
`docs/todo/kiosk-counter-consult-PLAN.md` — plan of record, created 2026-09-10.
This document says what the PAGE is, what is dead on it, and in what order to
close it out.

---

## Verified current state (2026-09-11, HEAD 739b65be2)

```
/kiosk  →  re-export of /kiosk/v2        (src/app/kiosk/page.tsx:10)
/kiosk/v2, /m/consult
└─ KioskRealtimeProvider                 (src/components/kiosk/KioskRealtimeProvider.tsx:24)
   ├─ AblyProvider authUrl="/api/realtime/kiosk-token"
   ├─ KioskSharedSessionMount → useKioskSharedSession (renders null)
   └─ KioskV2Runtime → KioskShell        (src/app/kiosk/KioskShell.tsx:71-392)
      ├─ customer face  → KioskShowFace | KioskCustomerFace
      └─ staff face
         ├─ KioskTopChrome               (src/app/kiosk/KioskTopChrome.tsx:165)
         │    left  KioskCommandMenu (live KIOSK_SERVICES) + Exit
         │    right KioskUtilityCluster (stance · paperwork · cart+badge)
         ├─ work surface → ProductSelector layout="kiosk-split" (+ KioskRepairPane stage)
         │                 | KioskBuybackPane | KioskPickupPane
         └─ utility slot → KioskCartLedger | KioskPaperworkPanel
```

Facts that change how this page is planned:

- **The spines are gone.** `KioskModeSpine.tsx`, `KioskSpineToggle.tsx`,
  `KioskUtilitySpine.tsx` were deleted in HEAD; `KioskTopChrome` is the one
  chrome band. `docs/todo/kiosk-lighthouse-sidebar-HANDOFF.md` asks to rebuild
  exactly those — it is now **anti-law**; do not plan from it.
- **`KioskUtilitySlotId = 'cart' | 'paperwork'`** (KioskTopChrome.tsx:41). There
  is no triage slot, so `KioskTriagePanel` cannot be reached.
- **The cart is the session root.** `kioskSessionStore` holds the polymorphic
  cart; `KioskCartLedger` posts the whole visit to `/api/kiosk/intake` with an
  Idempotency-Key (KioskCartLedger.tsx:135-158).
- **Realtime shipped.** `KioskRealtimeProvider` + `useKioskSharedSession` +
  `/api/realtime/kiosk-token` + `kiosk-capability.ts` exist on the
  `org:{orgId}:kiosk:{deviceId}` grammar. `kiosk-remaining-and-e2e-PLAN.md:100`
  ("nothing in the kiosk tree touches realtime") is stale.
- **Pairing in practice is the dogfood autopair route.**
  `src/app/api/kiosk/dev-autopair/route.ts:64` is `allowAnonymous: true` and
  hands any browser an active org-#1 device token; `pairKioskTablet`
  (`src/lib/kiosk/pair-tablet.ts:13`) has no production caller.

---

## Law: search on the kiosk page never touches the URL

Same law as every slot-table desk (`docs/todo/prod-slot-table-SOT-HANDOFF.md`):
a find narrows what is already painted; writing `?q=`/`?search=` per keystroke
soft-navigates and remounts the surface.

Audited on this page, and it already complies:

| Input | Owner | State |
|---|---|---|
| catalog find (the one kiosk find-bar) | `KioskShell.tsx:85` `useState('')` → `ProductSelector` `searchQuery`/`onSearchQueryChange` | session-local |
| category / command / stance combobox filters | `IntakeCombobox` internals | session-local |
| pickup lookup (order/RS# + phone) | `KioskPickupPane.tsx:35-36` → POST body | session-local |
| buyback, repair, cart-line, customer fields | pane `useState` or `kioskSessionStore` | session-local |
| settings kiosk-devices find-bar | `useKioskDevicesSpreadsheet.ts:58` | session-local |

The only URL writes in the kiosk domain are **not** searches and stay:
`router.push('/')` for Exit (`KioskTopChrome.tsx:86`) and the sanctioned
`?view=devices|history` peer selector (`KioskDevicesWorkspace.tsx:40`, law in
`src/lib/kiosk/kiosk-devices-page-law.ts`).

**Now guarded:** `src/lib/tables/data-table-search-url.guard.test.ts` →
`kiosk catalog find stays out of browser URL state`. Any future kiosk find-bar
must pass that test; a pane that needs a query takes `{ value, onChange }` as
data from `KioskShell`, exactly as `ProductSelector` does.

---

## Wave 1 — delete zone (do first; it shrinks every later wave)

| Target | Evidence | Action |
|---|---|---|
| `src/app/kiosk/v2/KioskCounterPane.tsx` (420 lines) | zero importers; second checkout over its own `CounterDraft` | delete; then drop its path from `src/components/kiosk/KioskCustomerIntake.test.ts:34` and delete `buildKioskSalesIntakeBody` + its tests (`src/lib/counter/kiosk-intake-payload.ts:50`) — the live path is `buildKioskSalesIntakeBodyFromInput` |
| `src/app/kiosk/v2/KioskTriagePanel.tsx` (140 lines) | zero importers; no triage slot id | **decide**: either add `'triage'` to `KioskUtilitySlotId` + a glyph (it answers the real "one blocker sentence at a time" defect at `KioskCartLedger.tsx:115`), or delete. Do not leave it unreachable. |
| `src/app/kiosk/AttractLoop.tsx` (320 lines) + Inter-italic font load (`src/lib/fonts.ts:63-64`) | only importer is the Settings preview; consult `C3` says no attract | delete with Wave 5, or keep only if Settings preview is a product requirement |
| dead chrome tokens in `src/app/kiosk/kiosk-chrome.ts` | `KIOSK_MODE_SPINE_*`, `KIOSK_UTILITY_SPINE_FACE`, `KIOSK_CART_COL*`, `KIOSK_CART_FACE`, `kioskSpineShortLabel`, `KIOSK_BODY_INSET` unreferenced | delete the unreferenced ones; **rename** (not delete) `KIOSK_MODE_SPINE_ROW_ACTIVE/_IDLE`, `KIOSK_MODE_SPINE_ICON`, `KIOSK_UTILITY_SPINE_ROW` — still consumed by `ConsultStanceControls`/`ProductSelector` |
| stale docblocks in the same file (`:140-153`, `:190-206`, `:222-233`) and `src/app/kiosk/v2/page.tsx:5` ("dynamic()s AttractLoop + KioskShell") | describe the deleted spines / unmounted attract | rewrite to the top-chrome anatomy |
| dead exports | `welcomeKioskServices()` / `liveKioskServices()` / `KIOSK_SERVICES[].welcome` (`src/lib/kiosk/services.ts:30,:77-84`), `resolveKioskShellPreviewUrl`, `openKioskShellPreview` | delete; `KioskShell.tsx:75` already inlines the live filter |
| `src/app/kiosk/KioskShell.tsx:83` `const [cartFocus] = useState(null)` | no setter → `KioskCartLedger` `focus`, its effect (`:99-103`), `editFocusField`, `KioskCartFocus.nonce`, and `KioskCartLineEditor.tsx:152-156` are all dead | either wire the sender (it is the triage deep-link, see above) or delete the whole focus path |

Acceptance: no unreachable pane under `src/app/kiosk`, `pnpm run eval:discover`
DELETE list does not grow, `npx tsc --noEmit` clean, kiosk unit tests green.

---

## Wave 2 — the cart host, honestly

`KioskCartLedger.tsx:333-337` hand-rolls `<div role="table">` around the shared
`CompoundRow` + `CART_COMPOUND_COLUMNS` (`src/lib/kiosk/cart-grid-layout.ts:39`,
derived from `COMPOUND_TRACKS`, not a cart-flavoured array).

This is the one table-shaped surface on the page, and forcing it onto
`PRODUCT_TABLES` is **explicitly forbidden** by the plan of record
(`kiosk-counter-consult-PLAN.md:60`, `:201`). So Wave 2 is not "mount DataTable":

1. Keep the host. Record the exemption in `src/lib/tables/table-engine-law.ts`
   next to the existing named debt so a later Discover pass cannot read it as a
   fork — the row model and the column model are already the shared ones.
2. Close the dead affordance: `selectedLineIds` (`:79-89`) feeds `CompoundRow`'s
   select track but nothing consumes it. Either ship the bulk verb (void /
   discount selected) or remove the checkbox and the state.
3. `cart-compound-view.ts:102-105` leaves `thumbUrl` permanently null — resolve
   it from the catalog by SKU for retail lines, or drop the track from
   `CART_COMPOUND_COLUMNS` so the cart stops printing an empty column.

Acceptance: `src/lib/kiosk/cart-compound-view.test.ts` still renders through the
real `CompoundRow`; the select track either does something or is gone.

---

## Wave 3 — dual-device bind (consult Phase 0; blocks Phases 2 and 5)

Port desk→iPad BIND from main per `kiosk-counter-consult-PLAN.md:81-97`:
`counter-devices.ts`, `/api/counter/devices`, `bindSessionDevice` +
`POST …/session/{id}/device`, the `session.device_bound` event,
`useCounterSession.bindDevice`, `CounterDeviceAction.tsx`, the tenancy-guard
exemption row, plus unit tests. The tablet half already exists and is tested
(`kiosk-session-store.test.ts` pins mirror / stale-version / write-through /
detach; `kiosk-capability.test.ts` pins one channel per device, no wildcard).

Acceptance: a desk claim mirrors into the tablet cart and back; stance converges
on both faces; `tests/e2e/counter-session-two-device.spec.ts` exists and passes.

---

## Wave 4 — finish the two customer faces

- `KioskCustomerFace` is still the thin skeleton the plan calls out
  (`kiosk-counter-consult-PLAN.md:71`). Replace the "hand the tablet back" copy
  (`KioskCustomerFace.tsx:149-153`) with consult copy, and make it the pay-ready
  verify face (Phase 4, `:163-175`).
- `KioskShowFace` passes `COUNTER_TOUCH.control` on one line only (`:53`); apply
  the counter type/touch floors across it (Phase 3, `:158`).
- Add the missing render/E2E coverage: there is **no** component test for
  `KioskShell`, `KioskTopChrome`, `KioskCartLedger`, or either face, and no
  Verify-face E2E even though the stance path is already asserted
  (`tests/e2e/kiosk-intake-flow.spec.ts:659-664`).

---

## Wave 5 — make idle/attract true in one pass

`resolveKioskIdleTiming` is a permanent stub returning `IDLE_OFF`
(`src/lib/kiosk/idle.ts:35-37`, pinned by `idle.test.ts:20`), yet
`idleTimeoutSeconds` still parses (`src/lib/tenancy/settings.ts:46-49`) and
`kiosk_attract_slides` is applied and inert
(`src/lib/migrations/2026-08-10e_kiosk_attract_slides.sql`;
`kiosk-remaining-and-e2e-PLAN.md:83`).

Decision to execute, not re-litigate: consult `C3` says no idle, no attract →
drop the settings field, drop the table (new migration), delete `AttractLoop`
and the Settings preview card's attract half, keep `attract-media.ts` only if a
non-attract consumer remains.

---

## Wave 6 — input hygiene (consult Phase 6)

`kiosk-customer-form-face-PLAN.md:112-115`: 27 kiosk `TextField`s, 11 hints
total, `enterKeyHint` zero times. After Wave 1 deletes `KioskCounterPane` the
real count is 23 (`KioskCartLineEditor` 8 · `KioskBuybackPane` 5 ·
`KioskCustomerIntake` 4 · `KioskRepairPane` 4 · `KioskPickupPane` 2). Set
`inputMode`/`autoComplete`/`enterKeyHint` per field; keep the 48px touch and
16px type floors already pinned by `kiosk-counter-surface.test.ts:94-101`.

---

## Wave 7 — unblock E2E

`kiosk-remaining-and-e2e-PLAN.md:27-40`: `--project=desktop` loses 13/22 on one
dead credential (`USAV session not minted for "Michael" — 401
INVALID_CREDENTIALS`). Owner action, then re-run. Also decide `A3`/`B2`: the
retail happy path cannot run in QA because that org has no `platform_listings`
rows.

---

## Non-goals

- No new `/kiosk` route, no v1 revival, no spine rebuild.
- No `DataTable` mount on the tablet, and no `PRODUCT_TABLES` binding for the cart.
- No URL state for any kiosk find, filter, or pane selection — the tablet has no
  back button and no bookmark; `?view=` on the Settings peer page is the only
  sanctioned param in this domain.
- No second checkout path. `/api/kiosk/intake` from `KioskCartLedger` is the one.

## Anti-patterns

| Move | Why it fails |
|---|---|
| Plan from `kiosk-lighthouse-sidebar-HANDOFF.md` | Rebuilds the three spine files HEAD deleted |
| `?q=` on the catalog find | Soft-nav remount; fails the guard test |
| A second pane-local cart | The store is the session root; `KioskCounterPane` is the corpse of that idea |
| Registering the cart on `PRODUCT_TABLES` | Forbidden by the plan of record; would drag the slot-table cohort onto a consult surface |
| Deleting a pane without editing `KioskCustomerIntake.test.ts:31-37` | That structural test reads pane file paths and will fail |
| Starting `:3050` | Operator's server |

## Verify (every wave)

```bash
cd ~/Projects/cycleforge-lanes/prod
npx tsc -p tsconfig.json --noEmit
node --import tsx --test src/lib/kiosk/*.test.ts src/app/kiosk/kiosk-counter-surface.test.ts \
  src/components/kiosk/KioskCustomerIntake.test.ts src/lib/auth/withKioskAuth.test.ts \
  src/lib/tenancy/kiosk-host.test.ts src/lib/realtime/kiosk-capability.test.ts \
  src/lib/tables/data-table-search-url.guard.test.ts
npx playwright test tests/e2e/kiosk-intake-flow.spec.ts --project=qa-desktop
```

`pnpm run eval:cohort slot-table` is **not** required unless the cart is forced
onto `PRODUCT_TABLES` — which it must not be.
