# HANDOFF — Square Keypad face + cart card quantity fix

**Written** 2026-09-24. **Surface:** the counter tablet at `/kiosk/v2`.
It follows `kiosk-square-cart-HANDOFF.md` (W0–W5 are built and uncommitted).
Read §0 and §1 first. Then do §2 **in order**.

Operator ask, verbatim: *"the quantity button is displaying twice the quantity
should not be green for each line item the quantity is green it should be black
or gray to match the subtitle the keypad custom price should look exactly like
square a square copy word per word so it will not have the progress bar it
would display the cart on the side on the right side it would be the keypad on
the left side and automatically adding to the cart display on the right side so
two columns exactly like square no progress bar with a pay button bottom right"*

---

## 0. Rules

- **Origin:** `http://localhost:3050` only. If the lane is down, run
  `systemctl --user start cycleforge-lane@prod`. Never bind another port.
- **Never submit a real cart.** A submit writes permanent rows.
  `counter_transactions` is **0** and `repair_service` is **85**; leave them
  that way. You can prove everything here on the in-memory cart.
- **Clear every probe cart:** press `Clear cart`, then confirm. If the customer
  face (Verify) has already shown the line, clearing asks for a void reason and
  a PIN. Avoid Verify in probes.
- **Stubbing the PIN in headless probes:** `tab.route` both
  `**/api/kiosk/staff-for-stepup*` (answer one staff row) and
  `**/api/kiosk/price-approval` (answer `{approval, staffId, expiresAt}`).
  The PIN pad only renders after you click the row labelled
  `Continue as <name>, <role>`.
- **Done means** `pnpm verify:fast` is green, plus a headless screenshot of each
  new state. Recipe: `kiosk-square-cart-HANDOFF.md` §5. Screenshots come back
  at 800×457, so measure with `getBoundingClientRect`.
- **Tests:** only for pure logic, never for UI source text.

## 1. Current state (verified 2026-09-24; do not re-derive)

| Fact | Where |
|---|---|
| **Custom amount** is a `kind: 'staff'` tool in the top-left command menu, between Sales and History. It is not a catalog tile. | `lib/kiosk/services.ts` (`'custom-amount'`); `KioskShell.tsx` (`customAmountOpen`, `handleCommandSwitch`) |
| The keypad face today is `KioskCustomAmountPane`: a `KioskPaneForm` **with a progress band**, then the steps Amount → Description → **Add**, then a PIN (`walk_in.adjust_price`) before the line lands. | `components/kiosk/KioskCustomAmountPane.tsx` |
| The keypad component: a big amount, then 12 keys (`1-9`, `00`, `0`, `⌫`). Typing fills from the right. A ref guards against batched taps. | `components/kiosk/KioskAmountKeypad.tsx`; math in `lib/kiosk/keypad.ts` (+ test) |
| A custom line is a `RETAIL` line with payload `{variationId:null, sku:'', custom:true, priceAdjustment:{kind:'custom', approval,…}}`. In Repair it is a `REPAIR` line with `custom:true`. | `KioskCustomAmountPane.add` |
| **Submit refuses a positive ad-hoc sale line that has no signed approval** (403 `PRICE_APPROVAL`). | `lib/kiosk/price-approval.ts` `verifyLinePrices`; `app/api/kiosk/intake/route.ts` |
| The sale card's bottom row reads `[Sale][SKU…]  −  N  +  N · $total`. **N prints twice**, and both copies wear `text-text-success` (green). | `components/kiosk/KioskCartLineCard.tsx` (stepper `<span data-testid="kiosk-cart-line-qty">` and `kiosk-cart-line-amount`) |
| The cart itself is `KioskCartLedger`: a 3-step `KioskPaneForm` (Cart → Customer → Pay). Its Pay key is `Pay $X`, which opens the payment PIN (`KioskPaymentStepUpSheet`). | `app/kiosk/v2/KioskCartLedger.tsx` |
| The cart header row reads `Cart ……… N · $total` (green). The operator did not ask to change it. | `KioskCartLedger` `kiosk-cart-summary` |

## 2. Work, in order

### K1: Card quantity shows once and is not green

- **Target:** `KioskCartLineCard.tsx`. Also `cart-card-view.ts` only if the
  view model has to change.
- **Change:**
  1. When the stepper renders, the right edge shows **only the line total**
     (`$11.18`). The stepper's own `N` is the quantity. Lines with no stepper
     (repair, trade-in, the read-only customer face) keep `N · $total`,
     because they have no other quantity.
  2. The quantity ink matches the subtitle, `text-text-soft` (the
     `KIOSK_META` family), everywhere it appears: the stepper number and the
     `N ·` prefix. **Only the money stays `text-text-success`.** Split the
     `N · $total` span so each part carries its own ink.
  3. Update the Law 3 wording in `kiosk-square-cart-HANDOFF.md` §1 to say:
     money is green; the quantity is neutral.
- **Acceptance:** a sale card with qty 2 of $5.59 shows `−  2  +` in gray, then
  `$11.18` in green, and no second `2`. A repair card still reads `1 · $149.00`,
  with the `1` gray.
- **Verify:** headless. Take one screenshot of a sale card and one of a repair
  card. Read the computed `color` of the qty and amount nodes.

### K2: Square Keypad face, two columns, no progress bar

**Reference (Square Support, "Process custom sale amounts", quoted word for word):**
> 2. Tap **Keypad** and enter a custom amount. To add multiple custom amounts,
>    you can also tap the **(+)** icon to add a separate custom amount to the sale.
> 3. From the Current sale screen, tap **Custom Amount** to adjust the
>    quantity, taxes, discounts, or notes to an existing custom amount. You can
>    also Comp Item or Remove Item from this screen.
> 4. Tap **Charge** to complete the transaction.

