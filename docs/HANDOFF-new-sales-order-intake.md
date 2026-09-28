# Handoff — New sales order intake (`/orders/new` · `/m/orders/new`)

Paste this whole file as the next agent's prompt. **Your job is the section
"This pass" directly below**; everything after it is the ground truth of what
is built, what was verified, and the rules.

## Landed 2026-09-27 (parity pass) — one flow, one display, desk and phone

Owner: the same task must read the same on mobile and desktop, for exact
identification. Code-complete; the A items 1–3 below are **done by this pass**
(A4 coarse-pointer check and all of B still to run).

- **Shared parts** (`src/design-system/components/triage-shelf/`, pinned as
  `TriageLineIdentity`): `TriageLineIdentity` (photo · title · Repair service tag
  · facts), `ConditionChipFace` (the ledger's chip), `TriageImportRowFace`,
  `CheckoutStepTrail` (desk and phone trail; `touch` on the phone; the desk's
  `CheckoutBreadcrumbs` and the phone's path chips are deleted). Fact wording and
  order live in `src/lib/orders/intake/checkout-model.ts` — `cartLineFacts`
  (SKU · Item # · stock · bin), `teamLineFacts` (grade first), `cartUnits`,
  `listingAvailability`, `hitAvailability`, `listingLineOf`, `lineNeedsPairing`,
  `pairLineToHit` — and `import-rows.ts` (`squareInvoiceRow`, `ecwidOrderRow`).
- **Condition on the phone**: the cart line's chip opens the ledger's grade
  list (`MobileChoiceRows`); before this every phone order saved `condition: null`.
- **Pairing on the phone**: "Pair to a catalog product" → `MobileLinePairSheet`
  (same search core, same patch as the desk).
- **Triage voice on the phone form**: `TabSwitch` corners follow the region
  (`SEGMENTED_CONTROL_CORNER` / `…_FACE_CORNER`); `DetailDock` in a triage region
  paints separate `Button`s on the bar (industrial unchanged, `useMode()`);
  press inversion (`active:bg-mode-ink`) removed from every row in
  `src/components/mobile/orders/new`; `MobileChoice` picks wash in accent.
- **Cart edits after Save draft** (was open item 7): a line already on the draft
  edits in place and lands on its held row — debounced 600 ms, and flushed before
  release and before any payment (`useOrderPayment.take` now always calls
  `onEnsureSaved`). New server action `POST /api/orders/[id]/cage-release
  { action: 'set-line', line }` → `setHeldOrderLine` (held rows only, 409
  `ALREADY_RELEASED` otherwise; catalog id scoped to the org; To-ship feed title
  follows). Adding a NEW product or removing a line after the draft save is
  refused with a toast (remove buttons hidden) — the draft's row set is fixed.
- **Test fill**: with Test mode on and before the first save, **Fill test order**
  (desk, right of the toggle, `checkout-test-fill`) / **Fill** (phone,
  `m-order-test-fill`) fills Test Buyer + one real catalog product (first hit of
  "bose" / "speaker" / "a", Refurbished) + Phone + ship-by today + Pickup and
  opens Payment — one press from release. `testOrderFill` in `intake-model.ts`.
  Its customer row is new each time: clean it up with the order.
- **Verified on :3050 (2026-09-27, late):** desk 1440×900 — Fill → Payment with
  "Bose Link cable" (10 in stock, bin C-02-03-6, REF), Release → "Order
  CF-TEST-PH-000002 is in To ship" (0:21), row on `/shipping/orders`; phone
  390×844 — Fill sits right of Test (no overflow, `scrollWidth` 390), dock
  Release is a rounded 8px button, Release → CF-TEST-PH-000003 in To ship (0:08).
  DB: both `released`, qty 1, REFURBISHED, $5.00, PICKUP. `CF-TEST-PH-000001`
  (id 19569) was created while the dev lane full-reloaded mid-save: it never got
  caged (`release_state` NULL, live on To ship) — the create → cage gap is real
  and pre-existing. Test rows 19569–19571 are left in place for review; clean up
  with `DELETE /api/orders/<id>` + their `work_assignments` + the Test Buyer
  `customers` rows.

## This pass (next agent) — split the phone onto triage, then test the whole form end to end

Two deliverables, in this order. Neither is done until the browser run in B
passes on the live lane (`http://localhost:3050` only — AGENTS.md §1).

### A. Finish the triage / industrial design-system split on the phone

`/m/orders/new` is a **triage** region (`mode-registry.ts`
`{ route: '/m/orders/new', mode: 'triage', form: true }`; probed on the lane:
`data-mode="triage"`, `--mode-radius: 10px`, `--mode-radius-control: 8px`).
Fields, path chips (`cornerClass('surface')`), scope chips (`Button
radius="pill"`), shelf tiles (`rounded-mode`) already round with the region. Two
shared components are HARD-flushed and ignore the region — they still paint the
industrial boxed face on the phone form:

1. **`TabSwitch`** (`src/design-system/components/TabSwitch.tsx`, rail +
   faces `cornerClass('flush')` at ~L85 / ~L102; header note "INDUSTRIAL
   (operator 2026-09-23): box it off, no corner radius"). Probed: the phone's
   Sales · Repair service switch computes `border-radius: 0px`; the arrival
   switch (New order · Square invoice · Ecwid order) is the same.
   **Split:** the rail takes `SEGMENTED_CONTROL_CORNER` and the faces (and the
   sliding pill) `SEGMENTED_CONTROL_FACE_CORNER` (`src/design-system/tokens/radius.ts`
   ~L106–114 — the concentric pair built for exactly this). Those resolve to 0
   in an industrial region (`radiusControl: '0'`) and 8px / 6px in triage, so
   the industrial boxed face is KEPT where the floor runs, and triage rounds —
   one component, the region decides. Do not fork a second TabSwitch.
   Blast radius: 19 `<TabSwitch` mounts — run `impact_analysis` on `TabSwitch`,
   list the triage-region consumers that will now round (desk sidebars etc.),
   screenshot two of them before/after, and say so in the report.
2. **`DetailDock`** (`src/design-system/components/DetailDock.tsx`) — the
   phone's Back · Continue (and Payment's Back · Save draft · Release, and the
   inline Payment status verbs `placement="inline"` in `MobilePaymentStep`) is
   the industrial "terminal block": full-bleed `Button radius="flush"` cells in
   a `divide-x` grid, `min-h-18`, instant ink inversion. In a triage region it
   must be **mobile-first buttons with a proper corner**: a sticky bar on
   `bg-mode-bar` with `px-mode-page py-2 pb-safe`, `gap-2`, each verb a
   design-system `Button` with the default `radius="control"` (region control
   corner), touch height (`min-h-mode-hit-cta` / size `lg`), Back = `secondary`,
   the primary verb = `primary`, Save draft = `secondary`; same disabled /
   loading props. **Split:** read the region with `useMode()`
   (`src/design-system/providers/ModeRegion.tsx:103`) — `industrial` (and
   `null`) keeps today's terminal block byte for byte; `triage` paints the
   button bar. Selection mode (`N SEL` clear cell) is industrial-only — keep it
   there. 20 `<DetailDock` mounts: the phone stations (`/m/pick`, `/m/work`,
   scan) are industrial and must not change — verify one of them unchanged.
3. **Audit the rest of the phone form for hard-flush faces** in-region:
   `grep -rn 'radius="flush"\|cornerClass(.flush.)\|rounded-none'` over
   `src/components/mobile/orders/new` and every design-system component it
   mounts (`BottomSheet` cart sheet, `TextField`, `MobileTopBarAction` is shell
   chrome — out of scope). Anything the region should own follows the region
   (`rounded-mode*` / `cornerClass('surface'|'pill')` / Button `radius` default).
4. **Coarse pointer check (real-phone risk).** `packages/design-tokens/src/modes.ts`
   (~L669) squares `:root` corners under `@media (pointer: coarse)`; a
   `[data-mode]` region redeclares its own vars, so triage should stay rounded
   on a real phone — but the headless run reported `pointer: coarse = false`.
   Emulate a coarse pointer (CDP `Emulation.setTouchEmulationEnabled` +
   `Emulation.setEmitTouchEventsForMouse`, or `Emulation.setEmulatedMedia`
   with feature `pointer: coarse` if accepted) and re-read
   `getComputedStyle(regionEl).getPropertyValue('--mode-radius-control')` and a
   TabSwitch face's `borderRadius`. If coarse squares the region, fix it in the
   token emission (region coarse block keeps the region's radius), not per
   component.
5. **Law**: update `src/design-system/pinned.json` — `TabSwitch` and `DetailDock`
   entries (add them if missing): "never hard-flush a face; the corner follows
   the region — industrial square, triage rounded; DetailDock triage face =
   Button bar". Rebuild nothing generated. Run `node tools/design-mcp/ds.mjs
   critique <file>` on both components after the edit.

### B. End-to-end browser test of the ENTIRE form (desk + phone)

Drive a real browser (`browser.open({ name, app: { relay: false } })`, fresh
managed tab; sign in with `/api/auth/staff-picker` + `/api/auth/signin`, header
`x-tenant-slug: usav`, staff "Michael"). Wait for hydration before acting —
`Object.keys(el).some(k => k.startsWith('__react'))` on
`[data-testid="new-sales-order"]` / `[data-testid="m-new-sales-order"]`; after
a rebuild the first load can 404 a stale chunk and take ~40 s to hydrate —
reload, never debug a dead page. **Test mode ON for every save/release**
(`[data-testid="checkout-test-mode"]` / `m-order-test-mode`). Screenshot each
step (`page.screenshot({ clip })`) and look at it. Keep a table of every
assertion → pass/fail → evidence (selector value / screenshot path) for the
report. Desk at 1440×900, keyboard only unless the step says click; phone at
390×844 touch.

**Header "+ Add"** — hover: `[data-nav-key-hint="add"]` under the pill, right
edges equal, lead "Press C then", rows `S` / `I` first (no Ecwid row since
2026-09-27 — storefront orders arrive by the Ecwid sync; `/orders/new?mode=ecwid`
still works). Click: `global-add-menu` = 2 rows, no keys, no header row, hint gone. Outside a field
press `C` then `S` → `/orders/new`; `C` then `Esc` cancels. `?` sheet lists the
"New sales order" group.

**Desk run 1 — typed phone order, pickup, released live (keyboard only):**
1. Customer: name typed in `intake-customer-name`; timer
   (`checkout-timer`) appears on the first keystroke, NOT on load; ship-by
   default must not start it.
2. `Alt+Shift+2` from inside the field → Products, `checkout-product-query`
   focused. Sales shelf lands on Favorites (else All products); trail shows the
   glyph chip + field, category menu, and the switch at top right with `Alt R`.
   Type "bose 151" → `checkout-product-hit` tiles, `↓` `Enter` adds, field
   clears, focus stays. Tap one browse tile (`checkout-shelf-tile`) → line with
   item # = listing id; tap again → qty 2.
3. `Alt+R` → `data-shelf="repair"`, focus stays; type "wave" → repair tiles
   tagged "Repair service"; `Enter` adds; switch reads "Sales N · Repair
   service 1". `Alt+R` back → the Sales shelf is where it was (crumb kept).
   Drill a category + back chevron + crumb root on each shelf.
4. Cart: every money figure green (price each, line total, subtotal, total,
   step-nav total); sales line → condition chip opens the ledger list (NEW ·
   L-NEW · REF · A · B · C · PARTS), pick REF; repair line → "Repair service"
   tag, NO condition, NO "Pair to a catalog product". Qty 0 removes a line.
5. `Alt+Shift+3` Team (chips; change one → "changed"), `Alt+Shift+4` Order:
   no "Ship by" title, ship-by face = today, click moves it; order number
   generated; the 2×2 grid aligned. Blur (`Esc`/click away) then bare `5` →
   Shipping; bare digits inside a field must type, not jump. `Alt+B` / `Alt+N`
   walk from inside a field and with a combobox open.
6. Shipping → Pickup. `Alt+N` → Payment shows the test-mode note. Open a
   SECOND tab on `/shipping/orders`. `Ctrl+Enter` → `checkout-done` reads
   "Order CF-TEST-… is in To ship"; the second tab shows that row within ~3 s
   WITHOUT reload (Ably `order.changed`); note the ms.

**Desk run 2 — Ecwid import already in CycleForge (test mode):** `Alt+I` twice
→ Ecwid; search; a row marked "In CycleForge · #" is importable in test mode;
Enter → lands on Team with lines, buyer, ship-to; Save draft (`Ctrl+S`) →
header "Draft CF-TEST-<number>". Repeat the SAME import → a second save must
still be `CF-TEST-…` (the 409 retry draws from the test sequence — never a bare
`PH-`/number). Square invoice: list loads; import one only in test mode and
confirm no `order_payments` link row was written for it.

**Desk run 3 — Buy with ShipStation without saving first:** typed order with a
full ship-to + weight → Shipping → Buy → "Open ShipStation" saves the held
draft and mounts `intake-label-buy`; "Get shipping rates" → on this lane it
400s ("ShipStation is not connected", see Rules — an environment fact, not a
bug); switch to Pickup, release, confirm live on To ship.

**Phone run (390×844, after A):** `/m/orders` → New. Assert rounded corners by
computed style: arrival TabSwitch and Sales · Repair service switch faces
`borderRadius > 0`, the dock's Back / Continue are separate rounded buttons
(not full-bleed cells), no horizontal overflow (`scrollWidth === 390`). Walk
Customer → Products (one tile per shelf, both in the cart sheet, repair tagged,
totals green) → Team → Order (ship-by today) → Shipping (Pickup) → Payment
(test note) → Release; the second desk tab on `/shipping/orders` shows it live.
Test switch + banner fit. Ecwid import of an already-synced order is enabled in
test mode and saves as `CF-TEST-<number>`.

**Regression:** `/kiosk` counter shelf still renders (the counter keeps
`ProductSelector`; `hideBrowseSearch` was removed as dead) — one screenshot; one
industrial phone station with a DetailDock (e.g. `/m/pick`) unchanged.

**Cleanup (mandatory, same session):** for every `CF-TEST-…` you created,
`DELETE /api/orders/<id>` (find ids via
`/api/orders/intake/order-number?check=<number>`), then with the worktree
`.env` `DATABASE_URL`: delete the orphan `work_assignments`
(`entity_type='ORDER' AND entity_id IN (…)`) and the `customers` rows those
saves created (created in this session, no remaining `orders.customer_id`
reference) — in one transaction, counts printed. Do not touch the older
`CF-TEST-1789…` rows other lanes left.

**Done** = A merged + `pnpm verify:fast` green except the known `src/lib/auth/pin.ts`
error + the assertion table all pass (or each failure fixed and re-run) +
cleanup counts reported + this file's "Verified" section updated with the run.

## Goal

An operator takes a sales order **on the phone** — or imports one already written
up in **Square** or placed on the **Ecwid** storefront, or rings up a **walk-in** —
and hands it to the floor with a **picker and packer**, as fast as possible: on the
desk **entirely from the keyboard**, on a phone **entirely with a thumb** (the
business line on one phone, the order on a personal phone). The page is both a
customer sale form and an internal work-order triage form. Throughput (seconds per
order) is the metric; every change must shorten or keep the keyboard path.

## One job, two faces (binding)

ARCHITECTURE.md "Component split" (depcruise Boundary gate, shrink-only baseline)
forbids `/m` from importing desk components and the desk from importing mobile
ones. So the job is ONE step machine in logic, painted twice:

- Logic (shared): `src/hooks/orders/useSalesOrderCheckout.ts` (modes, imports,
  trail, cart, timer, order number, save → team → invoice link → release),
  `useOrderTriage`, `useRuleAssignments`, `useIntakeImports`, `useOrderPayment`,
  `useCustomerSearch`, `useCatalogShelf` (all `src/hooks/orders/`);
  `src/lib/orders/intake/{intake-model,checkout-model,intake-product-client}.ts`.
- Desk face: `src/components/orders/new/*` (dense, keyboard chords, pinned cart).
- Phone face: `src/components/mobile/orders/new/*` (path chips, one step on
  screen, one sticky `DetailDock`, cart behind the top bar's page action).

Change behaviour in the hooks/lib, never in one face only.

## Entry points (built, verified on `:3050`)

- Header **"+ Add"** pill (`src/components/layout/GlobalHeaderAdd.tsx`) — three
  inputs, one item list (`NEXT_KEYS`: `S` New sales order, `I` Import a Square
  invoice — the `E` Ecwid row was removed 2026-09-27):
  - **Hover** (mouse) teaches the keys, the sidebar parent-mode switcher's way
    (`NavModeSwitcher`): a light sheen sweeps the pill, the `+` turns 90° (both
    off under reduced motion), and `KeyHintPopover` (`NavGoKeys.tsx`, id `add`)
    hangs under the pill flush with its right edge (`at = { right, top }`):
    lead "Press `C` then" (sentence case), rows hotkey first — `[S] 🛒 New
    sales order`, `[I] Import a Square invoice`.
    Pointer-events-none, never shades the page, gone while the menu is open.
  - **Click**: a `DropdownMenu` anchored under the pill (`global-add-menu`),
    the list only — icon + label rows, no header row, no keys (hover taught
    them); arrows + Enter work.
  - **A key is painted once (design-system law, `ChordKeys`).** The centred
    `C` card's header paints the leader and wraps its rows in
    `ChordLeaderScope leader="C"`; rows paint `<ChordKeys keys={['C', 'S']} />`,
    which drops the leader inside the scope (`keysAfterLeader`,
    `ChordKeys.test.ts`). Never hand-build a `C` + letter keycap pair; never
    print the leader in a header and again on its rows. Pinned in
    `src/design-system/pinned.json` (`ChordKeys`; the hover card's law is in
    `NavGoKeys`). Modifier chords (`⌘ S`, `Alt N`) are not leaders — they stay
    `chordKeys()` + `KeyboardKey`.
  - **`C` leader** anywhere outside a text field: the small card in the dead
    centre of the screen naming the NEXT key, `Esc` cancel (4 s timeout,
    click-away cancels). Same grammar as `G` then a letter (`NavGoKeys`).
    **⌘K stays find** (`CommandBar`) — never put create actions in it
    (`src/design-system/pinned.json` palette law).
  - Scanner-safe: `C` arms only after `GO_SCAN_BURST_MS + 20` with no following
    key; a wedge burst starting with `C` never arms. No `preventDefault` on the
    leader key.
  - Suppressed in editable targets, under `hasOpenOverlay()`, and while any
    `[role="dialog"][data-state="open"]` is up.
  - Listed in the `?` shortcut sheet via `registerShortcutOverviewGroup`.
- Sidebar action `orders.add` and the chat's "Open in form" (`orderPrefillHref`)
  both land on `/orders/new` (`NEW_SALES_ORDER_PATH` in
  `src/lib/orders/manual-order-draft.ts`). `?prefill=`, `?mode=import` (Square),
  `?mode=ecwid` work.
- Phone: `/m/orders` top bar page action **New** → `/m/orders/new` (title "New
  order"). `?scan=<value>` (the scan kernel's `returnTo=/m/orders/new` round trip,
  offered as "Scan an order number" on a pristine form) seeds the order number.
  The old phone form (`MobileOrderIntakeForm`, Ecwid-suggestion single-line
  capture) and `/api/orders/intake-suggestions` are deleted — its Ecwid lookup is
  now the Ecwid import mode, multi-line.

## The desk page (`src/components/orders/new/`)

`NewSalesOrderCheckout.tsx` — `w-[76rem]` centred column: breadcrumb trail
(`CheckoutBreadcrumbs`: Customer › Products › Team › Order › Shipping › Payment,
each crumb a jump, finished ones checked), ONE step on screen (all stay mounted,
so a half-typed search and a drilled category survive Back), Back · Continue bar
under it (sticky to the bottom edge below `lg`), cart + total sticky right.
Money reads green everywhere on the page (tile prices, cart price each, line
totals, subtotal, total, import-list amounts; the phone cart too).

1. **Customer** — autofocus "Find a customer"; picking one moves to Products.
2. **Products** (`CheckoutProductSearch.tsx`) — ONE triage shelf for sales
   items AND repair services, because a customer orders both on one call and
   both go on the one cart (operator 2026-09-27). **Clean split:** the counter's
   shelf (`ProductSelector`, `KIOSK_POS_*`) is the kiosk's alone; this page (and
   the phone) paint the TRIAGE shelf — `@/design-system/components/triage-shelf`
   (`triage-shelf-tokens.ts`, `TriageShelfTile`, `TriageShelfGrid`,
   `TriageShelfTrail`): the counter's tile recipe (square photo, two-line title,
   green price + SKU, availability, ×N pip) ported onto the task-mode utilities.
   Pinned as `TriageShelfTile`.
   - **Shelf switch**, trail top right: `TabSwitch` Sales · Repair service,
     each face counting its units on the cart; `Alt/⌥+R` flips it on this step.
     State is `shelf` / `setShelf` / `toggleShelf` in `useSalesOrderCheckout`.
   - **Data**: `useCatalogShelf(shelf)` (one instance per shelf, so each keeps
     its crumb / scope / page) over `/api/orders/intake/catalog/{ecwid-products,
     ecwid-categories,favorites}?shelf=sales|repair` (`orders.create`) —
     `src/lib/orders/intake/catalog-shelf.ts`: sales = `retail` segment +
     `sales` favorites + the retail category tree; repair = `service` segment
     (`…-RS` SKUs) + `repair` favorites + the repair category tree — the
     counter's own splits. Lands on the shelf's favorites (else All products).
   - **Find**: ONE field in the trail, inline with its glyph chip, autofocused
     whenever Products opens; it searches the shelf the switch is on — Sales:
     exact identity (`/api/orders/intake/products`), Repair service: the
     service catalog (`…ecwid-products?shelf=repair&q=`). ↑/↓ + Enter adds and
     the cursor stays; Esc returns to the grid where it was.
   - **Browse**: back chevron, `Favorites | All products › category` crumbs,
     category menu. A tile adds the **listing** (title, merchant SKU, price,
     its listing id as the item #) — never a SKU-guessed catalog product:
     storefront and catalog SKUs are separate namespaces that collide (listing
     231497901 "04 Mounting Screws", SKU 00162, is linked in
     `sku_platform_ids`/`platform_listings` to catalog 560 "Bose Soundlink
     Color" — a data problem to fix in pairing, not here). Same product again =
     qty +1; price pre-fills from the listing / `suggestedUnitCents`.
   - **Cart**: a repair line (`shelfOfSku` → `…-RS`) wears a "Repair service"
     tag, has no condition and no "Pair to a catalog product" (desk; phone tag).
3. **Team** (`CheckoutAssignments.tsx`) — per line Picker → Packer, defaulted from
   the listing→staff rule (`POST /api/orders/intake/assignees` →
   `previewListingAssignees` in `src/lib/automations/apply-listing-assignment.ts`,
   same matcher + out-today backup as the import automation). Changing a chip is a
   per-order exception ("changed"); a rule refresh never overwrites it. Written via
   `/api/orders/assign` (ORDER/PICK, ORDER/PACK) **after the held save and before
   release** — the floor never sees the order unassigned.
4. **Order** — channel defaults to Phone; order number self-generates; ship-by
   opens on **today** (the most urgent day, set in the hook's initial state) and
   moves on click. No "Ship by" title — the date is the face (the ledger's
   recipe), so the 2×2 grid lines up (desk; the phone keeps its label).
5. **Shipping** — `IntakeShippingFields`: bought elsewhere + tracking, **Buy
   with ShipStation** (no manual save first: "Open ShipStation" calls
   `onEnsureSaved` → the held draft is saved → `BuyLabelSection` mounts, then
   its own "Get shipping rates"), or **Pickup / walk-in** (the customer collects it at the counter:
   parcel + label UI hidden, no tracking, no ship-to — `shipToRequired()` is false
   and `intakeBlockers` asks for neither). The save body carries
   `fulfillment: 'pickup'` → `orders.fulfillment_channel = 'PICKUP'` (the column
   already holding Amazon `AFN`/`MFN` — "who moves it out"). A saved (caged)
   order switches with `triage.setPickup(ids, bool)` → cage-release
   `{ action: 'set-pickup', value }` (released rows and Amazon channels are never
   rewritten). Server-side, `evaluateReleaseGates` gets `pickup`: G1 stops asking
   for tracking and G3 passes on the handover; G2/G4 still gate. Downstream a
   pickup is on To ship without tracking (`sqlOrderInWarehouseToShip`), off the
   Labels queue, `PENDING` not `AWAITING_LABEL`, pick/pack not blocked on a
   label, and the order card reads "Pickup". Invoice import defaults to pickup
   when `SquareInvoiceImport.hasShipTo` is false.
6. **Payment** — `IntakePaymentFields` (shared with the desk form): Square link /
   Square invoice / Stripe link, filtered by `GET /api/orders/payments/methods`,
   plus **In person** (always offered; first and preselected when
   `shippingMode="pickup"`). "Take payment" saves the draft then copies the link.
   In person records a payment already taken at the counter —
   `POST /api/orders/payments { method: 'in_person', tender, cardBrand,
   cardLast4, entryMethod, reference }` → one `order_payments` row already
   `paid` (amount from the order rows; `created_by` = who took it). Tender is card
   on the reader / cash (amount handed over + change due, client-only) / other
   (check no. or Zelle confirmation required). An open link / invoice must be
   cancelled first ("Cancel request" on the status row). Imported invoices render
   `CheckoutInvoicePayment`: the Square status plus the card facts Square
   recorded (brand, last 4, entry method, auth code, Square receipt link —
   `GET /api/orders/intake/square-invoices/payment`); the link step stores the
   same facts on the invoice's `order_payments` row (no double charge).

   **PCI rule (binding):** CycleForge never accepts, stores, logs or transmits a
   card number, CVV/CVC, expiry, track data or PIN. Card intake = facts only:
   brand (closed list), last 4 (exactly 4 digits), entry method (tap / chip /
   swipe / keyed on the reader), authorization/reference code. Any payment field
   with a 13+ digit run (spaces / dashes / dots ignored) is refused with a 400
   and never echoed (`looksLikePan` in `src/lib/order-payments/tender.ts`); the
   table's CHECKs (`2026-09-27q_order_payments_in_person.sql`, **applied**)
   refuse it again. Square read-back drops expiry / BIN / fingerprint. The UI
   says never type the card number.

Keys: `Ctrl/⌘+S` draft, `Ctrl/⌘+Enter` release, `Alt/⌥+N` Continue, `Alt/⌥+B`
Back, `Alt/⌥+I` cycles New → Square invoice → Ecwid order. The crumbs' own
numbers are keys (`crumbFromKey`, `checkout-model.ts` + test): bare `1`–`6`
outside a text field (the views' grammar), `Alt/⌥+Shift+1`–`6` from inside
one — never `Alt`/`Ctrl`+digit alone (Chrome's tab keys, the chat's recents).
All trail keys listen in the capture phase, so an open combobox never eats
them. The header strip and the `?` sheet (`registerShortcutOverviewGroup`,
id `new-sales-order`) list them.

Cart condition is the To-ship ledger's own control (`LedgerCondition`: grade
tone chip, one triage selection list of `ToolbarListboxOption` rows) — the
hand-rolled `SearchableSelectField` over `conditionOptions` is gone. Pinned as
`outbound-orders-ledger-editors` (profile home added so `ds_contract` finds it).

**Test mode** (header switch; phone: "Test" beside the arrival switch; `?test=1`;
rides the tab in `sessionStorage`, so Next order and a reload keep it): the
order saves as `CF-TEST-<number>` — the screen shows the channel's number
(`PH-000002`) and `testOrderNumber` prefixes it at save; if that test number is
taken, `useOrderTriage.save` re-draws from the TEST sequence
(`nextOrderNumber(channel, { test: true })`; `/api/orders/intake/order-number`
accepts exactly `CF-TEST-<1–6>-`), never the real one. An invoice / Ecwid order already in CycleForge imports again
(`allowImported`), a Square invoice is never linked, no payment is requested
(the Payment step says so), and the documents gate is exempted
(`docsNotRequired`). Released, it lands on To ship **live**: `cage-release` →
`invalidateOrderViews` → Ably `order.changed` → the To ship tab's
`useRealtimeInvalidation` refetch (verified: a second tab on
`/shipping/orders` showed the row ~0.5–2 s after release, no reload).
Clean up with `DELETE /api/orders/<id>`, then the orphan `work_assignments`
(entity ORDER) and the `customers` rows the save created.

All keycaps render through `chordKeys()` + `useApplePlatform()`
(`src/lib/keyboard/chord-keys.ts`) — ⌘ ⌥ ⇧ on Apple, Ctrl Alt Shift elsewhere.
**Never hardcode a modifier glyph.** Handlers match `event.code` for Alt/⌥ chords
(⌥ letters type dead keys on macOS).

A call timer ("On this order m:ss") appears at the first keystroke only — no idle
placeholder — and the release confirmation reports total time.

## Square invoice import (`CheckoutSquareImport.tsx`)

`GET /api/orders/intake/square-invoices` (newest 50, DRAFT/CANCELED skipped,
`importedAs` marks ones already in CycleForge) → Enter fills customer, lines,
prices, `SQ-INV-<n>` → focus lands on Team. After save,
`POST /api/orders/intake/square-invoices/link` writes the `order_payments` row
(server re-reads the invoice; idempotent key `square-invoice-import:<id>`).
Domain: `src/lib/orders/square-invoice-import{,-core}.ts` (+ test).

## Ecwid order import (`CheckoutEcwidImport.tsx` · `MobileEcwidImportList`)

`GET /api/orders/intake/ecwid-orders?q=` → `searchEcwidOrderImports`
(`src/lib/orders/ecwid-order-import.ts` + test): the storefront sync's own mapper
(`mapEcwidOrdersToCanonicalLines`), so EVERY line (title, SKU, item # as the sync
writes it, qty, unit cents), buyer, ship-to, tracking and note come across.
`importedAs` marks an order number already in CycleForge. Import sets channel
`ecwid`, bought-elsewhere when tracking came with it, pickup when there is no
ship-to, and lands on Team.

## The phone page (`src/components/mobile/orders/new/`)

`MobileSalesOrderCheckout.tsx` over the same hook: arrival `TabSwitch` (New ·
Square invoice · Ecwid order), path chips for the trail, one step body
(`MobileCustomerStep`, `MobileProductsStep` — the same two shelves: a full-width
Sales · Repair service `TabSwitch` over the one find field, triage-shelf tiles,
breadcrumbs and category chips, `MobileTeamStep`, `MobileOrderStep`,
`MobileShippingStep`, `MobilePaymentStep` incl. in-person card facts), one sticky
`DetailDock` (Back · Continue; on Payment Back · Save draft · Release), what
still blocks release named above the dock, cart in `MobileCartSheet` behind the
top bar's page action (the item count).

**Mode: `triage` on the phone.** The order form is a FORM, not floor execution,
so it does not collapse to `industrial` on a phone: `mode-registry.ts` declares
`{ route: '/m/orders/new', mode: 'triage', form: true }` (and `/orders/new`), and
`resolveRegionMode(requested, device, { form })` keeps `triage` for a form region.
Section headings are sentence case (`MobileFormHeading`), not the industrial caps
band. Operations (`/m/orders`, `/m/scan`, pick, pack) stay `industrial`.

## Stripe order payments

Tenant Stripe credential only (`resolveOrderStripeCredentials` refuses the platform
billing key). Webhook: `/api/webhooks/stripe/orders`, events
`checkout.session.completed|async_payment_succeeded|async_payment_failed|expired`,
signing secret goes in the tenant's Stripe integration as `webhookSecret`.
Migration `2026-09-27b_order_payments_stripe.sql` is **applied** on the primary
Neon branch.

## Verified (live lane, 2026-09-27)

- Desk (first pass, before the triage shelf): Products grid = the counter's grid (Favorites → All products fallback,
  `All products › Bose Home Theater` crumb, back chevron); tile tap ×2 → one line
  qty 2 with item # = listing id; typing "bose 151" → identity tiles, ↓ Enter
  adds and the cursor stays; `Alt+N` moves the trail.
- Header: hover hangs the key card under the pill, right edges flush (pill right
  1398 = card right 1398 on 1440×900), lead "Press C then", rows `[S]`/`[I]`
  first (the `[E]` Ecwid row, present when this was verified, was removed 2026-09-27); click opens the anchored menu with the rows only, no header, no keys,
  hover card gone; `C` opens the card centred (720,446 on 1440×900).
- Desk, keyboard only (second pass, 2026-09-27): `Alt+Shift+2` from the customer
  field → Products with the trail find focused (glyph chip + field inline with
  "All products"); "bose 151" → 8 tiles, Enter adds, cursor stays, field clears;
  blurred `4` → Order, `Alt+B` → Team, blurred `1` → Customer; ship-by face
  "Sep 27" with no title; cart condition → the ledger list (NEW · L-NEW · REF ·
  A · B · C · PARTS), REF chip; prices green. Test mode: `CF-TEST-PH-000001`
  (pickup) released with `Ctrl+Enter` → on a second tab's `/shipping/orders`
  0.5 s later without reload ("Due today", Refurbished, $5.00); with it taken,
  the next test number read `CF-TEST-PH-000002`; the ShipStation button saved
  the draft and the rate-shop mounted (rates themselves 400 here — see the
  ShipStation caveat under Rules); that draft switched to Pickup and released →
  `CF-TEST-PH-000005` live on To ship in 2.4 s. Phone 390×844: Test switch +
  banner fit (no overflow); Ecwid rows already "In CycleForge" are enabled in
  test mode; importing #5088 + Save draft → "Draft CF-TEST-5088"; Payment shows
  the test note. All test orders, their `work_assignments` and the `customers`
  rows they created were deleted.
- Shelf (third pass, 2026-09-27): desk — Sales shelf 24 tiles (favorites), a
  tile tap added one; `Alt+R` → Repair service (6 favorites), focus stayed in
  the field; "wave" → 14 repair tiles, ↓ Enter added "…Multi-CD Changer REPAIR
  SERVICE" `00977-RS` $198 with the Repair service tag; switch read "Sales 1 ·
  Repair service 1", total $203.59 green. Ship-by opened on today with no call
  timer (the default is not a change). Phone 390×844 — same two shelves, one tap
  each, cart "2", both lines, repair tagged, no horizontal overflow.
- Phone (390×844, `/m/orders` → **New**): region `data-mode="triage"`; customer →
  grid tap/drill/find → Team → Order (`CF-TEST-…`) → Pickup → Payment; the PAN
  guard fired on "4111 1111 1111 1111" and disabled Record; **Save draft** wrote
  2 caged rows with `fulfillment_channel='PICKUP'`; gates showed only Documents
  failing (pickup skips G1/G3). Rows, payments and 2 orphan `work_assignments`
  deleted. Ecwid mode lists storefront orders; ones already synced show
  "In CycleForge · #" and are not importable (outside test mode).
- Unit: `checkout-model.test.ts` 4/4 (crumb keys, test numbers),
  `intake-model.test.ts` 4/4, `ecwid-order-import.test.ts` 3/3, `resolve-region-mode` + `mode-registry`
  10/10, `mobile-context-navigation` 3/3; boundary-guard: 39 crossings = baseline,
  no new, no stale.

## Rules for the next agent

- `:3050` writes to the **primary Neon branch with real USAV data**. Test orders:
  turn on **Test mode** (numbers `CF-TEST-…`, never a real number, no invoice
  link, no payment); release only test orders; clean up with
  `DELETE /api/orders/<id>` — that route leaves orphan `work_assignments`
  (delete them too), the `customers` rows the save created, and fake-tracking
  `shipping_tracking_numbers` rows.
- **ShipStation on this lane:** `POST /api/shipping/order-rates` answers 400 —
  the lane log reads "integration payload could not be decrypted with
  INTEGRATION_KMS_KEY — it was encrypted under a different key"; the UI says
  "ShipStation is not connected for this organization". Pre-existing lane /
  credential issue, not the intake path. The buy flow is verified up to that
  400; do not re-debug it. Outside production every purchase is a TEST label
  (`labelTestModeRequired`).
- `pnpm verify:fast` can flake "Design tokens" / "V1 OpenAPI" while other lanes
  write the tree; re-run `pnpm tokens:check` and `pnpm verify:v1:openapi`
  directly before calling them red (both passed standalone on 2026-09-27).
- Never read the invoice list into a real save during tests — linking marks a real
  Square invoice as imported.
- Unrelated in-flight work in this worktree (e.g. `MorphingRowActionMenu`,
  `OrderCardList`, `src/lib/auth/pin.ts` — all failing `tsc` right now, not this
  lane) can break the dev bundle; don't edit files you don't own.
- The dev lane is shared and Fast-Refreshes constantly. A browser tab that has
  lived through many rebuilds can stop hydrating (no `__react*` keys on nodes,
  clicks dead, no errors). Open a FRESH managed tab
  (`browser.open({ app: { relay: false } })`) before debugging a "dead" control.
  Sign in with `tests/shot.mjs`'s pattern (`/api/auth/staff-picker` +
  `/api/auth/signin`, header `x-tenant-slug: usav`).
- Generated audits: `pnpm audit-route-auth:emit` rebuilds
  `docs/security/route-permissions.json` from source (it also picks up other
  lanes' routes, e.g. `cron/sessions-sweep`). Do NOT blanket-regenerate
  `docs/tenancy/*.generated.*` — that surfaces other lanes' in-flight
  violations; edit out only your own changed routes.
- Done = `pnpm verify:fast` (only the other lanes' `tsc` errors above may
  remain red) + a keyboard-only desk run AND a 390×844 phone run of the changed
  path.

## Open items

1. ~~Pickup / walk-in fulfilment is not modelled~~ — **resolved**: `pickup`
   shipping mode + `orders.fulfillment_channel = 'PICKUP'` + release-gate branch
   (G1/G3) + in-person tender with card facts; see Shipping and Payment above.
   Still open: the pack station's capture upsert is shipment-keyed
   (`packer-log-writer.ts`), so a pickup's pack is recorded order-grain only; the
   mobile To-ship row does not read the pickup flag yet; a Square invoice paid
   AFTER it was linked gets no card facts (the webhook path does not read them).
2. Stripe refunds (`charge.refunded`) are not mapped back to the order.
3. `DELETE /api/orders/[id]` should remove the order's `work_assignments`.
4. The desk's old inline `?triage=new` entry still works but nothing links to it —
   remove it or redirect to `/orders/new`.
5. `resolveSquareConfig` falls back to the env Square account, so every org reports
   Square as available (pre-existing money-routing behaviour).
6. Phone label purchase (Buy with ShipStation) is desk-only — `BuyLabelSection`
   is a desk component; the phone Shipping step says so. Needs a mobile face.
7. ~~Editing the cart after Save draft does not update the saved rows~~ —
   **resolved** (parity pass, `set-line`). Still open: adding or removing a
   line after the draft save (the draft's row set is fixed; refused in the UI).
8. `SURFACE_LAW.md` §7 still names the deleted `mobile-sheet-roles.ts` gate
   (removed in 270795058).
9. The staff catalog routes (`/api/orders/intake/catalog/*`,
   `/api/orders/intake/ecwid-orders`) are not yet in the generated tenancy
   audit; when it is next regenerated, `ecwid-categories` and `favorites` flag
   as touching `orders` (false positive from the path/permission name) — add
   `helper-safe-delegation` rows in `scripts/tenancy-guard-exemptions.ts`
   (helpers run through `tenantQuery`).
10. ~~`ProductSelector.tsx:766` `isSelected` is unused~~ — the intake no longer
    mounts `ProductSelector`; its dead `hideBrowseSearch` prop was removed. The
    unused `isSelected` is the counter's to clean up.
11. **Repair services on a sales order — downstream is undecided.** A repair
    line (`…-RS` listing) saves as an ordinary `orders` row and, once
    released, sits on To ship / pick / pack like a product. The operator wants
    both on one cart; whether a repair line should instead open a repair
    ticket (`repair_service`) or be excluded from pick/pack is a product call —
    ask before building it. Today the cart only tags it and drops condition /
    catalog pairing.
12. The phone Order step keeps its "Ship by" label (the desk dropped it); the
    stacked phone form would show a bare date otherwise. Operator to confirm.
