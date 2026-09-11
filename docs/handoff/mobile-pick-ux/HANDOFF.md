# Handoff: mobile pick / orders UX interaction layer

**Product:** CycleForge (B2B warehouse OS). USAV is the first dogfood tenant only — do not frame UX as an internal USAV tool.

**Layer:** Phone **UX / UI interaction**. Cards, sheets, search chrome, listing control, pass-pick, ship-by bands. Not API design. Not desktop DataTable. Not `/m/pick/[orderId]` carton scan.

**Status (2026-09-09):** First interaction pass is in the working tree, uncommitted. A prior agent also patched `GET /api/orders` search SQL. **Do not continue that API work unless a UI bug proves a mapping hole after client filter is already correct.** Freeze `src/app/api/orders/route.ts`.

**Design read:** Floor-ops redesign of the existing phone queue. Keep item-record + `BottomSheet` + `IconButton`. Names stay on the sheet, not the card. Taste skill: `.agents/skills/redesign-existing-projects/SKILL.md` — audit what is here; do not invent a landing-page look.

---

## Screenshots (required reading — look at the pixels)

Open these files with the Read tool (images). They are the current SoT for row chrome and sheet verbs:

1. [`01-queue.png`](./01-queue.png) — `/m/work` queue. Search placeholder **Search product, SKU, item…**. **OVERDUE** band. Title row: ⋯ then **Listing** as the far-right control. Qty/condition/notes cluster. Pick/Packed colour marks (initials only). Full-width **Ship**. Out of stock is **not** on the card.
2. [`02-sheet.png`](./02-sheet.png) — ⋯ / row tap opens the order sheet. Identity last-8 + tracking. Full picker/packer names. Ship-by. SKU. **Pass pick** first among secondary verbs, then Listing, Shipping label, Internal documents, Order details, Out of stock (ghost), Ship (primary).

Missing shot (take this before claiming Pass pick done): nested **Pass pick** sheet (`data-testid="to-ship-pass-pick"`) with picker search + `StaffChoiceRowButton` list.

---

## Surfaces

| Route | Title | Feed | Mount |
|---|---|---|---|
| `/m/work` | Orders | `unshipped` (in-warehouse) | `AssignedOrders` → `MobileToShipQueue` |
| `/m/pick` | Picks | `pending` (not-yet-packed) | `PickQueue` → `MobileToShipQueue feed="pending"` |
| `/m/pick/{entityId}` | carton process | **out of scope** | `mobileProcessOrderHref` — Ship CTA lands here. Do not restyle unless asked. |

Home `/m/home` still has the Orders inset preview. View-all opens `/m/work`. Do not collapse home into this queue.

---

## Interaction law (do not regress)

1. **Row title cluster:** ⋯ (`to-ship-more`, aria **More details**) then Listing (`to-ship-listing`) as the **rightmost** control. Listing opens marketplace URL via `getExternalUrlByItemNumber`. Disabled when no href.
2. **Sheet:** ⋯ and tapping the card body (not nested buttons) open `MobileToShipSheet` (`to-ship-sheet`). Identity numbers, ship-by, SKU, full names live **only** on the sheet.
3. **Pass pick:** sheet button opens nested `MobileToShipPickerSheet` (`to-ship-pass-pick`, `level={1}`). Lane filter `staffMatchesStageLane(..., 'technician')`, fallback all staff. Tap commits `useOrderAssignment({ testerId, testerName })`. This is **not** sign-in `SwitchStaffSheet`.
4. **Ship:** full-width row CTA + swipe-right-to-ship + sheet Ship. Blocked when out of stock. Navigates to `/m/pick/{entityId}`.
5. **Out of stock:** sheet only. Optimistic disable of Ship; POST assign with `isOutOfStock: true`.
6. **Search:** placeholder **Search product, SKU, item…**. URL `?q=`. Client `filterToShipByQuery` matches title, category, serial, notes, account, qty, condition labels, order id, tracking, sku, item number, picker, packer. Default sort is **Ship by** (`parseMobileToShipSort` → `'deadline'`). Empty `sort` must band Overdue → Today → Upcoming.
7. **Names on the card:** Pick/Packed colour marks only. Given names must not appear on the row (`Alex` / `Pat` stay on the sheet).

Primitives: `ItemRecordThumb`, `ItemRecordMobileMeta`, `ItemRecordMobileStage`, `BottomSheet`, `IconButton`, `Button`, `SearchField`, `StaffChoiceRowButton`, `StaffAvatar`. Call `ds_contract` / `ds_tokens` / `ds_critique` (or `node tools/design-mcp/ds.mjs …`) **before** any `src/**/*.{tsx,jsx,css}` write.

