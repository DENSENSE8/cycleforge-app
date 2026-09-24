# HANDOFF — Square-grade cart on the counter kiosk

**Written** 2026-09-23. **Surface:** the counter tablet at `/kiosk/v2`. That
means the Sales and Repair catalog (`ProductSelector` in `kiosk-split` layout),
the Cart (`KioskCartLedger` + `KioskCartLineCard` + `KioskCartLineEditor`), and
the submit path through `POST /api/kiosk/intake` → `submitCounterTransaction`
→ Square staged order.

This is a pickup prompt. Read §0 and §1, then work §3 **in order**. §2 is
verified ground truth; do not re-derive it.

Operator ask, verbatim: *"Remove the item ID and I should be able to easily be
able to plus and minus the line items within the card just like square. I
should be able to have a custom price exactly like Square throughout this entire
triage system."*

---

## 0. Before you touch anything

- **`http://localhost:3050` is the only origin.** Lane down (`503` +
  `x-switch-error`) → `systemctl --user start cycleforge-lane@prod`. Never bind
  another port, never hand-start `next dev`.
- **There is no Playwright suite.** To verify, use headless Chromium (recipe
  in §5), throwaway `tsx` probes, and `psql`.
- **A real checkout writes permanent rows.** `POST /api/kiosk/intake` writes
  `audit_logs`, which refuses `DELETE`, plus `counter_transactions`,
  `repair_service`, `customers`, and a Square staged order.
  **Ask the operator before submitting a real cart.** Everything in §3 can be
  proven on the local cart (the session store is in memory) plus unit tests of
  the pure mappers. `counter_transactions` is **0** and `repair_service` is
  **85** — leave them that way.
- **Clear every probe cart:** press `Clear cart` → `Clear 1 item`.
- **`pnpm verify:fast`** must be green before you call anything done. Skills:
  `db-migration-author` for any column, `new-route` for any route.

## 1. Laws this surface already obeys — do not regress them

1. **One header band.** Mode dropdown, then the search glyph, then the filter
   on the left; stance, paperwork and cart on the right (`KioskTopChrome`).
   A pane never paints a second titled band. Multi-field flows are
   `KioskPaneForm` steppers: X top-left, segmented progress, one big CTA.
   `kiosk-pane-frame.test.ts` guards this.
2. **No modals over the work.** Confirmations swap the pane's footer — see
   `Clear cart` → `Keep items` / `Clear N items` in `KioskCartLedger`.
3. **Money in a list sits bottom-right, green (`text-text-success`); the
   quantity is black (`text-text-default`).** Only the price is green. A line
   with no stepper reads `qty · amount` (qty black, amount green); a sale
   line's `−  N  +` stepper IS its quantity, so its right edge reads the amount
   alone. No "item/line" word. The cart header row reads `Cart ……… N · $total`,
   `N ·` black and `$total` green.
   Grid tiles keep price bottom-left, under the name.
4. **Vocabulary.** The mode is **Sales** (`services.ts` `commandLabel`) and a
   sale line chip reads **Sale**. `BUYBACK` lines display as **Trade-in**. The
   container is **Cart**, never "ticket": "ticket" already means the RS repair
   ticket and the support ticket.
5. **Chips are `KioskChip`,** never the desk `badge`. Identifier chips carry a
   label: `SKU …`, `SN …`, `IMEI …` (`cart-card-view.ts` → `CartLineId`).
6. **Repair lines are one device each** (`repair_service` = one row per
   device). They never get a quantity.

## 2. Verified ground truth (2026-09-23)

