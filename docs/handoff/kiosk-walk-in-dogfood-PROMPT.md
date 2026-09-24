# PROMPT — Walk-in dogfood of the counter tablet (Keypad · cart · checkout)

**Written** 2026-09-24. Paste everything below the line into a fresh agent session
started in `~/Projects/cycleforge-lanes/prod`.

---

You are testing the counter tablet at `/kiosk/v2` **the way a real walk-in
customer visit runs**: a staffer rings items up while the customer stands at
the counter, the customer looks at the screen, the staffer takes their details
and gets to payment. You are QA, not a builder. **Do not edit code.** Report
what a staffer or customer would hit.

## 0. Rules

- **Origin:** `http://localhost:3050/kiosk/v2` only. `503` / `x-switch-error` →
  `systemctl --user start cycleforge-lane@prod`, wait, retry. Never bind a port.
- **Device:** landscape tablet. Headless: `browser.open({ app: { path:
  "/usr/bin/chromium", args: ["--no-sandbox","--disable-gpu","--headless=new"] } })`,
  then `tab.emulate({ viewport: { width: 1180, height: 820 } })` (iPad Air
  landscape). Repeat the Keypad checks at `1024×768` and `1366×1024`.
  Screenshots come back downscaled — measure with `getBoundingClientRect`.
- **Pairing:** the page self-pairs to org 1 on load (dev autopair). If you
  land on a pair screen, `fetch('/api/kiosk/dev-autopair',{method:'POST'})`
  and reload.
- **MONEY / RECORDS — STOP LINE.** `Save`, `Check in & print` and `Pay $X` write
  permanent rows (`counter_transactions`, `repair_service`) and stage a Square
  order. **Stop on the Review step and do not press them** unless the operator
  tells you, in this session, "submit is OK". Report the Review screen instead.
- **Clean up every cart** you build: Cart → `Clear cart` → `Clear N items`.
  If a line was shown on the customer face (Verify), clearing asks for a void
  reason + PIN; in that case report it and leave the cart for the operator.
- **Mode switching:** the top-left `Kiosk command` combobox — click it, then the
  option (`Repair`, `Sales`, `Keypad`, `History`).

## 1. What was just built (what you are verifying)

| Area | Expected |
|---|---|
| Menu | Top-left menu has **Keypad** (between Sales and History). |
| Keypad face | Two columns. **Left:** big green `$0.00`, then a bounded block of square keys `1-9 / C 0 +`, no gaps between keys, no title or note field above. **Right:** `Current sale` with the total, the cart cards, and a full-width `Charge $X` at the bottom. No progress bar. |
| `+` | Adds a `Custom Amount` line to the right **immediately** (no popup, no PIN) and resets the display to `$0.00`. Disabled at `$0.00`. |
| `C` | Clears the typed amount to `$0.00`. |
| Charge | Label = cart total **plus** the amount still on the display. Pressing it adds that pending amount as a line, then opens checkout on **Contact information** (or **Review** if a customer is already entered). |
| Cards | Sale card: `−  N  +` with **N black**, line total **green**, and N shown **once**. Repair card: `1 · $149.00`, `1 ·` black, amount green. |
| Cart header | `N · $total` — **N black, $total green**. |
| Keyboard | A desk keyboard types digits; Backspace deletes a digit; `c`/Delete clears; Enter or `+` adds. |

## 2. Scenarios — run in order, one visit each

**A. Quick sale, keypad only (the Square "Keypad" visit).**
Customer buys two things with no barcode. Sales → Keypad. Type `1 2 5 0`, `+`.
Type `5 0 0` (do not press `+`). Read the Charge key (expect `Charge $17.50`).
Press Charge. Expect Contact information with header `2 · $17.50`.
Back → Cart step shows both `Custom Amount` lines. Clear the cart.

**B. Mixed sale — catalog + keypad + quantity.**
Sales → tap one catalog tile twice (expect one line, qty 2, not two lines).
Keypad → `9 9 9` `+`. On the right, press `+` on the keypad line's stepper
(qty 2), then `−` twice (second `−` at qty 1 should swap the row to
`Keep` / `Remove` — press Remove). Confirm the Charge total updates live after
every press. Tap the remaining catalog card body: the line editor opens
(Comp / Remove / price). Close it. Clear the cart.

**C. Customer watching the screen.**
Build a 1-line cart via Keypad. Switch the stance control (top right) to
**Verify**: the customer face shows the same card, read-only, black qty +
green money. Switch back to **Work**. Now try to remove that line from the
Keypad face: because the customer saw it, it must route you into the cart's
void floor (reason + PIN) rather than silently delete. Report exactly what
happened. Do NOT complete the void unless you can stub the PIN (see §3);
leave the cart and report.

**D. Checkout path to the stop line.**
Keypad → `2 0 0 0` `+` → Charge. On Contact information enter a phone
`555-000-0000` and name `Walk In Test`. Continue → **Review**. Record: the
total, what the terminal key reads (`Pay $20.00` expected for a sale), and
any blocker text. **STOP.** Back → Back → Clear cart.

**E. Repair walk-in by hand-price.**
Repair → Keypad → `4 9 0 0` `+`. Expect a repair card `Custom Amount`,
`1 · $49.00`. Press Charge: expect the repair steps (serial / reasons /
signature), not the cart. Walk the steps as far as possible without
signing/submitting; report which step asks for what. Return and clear.

**F. Sizes and touch.**
At `1024×768` and `1366×1024`: both columns visible side by side, keypad keys
fully visible without scrolling, keys have 0px corner radius
(`getComputedStyle(key).borderRadius`), no gap between adjacent keys
(right edge of `1` == left edge of `2`), Charge spans the right column.

## 3. PIN stub (only if a scenario needs it)

`tab.route('**/api/kiosk/staff-for-stepup*', …)` → one staff row, and
`tab.route('**/api/kiosk/price-approval', …)` →
`{ approval: "stub", staffId: 1, expiresAt: <future ISO> }`. The PIN pad
only appears after clicking `Continue as <name>, <role>`. A stubbed approval
will NOT pass submit — it is for walking the UI only.

## 4. Report format

One table per scenario: **Step · Expected · Actual · Pass/Fail · Screenshot**.
Then a **Friction** list: anything a staffer with a customer waiting would
stumble on (extra taps, unclear words, slow screens, keys too small/large,
anything that looked like a bug but you are not sure). Quote exact on-screen
text. End with the list of carts you could NOT clean up, if any.

## 5. Known gaps — do not file these as bugs

- No taxes and no discounts yet (plan W6).
- A keypad line has no note until you add one from the line editor.
- A Repair keypad line is titled `Custom Amount` (there is no device-name
  field on the keypad by operator ruling).
- `/kiosk/v2` naming stays for now.