Use these words **exactly**: `Keypad`, `Custom Amount` (capital A, as the line
title with no description), `Current sale`, `Charge`, `Comp Item`,
`Remove Item`, and the `+` key.
[INFERENCE] The iPad layout is the keypad on the left and the Current sale list
on the right, with a full-width Charge key at the bottom right. That matches
the operator's description. Square's article has no screenshot, so do not
invent any other copy.

- **Target:** replace `KioskCustomAmountPane` with a new
  `components/kiosk/KioskKeypadFace.tsx`. Update the mount and the
  `onCustomAmountAdded` handling in `KioskShell.tsx`. The rename of the menu
  label from `Custom amount` to `Keypad` happens in `services.ts`
  (`commandLabel`, keep id `'custom-amount'`).
- **Layout (landscape tablet):**
  - **No `StepProgressHeader`, no progress band, no Description step.** The
    shell's one header band (the command menu, which reads `Keypad`) stays
    above the face (Law 1 of the earlier handoff).
  - **Left column:** the amount display plus `KioskAmountKeypad`. The key grid
    gets a `+` key. Square's pad is `1-9`, `C` (clear), `0`, `+`. Switch
    `KEYPAD_KEYS` to that set if it matches Square more closely, update
    `keypad.test.ts`, and drop `00` and `⌫` only if you do. An optional
    one-line **Add note** field sits above the keys. The note becomes the
    line's `note`; its title stays `Custom Amount`.
  - **Right column (`Current sale`):** the live cart. Reuse `KioskCartLineCard`
    for each line in `session.lines`, with stepper, remove and editor, so a tap
    opens the same editor (Comp and Remove are already there). The header row
    reads `Current sale` with the total on the right. Pinned bottom right: a
    full-width `Charge $X.XX` key.
- **Behaviour:**
  1. **`+` commits the typed amount** as a new line on the right and resets the
     display to `$0.00` (Square's "add a separate custom amount").
     **`Charge` commits any pending non-zero amount first,** then goes to
     payment. "Automatically adding to the cart" means each `+` or `Charge` adds
     the line **without a modal and without a Description step**.
  2. **Charge** hands off to the existing checkout. Open the cart ledger
     (`setUtilitySlot('cart')`) on its Customer step, or on Pay if a customer
     is already set. Do not build a second payment path. `submitKioskVisit` and
     `KioskPaymentStepUpSheet` stay the only way money moves.
  3. **Mode.** In Sales the `+` adds a `RETAIL` custom line. In Repair a keypad
     line needs a device name, so in Repair the Add-note field is **required**
     and becomes `productModel`. The repair stepper (serial, reasons,
     signature) still runs from Charge. Keep this behaviour, but do not add
     new copy for it beyond a placeholder.
- **⚠ Decision to ask the operator before building (use `ask`):** a positive
  keypad line currently needs a `walk_in.adjust_price` PIN, and **submit
  refuses one without an approval**. A PIN on every `+` breaks "automatically
  adding". Options:
  - **(a)** No PIN per line. One PIN at **Charge** approves every keypad line
    in the cart. That means one call to `/api/kiosk/price-approval` per line,
    or a new batch approval. Recommended.
  - **(b)** A per-device "keypad unlocked" window after one PIN (Square gates
    this by staff permission, which a shared tablet lacks).
  - **(c)** Drop the gate for custom amounts. That changes `verifyLinePrices`
    (`A custom amount needs a manager PIN.`) and weakens W2/W3.

  Whatever is chosen, `verifyLinePrices` must still reject a catalog price
  changed without approval.
- **Acceptance:**
  - The menu shows `Keypad`, with no progress bar anywhere on the face.
  - Typing `1 2 5 0 +` adds a `Custom Amount · Custom · $12.50` card on the
    right at once, and the left display resets to `$0.00`.
  - Typing `5 0 0` then `Charge $17.50` commits the second line, then opens
    checkout.
  - Removing a line on the right updates `Charge $X` live.
  - The two columns hold at 1366×1024 and at 1024×768.
- **Verify:** headless. Screenshot the empty face, the face after two `+`
  presses, and the checkout after Charge. **Stop before submit.** Then run
  `pnpm verify:fast`.

## 3. Out of scope

- The cart ledger's own layout, and its `N · $total` header.
- Taxes and discounts on a keypad line. The Square article lists them, but this
  repo has no tax or discount model yet (earlier handoff W6).
- Any change to Square staging (`buildStageOrderBody`). Custom lines already
  stage ad-hoc at their own price.

## 4. Status (2026-09-24)

K1 and K2 are built and verified headless at `:3050`. Operator rulings made
while building, which supersede §2 where they differ:

- **Gate: option (c).** No PIN for a keypad line; `verifyLinePrices` accepts a
  positive ad-hoc sale line unapproved. A catalog price changed without
  approval is still refused. Contract test: `lib/kiosk/keypad-line.test.ts`.
- **No note field above the pad.** Every keypad line lands as `Custom Amount`
  (Repair too, as its `productModel`); a note is added from the line editor.
- **Quantity is black, only the price is green** — cards and the cart header.
- **The pad is a bounded block** (`KioskAmountKeypad slab`, `max-w-sm`), square
  corners, no gap between keys; every key, `+` included, has the same flat face.
- **Charge spans the Current sale column.**