| Fact | Evidence |
|---|---|
| A retail cart line's `variationId` is the **Ecwid** listing id, not a Square id. | `catalog-search.ts:71` `PROJECTION_PLATFORM = 'ecwid'`; `:322` selects `external_ref_id` as the product `id`; `KioskShell` passes it as `payload.variationId`. |
| The Square staged order sends any line with a `variationId` as `{ catalog_object_id }` **only**, so Square charges its catalog price. Lines without one go ad-hoc: `{ name, quantity, base_price_money }`. | `submit-counter-transaction.ts:249-267` `buildStageOrderBody`. |
| ⇒ **[INFERENCE, verify first]** Kiosk retail lines are staged under an Ecwid id Square cannot resolve. Any price typed on the tablet for a catalog line would be ignored at the card reader. | Follows from the two rows above; no retail visit has ever been submitted (`counter_transactions` = 0). |
| The tablet's line editor edits price and quantity **ungated**: no permission, no PIN, no audit, and the original price is not kept. | `KioskCartLineEditor.tsx` (`Price ($)` / `Qty` `TextField`s → `actions.updateLine`). |
| The **desk** already has a gated override: `POST /api/counter/session/{id}/lines/{lineUuid}/price`. It uses `walk_in.take_payment` plus `stepUp`, and audits before/after as `AUDIT_ACTION.COUNTER_LINE_PRICE_OVERRIDE`. | `app/api/counter/session/[id]/lines/[lineUuid]/price/route.ts`. |
| The desk void carries a reason (`void_reason`, `voided_by_staff_id`), audited as `COUNTER_LINE_VOID`. The tablet's swipe-remove and `Clear cart` record nothing. | `session-store.ts:774` `voidLine`; `counter_session_lines` columns. |
| The PIN step-up UI already exists (`KioskPaymentStepUpSheet`). `/api/kiosk/intake` accepts `staffId` + `pin`, and derives the required permission per action. | `KioskCartLedger.tsx:503`; `app/api/kiosk/intake/route.ts:148-167`. |
| `counter_transaction_lines` columns: `line_type, title, sku, variation_id, quantity, unit_amount_cents, sort_index`. **No original price, no reason, no note.** `counter_session_lines` has `payload jsonb`. | `information_schema` query. |
| In Sales, tapping a selected tile **deselects** it (picker semantics). A cart line is added once per product id and never incremented. | `ProductSelector.tsx:828` `toggleProduct`; `KioskShell` retail sync effect (adds only if `variationId` not already present). |
| The `Item ID` chip is that Ecwid id. | `cart-card-view.ts` `cartLineIdentifiers` → `id('Item ID', p.variationId)`. |

## 3. Work, in order

Each item: **Target** (files), **Change**, **Acceptance**, **Verify**. Do not
start an item until the one above it is green.

### W0 — Make the Square staging identity honest (prerequisite for all pricing)

- **Target:** `src/lib/counter/submit-counter-transaction.ts`
  (`buildStageOrderBody`), `src/lib/kiosk/cart-to-counter.ts`, and
  `submit-counter-transaction.test.ts`.
- **Change:**
  1. Confirm whether this org's Square catalog carries the Ecwid ids. Check
     `platform_listings` for a Square platform row, and any Square catalog
     mapping table. `grep` for `square` in `src/lib/integrations` / catalog
     sync.
  2. If no Square variation id is available, a kiosk retail line must stage
     **ad-hoc**: `name` + `base_price_money` = the line's actual
     `unitAmountCents`. Keep the Ecwid id on the transaction line
     (`counter_transaction_lines.variation_id`) for reporting, but never send
     it as `catalog_object_id`.
  3. If a real mapping exists, send `catalog_object_id` **and**
     `base_price_money` only when the price was adjusted. Before relying on
     that, confirm against Square's docs or sandbox that Square honours
     `base_price_money` on a catalog line; the only source seen so far is a
     developer-forum answer. The fallback in step 2 is always safe.
- **Acceptance:** a unit test proves that a kiosk retail line with an Ecwid id
  and an edited price stages at the edited price. No request carries an Ecwid
  id as `catalog_object_id`.
- **Verify:** `node --import tsx --test src/lib/counter/submit-counter-transaction.test.ts`.
  **No real submit.**

### W1 — Card: remove Item ID, add −/+, make a repeat tap add one

- **Target:** `cart-card-view.ts`, `KioskCartLineCard.tsx`,
  `KioskCartLedger.tsx`, `KioskShell.tsx` (retail sync effect), and
  `ProductSelector.tsx` (kiosk-split tap in Sales).
- **Change:**
  1. `cartLineIdentifiers`: a sale line returns `{ primary: SKU, secondary: null }`.
     Delete the `Item ID` label.
  2. **Sale lines:** add an inline stepper on the card's bottom row,
     `−  N  +`, left of `qty · amount`. Tapping the stepper must not open the
     editor (stop propagation), and each control keeps a 44px touch target.
     Repair and trade-in lines get no stepper (Law 6; a trade-in is one IMEI).
  3. **`−` at 1:** swap the card's bottom row to `Keep` / `Remove` in place
     (Law 2), then `actions.removeLine`. Swipe-to-remove stays.
  4. **Repeat tap adds one (Square "Consolidate identical items"):** in
     **Sales**, tapping a tile whose product is already a cart line increments
     that line's quantity instead of deselecting. The tile shows the count,
     e.g. a `×2` corner dot in place of the check. Repair keeps its current
     toggle: a device is picked, not counted.
  5. Mirrored (desk-held) sessions: `−`/`+` go through `sharedWriter.updateLine`,
     as `updateLine` already does. Removal on a mirror is a void, which is
     refused for the tablet, so hide `Remove` when `sharedSessionId !== null`.
     This matches the `Ask staff to remove this line` rule in
     `KioskCartLineEditor`.
- **Acceptance:** the card shows `Sale · SKU 00162` and `− 2 +` then `2 · $8.56`.
  `−` at 1 asks before removing. Tapping a Sales tile twice leaves one line at
  quantity 2. No `Item ID` anywhere.
