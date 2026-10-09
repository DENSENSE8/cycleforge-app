# PROMPT — Label buy: one detailed stepper form, everywhere (2026-10-08)

Paste this whole file as the first message of a fresh implementation session in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod` (lane `lane-prod`, branch
`prod/worktree-2026-09-11`). Read `AGENTS.md` first: one dev origin `:3050`,
lane lifecycle is operator-only, the tree is shared with another session — commit
only your own paths (`git add <path>`, never `-A`, never stash/restore).

## Where things stand (shipped to production today, commit `ba6da779d`)

- `OrderLabelBuyDialog` (`src/components/outbound/labels/OrderLabelBuyDialog.tsx`)
  is the ONE detailed label-buy form, opened as `purpose="outbound"` (Buy label,
  order with no tracking) or `purpose="replacement"` (Buy replacement label, with
  the reason). Body: `ReplacementForm`
  (`src/components/outbound/labels/replacement/ReplacementForm.tsx`) — labels so
  far + ship-to editor (`ReplacementOrderFacts`), parcel oz + L × W × H
  (`ReplacementParcelRow`), insurance + Get rates (`ReplacementQuoteBar`), carrier
  chips / sort / coverage (`ReplacementRateFilters`), rate rows
  (`ReplacementRateRows`), sticky Buy + confirm (`ReplacementBuyFooter`), bought
  card (`ReplacementBoughtCard`), stub merge (replacement only). Rates:
  `POST /api/shipping/order-rates`; buy: `POST /api/shipping/order-labels/purchase`
  with `purpose` (`replacement-label-client.ts`).
- Order record verbs: E = Buy label / Buy replacement label (E is bound to nothing
  else); Return label still uses `BuyLabelSection` with `initialPurpose="return"`
  (`ReturnLabelDialog`).

## Pain points (operator screenshots on prometheus)

`ssh prometheus`, then `~/Desktop/Screenshot 2026-10-08 at 12.25.38.png` (the Live
feed **Labels & paperwork** sheet, order 26-15223-26669):

1. **The Live feed buys labels with a different, thin form.** The sheet's Shipping
   label slot (`src/features/labels-docs/orders/pane/LabelSlot.tsx`, `Panel = 'buy'`)
   opens `BuyLabelSection` inline in the ~40% work column: an
   **Outbound | Return | Replacement switcher** and a lone "Get shipping rates"
   button — no parcel, no dims, no ship-to editor, no rate filters. It must be
   the same detailed form as `OrderLabelBuyDialog`, outbound-specific (no purpose
   switcher), and it must paint on the **right side** — the sheet's viewer column
   (`DocViewer`, `src/features/live-feed/docs-triage/OrderSheet.tsx` lines ~82–110:
   work column `w-2/5 min-w-[26rem]` | viewer) — for space.
2. **The detailed form shows everything at once; the rate list gets no room.**
   In `ReplacementForm` the facts, parcel, insurance and filters are stacked and
   pinned above one `ScrollPane className="min-h-48"`; on a laptop the rate rows
   (the selection items) are squeezed out of view. Operator: "I cannot see the
   selection items for the labels."

## Change

### A. Step-by-step form with a progress bar (progressive disclosure)

Turn the label-buy form body into a stepper. One step visible at a time, a
progress bar on top, Back / Next (or the step's own commit) at the bottom; Enter
advances when the step is complete.

| Step | Shows | Advances when |
|---|---|---|
| 1 Ship to | Order + item line, labels so far (replacement), ship-to with the editor; replacement: the reason + note | address present (replacement: reason picked) |
| 2 Parcel | oz (with the scale/oz icon), L × W × H, insurance toggle + declared value | `parcelComplete` and declared value when insured → **Get rates** is the Next |
| 3 Rate | carrier chips, sort, coverage — then the rate rows given the FULL remaining height (the one scroll area) | a rate is selected |
| 4 Confirm | the chosen rate, cost, carrier/service, ship-to summary, reason (replacement); **Confirm & buy** focused | purchase lands |
| 5 Done | `ReplacementBoughtCard` (tracking, Print label, Print slip, Download, Void; Copy buyer email only for replacement) | Done |

- Progress bar: reuse `MobileStepProgress`
  (`src/design-system/components/MobileStepProgress.tsx` — done segments pressable to
  go back, nothing jumps forward) — it is the house step bar; do not fork a new one.
  Check `ds_contract 'step progress'` first.
- Editing an earlier step after a quote marks the quote stale (the existing
  `signature` / `quotedFor` logic) and sends the operator back to step 3 with
  "Refresh rates".
- Keep the idempotency key, remembered
  carrier, stub merge (replacement only, on step 5 or step 1 — operator call), and
  every `data-testid` that tests read (`send-replacement-*`).
- Mobile-first: each step must fit a phone; the primary verb is the bottom button.

### B. The Live feed sheet uses the same form, on the right

- `LabelSlot`'s Buy label (the `'buy'` panel) opens the stepper form for
  `purpose="outbound"` — never `BuyLabelSection`, never a purpose switcher.
- In the docs sheet (`sheet` prop / `OrderSheet`), paint it in the **viewer column**
  (right side, full height) instead of inline in the work column; the work column
  keeps the slot's status ("Missing") and the other verbs. Closing / Done returns
  the viewer to the document preview. Extract the stepper body so both
  `OrderLabelBuyDialog` and the sheet's viewer host it (one component, two hosts);
  no copy of the form.
- If the order already has tracking (a label exists), the sheet offers Buy
  replacement label (`purpose="replacement"`) the same way — still no switcher.
- `BuyLabelSection` keeps only its remaining callers (Return label,
  `OrderShippingPanel`, `IntakeShippingFields`, `OrderDocumentsSection`) — list them in
  the report; do not widen this task to them.

## Acceptance

- Live feed → select an order owing a shipping label → Labels & paperwork →
  Shipping label → Buy label: the detailed stepper opens in the right column; no
  Outbound/Return/Replacement switcher anywhere in it.
- Allocate order (no tracking) → E: the same stepper in `OrderLabelBuyDialog`.
- Step 3 shows at least 6 rate rows on a 13" laptop; every rate is selectable.
- Progress bar shows the current step; Back works; a parcel/ship-to edit after
  quoting forces a re-quote.
- A real buy on production (ShipStation) completes: tracking on the order's label
  list, Print label works, Void works.
- `pnpm verify:fast` green; `ds_critique` clean on touched UI files.

## Test (only when `:3050` answers as `lane-prod`)

Read `~/.config/cycleforge/switch-pin` and `curl -sI http://localhost:3050/signin`:
both must say `lane-prod` (`x-switch-lane`), no `x-switch-error`. Otherwise do not
probe — leave this checklist for the operator:

1. Desktop: Live feed → order owing a label → Labels & paperwork → Buy label →
   steps 1–5 on the right; screenshot each step.
2. Desktop: Allocate order with no tracking → E → same steps in the dialog.
3. Phone width (390px): each step fits, the bottom button is the step's verb.
4. Shipped order → E → replacement stepper with the reason on step 1.

## Deploy (when asked)

Commit only your paths, push `prod/worktree-2026-09-11` (pre-push runs
`verify:dogfood` on the working tree — if the other session's uncommitted work
fails it, push from a clean `git worktree add --detach /tmp/cf-ship <sha>`), then
`vercel deploy --prod --yes` from that clean worktree (symlink `node_modules` and
`.vercel`; no `.env*` files in it), confirm with `vercel inspect <url>` and
`curl https://app.cycleforge.ai/signin`.