---

## Files that are this layer

Edit these:

- `src/components/mobile/redesign/MobileToShipRow.tsx`
- `src/components/mobile/redesign/MobileToShipSheet.tsx`
- `src/components/mobile/redesign/MobileToShipPickerSheet.tsx`
- `src/components/mobile/redesign/MobileToShipQueue.tsx`
- `src/components/mobile/redesign/PickQueue.tsx`
- `src/components/mobile/redesign/AssignedOrders.tsx`
- `src/components/mobile/redesign/useToShipOrders.ts` (feed switch only)
- `src/lib/work-orders/to-ship-assignment.ts` (client filter/sort — interaction contract)
- `tests/e2e/mobile-home-assigned-orders.spec.ts`

Do **not** edit unless the user asks or a UI proof requires a mapping:

- `src/app/api/orders/route.ts` (already widened `q` ILIKE — freeze)
- Desktop desks, DataTable, right rail, slot-table cohort
- `src/app/m/(shell)/pick/[orderId]/**`

---

## Known leftover / do not “fix” by rewriting APIs

- `verify:fast` typecheck fails on **pre-existing** `DashboardOrderDetails.tsx` (`AnimatePresence`) and `OutboundOrdersDesk.tsx` (`details` on `ToShipWmsShellProps`). Out of scope.
- Critique already flags swipe `style={{}}` on the row and raw tab `<button>`s in the queue. Improve only if you stay on item-record / existing tab pattern — do not invent a new tab component unless `ds_contract` names one.
- Floating **N / 2 Issues** pill in screenshots is capture-dock chrome, not this queue.

---

## E2E that already exists

File: `tests/e2e/mobile-home-assigned-orders.spec.ts`  
Viewport: `390×844`. Mocks `GET /api/orders?**` and `GET /api/work-orders/mine**`. Auth: `tests/.auth/admin.json`. Cookie domain must be **`localhost`**, not `127.0.0.1`.

```bash
PW_BASE_URL=http://localhost:3077 pnpm exec playwright test \
  tests/e2e/mobile-home-assigned-orders.spec.ts --project=mobile
```

Covered today:

- Home Orders group → `/m/work` chrome (tabs, sort, search).
- Queue: thumb, qty, condition, notes, picker/packer **without** given names, Ship, `to-ship-listing`, `to-ship-more`, **zero** Out of stock on the row, identity/SKU/ship-by **absent** on the row.
- Sheet: last-8, ship-by, full names, Pass pick, Listing, docs, Out of stock, Ship.
- Title A–Z sort via URL `sort=title`.
- Search by marketplace order id.
- Out of stock **from the sheet** (via ⋯) posts assign and disables Ship.

**Not covered — add before claiming the interaction layer done:**

1. `/m/pick` paints the same chrome (`to-ship-queue`, search, ⋯, listing, Ship). Confirm pending feed query in `src/lib/queries/dashboard-queries.ts` and mock the same `/api/orders?**` if that is what it uses.
2. Listing is **DOM-after** ⋯ (far right): `to-ship-listing` bounding box `x` > `to-ship-more` `x` on the first row.
3. Pass pick: ⋯ → Pass pick → `to-ship-pass-pick` visible → tap a staff row → `POST /api/orders/assign` body includes `testerId` + `testerName`. Read `src/lib/staffCache.ts` and mock staff if the nested sheet is empty.
4. Search by **SKU** and **condition grade** hides the other fixture row. Add `catalog_category` / `serial_number` to the mock if you assert those needles.
5. Default sort (no `sort=`): overdue ship-by first. Fixture two dates; assert first `li` is the sooner deadline.
6. Optional: swipe-to-ship still reaches `/m/pick/99`.

After Playwright is green, **re-take two screenshots** (queue + sheet) into this folder and attach them in the reply. A third Pass-pick nested sheet shot is required if you touch that sheet.

Browser verify (not a screenshot of a cold render): click ⋯, Pass pick, Listing (href present), search, sort reset to Ship by, Ship CTA. Same flows on `/m/pick`.

---

## Unit tests (keep green)

```bash
npx tsx --test src/lib/work-orders/to-ship-assignment.test.ts
npx tsx --test src/lib/work-orders/shipped-as-work-row.test.ts
```

Do not claim `cursor-eval --fast` green while DashboardOrderDetails / OutboundOrdersDesk typecheck is red.