- **Verify:** headless (§5). Add a Sales item twice, open Cart, step −/+,
  remove, and screenshot each state. Then add unit tests for the pure pieces
  (quantity clamp, remove-at-zero decision) if they are extracted.

### W2 — Custom amount (Square "Keypad"), in Sales and Repair

- **Target:** `ProductSelector.tsx` (a tile beside **Add favorite**, the same
  `KIOSK_POS_CARD` rectangle), a new keypad pane under
  `src/components/kiosk/`, `kiosk-session-store.ts`, `cart-line.ts`, and
  `cart-to-counter.ts`.
- **Change:**
  1. A **Custom amount** tile shows in every scope of the catalog grid, in both
     Sales and Repair. Put it first, since a keypad is a primary verb in Square.
     It opens a `KioskPaneForm` stepper: **Amount** (a big numeric keypad, cents
     entry like Square: typing `1`,`2`,`5`,`0` reads `$12.50`) → **Description**
     (optional, one field).
  2. **Sales:** adds a `RETAIL` line with `payload { variationId: null, sku: null, custom: true }`
     and title = description or `Custom amount`. It stages ad-hoc by
     construction (W0).
  3. **Repair:** adds a `REPAIR` line with `productModel` = description (required
     in Repair: a repair needs a device name) and `price` = the amount. The
     existing repair stepper then collects serial, reasons and signature
     exactly as for a catalog pick.
  4. The card chip for a custom line reads `Custom` (a `KioskChip` meta chip),
     so the counter can tell it from a catalog line.
  5. Permission: Square gates "manually enter custom amounts". Use the §3 W3
     permission; a custom amount is a price the catalog did not set.
- **Acceptance:** from either mode, `Custom amount` → `$12.50` → `Cable repair`
  → Add shows a cart line `Custom · 1 · $12.50`. Nothing outside the one header
  band.
- **Verify:** headless; screenshot the keypad and the resulting card.

### W3 — Price adjustment on a line (Square "Price adjustment" toggle)

- **Target:** `KioskCartLineEditor.tsx`, `cart-line.ts` (payload fields),
  `KioskCartLineCard.tsx`, `permission-registry.ts` (plus the
  route-permission manifest test, per `new-route`), a kiosk-side gated action,
  and a migration.
- **Change:**
  1. **Permission:** register `walk_in.adjust_price` ("Adjust a line price at
     the counter"). The desk override route should move from
     `walk_in.take_payment` to it. Taking payment and changing a price are
     different risks.
  2. **Editor:** replace the raw `Price ($)` field with a **Price adjustment**
     switch. When on, show the keypad (reused from W2) and a **Reason** chip row
     with presets (`Price match`, `Damaged box`, `Goodwill`, `Re-quote`) plus
     free text. Saving requires the PIN step-up (`KioskPaymentStepUpSheet`,
     permission `walk_in.adjust_price`). Switching it off restores the catalog
     price, no PIN needed.
  3. **Payload:** `originalUnitAmountCents`, `adjustReason`, `adjustedByStaffId`.
     The **card** shows the original struck through beside the new amount:
     `~~$5.59~~ 1 · $4.00`.
  4. **Persist:** migration (`db-migration-author`, idempotent, tenant-scoped)
     adding `original_unit_amount_cents integer NULL` and `price_adjust_reason text NULL`
     to `counter_transaction_lines`. `submitCounterTransaction` writes them.
     Repairs: the adjusted quote is `repair_service.price`, with before/after in
     the audit.
  5. **Audit:** `COUNTER_LINE_PRICE_OVERRIDE` with before/after/reason/staff,
     written by the intake route on submit for every adjusted line. The tablet
     has no server session to audit against mid-cart.
  6. **History:** `KioskHistoryDetail` item lines show `Adjusted from $5.59 · Price match`.
- **Acceptance:** an adjusted line cannot be saved without a valid PIN from a
  holder of `walk_in.adjust_price`. The original price survives into the
  transaction line and History. Square stages the adjusted amount (W0).
- **Verify:** headless flow up to (not including) submit. Add unit tests for the
  mapper: an adjusted line → transaction line carries both prices, and the
  stage body carries the adjusted amount.

### W4 — Item note

- **Target:** `KioskCartLineEditor.tsx`, `cart-line.ts`, `cart-to-counter.ts`,
  `buildStageOrderBody` (Square `OrderLineItem.note`, max 2000), a migration
  (`counter_transaction_lines.note text NULL`), `visit-receipt-html.ts`, and
  `KioskHistoryDetail`.
- **Acceptance:** a note typed on a line appears on the printed receipt, in the
  staged Square order, and on the History record.

### W5 — Comp and void with reasons

- **Target:** an org-configurable reason list (`OrgSettings.kiosk`, edited in
  `OrganizationSection`), the line editor, the `Clear cart` confirm floor, and
  `submitCounterTransaction`.
- **Change:**
  - **Comp** keeps the line on the bill at $0 with a reason. It shows on the
    receipt, like Square's comped item.
  - **Void** removes the line with a reason. It never prints, but it is
    recorded: Clear cart and remove-at-zero on a line the customer has already
    seen should ask for a reason.
  - Both are gated by the W3 permission plus a PIN, and audited
    (`COUNTER_LINE_VOID` exists; add `COUNTER_LINE_COMP`).
- **Acceptance:** a comped line reads `Comp · Goodwill · 1 · $0.00`. The History
  audit trail lists comps and voids with staff and reason. That needs
  `read-visit.ts` `findAuditTrail` to also read kiosk-intake rows, which is
  known broken; see `kiosk-history-search-ux-HANDOFF.md` §3.12 item 3.

### W6 — Later, in ROI order (each needs its own plan before code)

1. **Discounts:** line and cart; `%` or `$`; preset or custom; "restricted"
   presets need the permission. Stage as Square line/order discounts.
2. **Saved carts (hold/resume):** name a cart after the customer, park it, and
   resume it. `counter_sessions` is the natural store; 49 are stuck `open`
   since Sep 11 and need a cleanup policy first.
3. **Split tender:** cash plus Terminal; the remaining balance shows between
   tenders.
4. **Returns and exchanges from History:** pick lines, restock or not, and
   refund or charge the difference.

## 4. Decisions already made — do not reopen

- **Custom price is a line capability in every mode, not a mode.** Square has no
  "custom price mode": it has Keypad, variable-price items, and per-line Price
  adjustment, each available everywhere.
- **Sale lines get an inline stepper on the card.** Square hides it inside item
  details; on a counter iPad the extra screen is the cost we are removing.
- **Confirmations are footer or row swaps, never modals** (Law 2).
- **Tests prove behavior of pure mappers** (`cart-card-view`, `cart-to-counter`,
  `buildStageOrderBody`, money math). Do not add source-text tests for new UI.
  Extend the existing law guards only where §1 names them.

## 5. Verification recipe (headless, no real submit)

```js
const tab = await browser.open({
  name: "k", url: "http://localhost:3050/kiosk/v2",
  viewport: { width: 1366, height: 1024 },
  app: { path: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-gpu", "--headless=new"] },
  timeout: 120000,
});
await tab.evaluate(`fetch('/api/kiosk/dev-autopair',{method:'POST'}).then(r=>r.status)`);
await tab.reload();
// Mode: click the combobox first, then the option.
await tab.click('role/combobox[name="Kiosk command"]');
await tab.click('role/option[name="Sales"]');
await tab.click('[data-testid="product-tile"]');          // add
await tab.click('role/button[name="Cart"]');               // open cart
// … exercise, screenshot …
await tab.click('[data-testid="kiosk-cart-void-all"]');    // clean up
await tab.click('[data-testid="kiosk-cart-void-confirm"]');
await browser.close({ all: true, kill: true });            // never leave a stale Chromium
```

- If `browser.open` times out attaching to CDP, a Chromium from a previous
  session still holds the profile. Find it with
  `pgrep -af 'chromium.*headless'`, confirm `--user-data-dir=~/.omp/browser-profiles/…`
  in `/proc/<pid>/cmdline`, and kill only that PID.
- Screenshots come back at 800×457 regardless of the viewport option. Measure
  with `getBoundingClientRect` rather than eyeballing.

## 6. Square references

- Custom amounts (Keypad, `+` for another, tap the line for qty/tax/discount/note/comp/remove): <https://squareup.com/help/us/en/article/5429-process-custom-sale-amounts>
- Cart: −/+ quantity, qty 0 → Remove → confirm, swipe to trash, Price adjustment toggle (off = revert), item note, Clear Cart, saved carts: <https://squareup.com/help/us/en/article/8238-build-your-customer-s-cart-in-the-square-retail-pos-app>
- Consolidate identical items: <https://squareup.com/help/us/en/article/8674-manage-cart-display-settings-on-square-point-of-sale>
- Comp and void with reasons: <https://squareup.com/help/us/en/article/5814-get-started-with-comp-and-void>
- Permission sets (including manually entering custom amounts): <https://squareup.com/help/us/en/article/5822-employee-permissions>
- Split tender: <https://squareup.com/help/us/en/article/5097-process-split-tender-payments-with-square>
- Refunds: <https://squareup.com/help/us/en/article/6116-process-refunds>
- Orders API `OrderLineItem` (`base_price_money` per unit, `note` ≤ 2000, custom-amount `item_type`): <https://developer.squareup.com/reference/square/objects/OrderLineItem>
