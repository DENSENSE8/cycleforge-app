# HANDOFF — Repair review step: print icon onto the header row, and rename the commit key

**Date:** 2026-09-15 · **Lane:** `cycleforge-lanes/prod` · **Surface:** `/kiosk/v2` → Repair → step 4 of 4
**Scope:** TWO small changes on the Repair intake's "Review & sign" step. NOTHING ELSE.
Not the signature pad, not the paperwork content, not the ticket preview, not the cart. Those
landed today and are green.

**The operator tests this surface themselves.** Do NOT drive the browser and do NOT run the
kiosk e2e specs to "confirm" a fix. Land the change, run the gates in §5, report. The operator
comes back with exact changes.

---

## 0. How to run it

- **`http://localhost:3050/kiosk/v2`** → command menu → Repair → tile → the catalog's primary
  key (`[data-kiosk-continue]`) → the intake form → Continue ×3 to reach **Review & sign**.
- Port 3050 is the Garisek-OS switchboard proxying the lane on 3077.
- **NEVER hand-start `next dev`.** If the lane is down:
  ```
  systemctl --user reset-failed cycleforge-lane@prod
  systemctl --user start cycleforge-lane@prod
  ```
  Check `ss -ltnp | grep 3077` first — a hand-started `next dev` holding `.next/dev/lock` makes
  the unit crash-loop on `EADDRINUSE :::3077`.
- **Design MCP is mandatory** before any write under `src/**/*.{tsx,jsx,css}`; project hooks DENY
  the write without a fresh `.cursor/design-mcp-session.json` stamp (any `ds.mjs` call refreshes
  it):
  `node tools/design-mcp/ds.mjs contract "<job>"` · `ds.mjs tokens kiosk` · `ds.mjs critique <file>`

---

## 1. WORK ITEM A — the print icon must share the header row

### The operator's report

> *"Button should not display in a second row, it should display in the same row as review and
> sign."*

### Where it is now — verified

`src/app/kiosk/v2/KioskRepairPane.tsx`:

- **The step heading** is a bare `<h2>` at **:379-381**, rendered for steps 1–3:
  ```tsx
  <h2 className="px-4 pb-3 pt-5 text-left text-role-display font-bold text-text-default">
    {STEP_HEADERS[step]}
  </h2>
  ```
  `STEP_HEADERS[3]` is `'Review & sign'` (module scope, ~:56-66). Step 0 is exempt — it owns its
  own heading inside `KioskReasonStep`.

- **The print icon** is its own full-width row immediately below, at **:454-470**, inside the
  `step === lastStep` block:
  ```tsx
  <div className="flex items-center justify-end">
    <HoverTooltip label="Print this paperwork" asChild>
      <IconButton icon={<Printer className="h-5 w-5" />} … data-testid="kiosk-repair-print" />
    </HoverTooltip>
  </div>
  ```
  That `justify-end` row is the second row the operator is rejecting.

### What to do

Put the icon on the heading's own row, right-aligned, so the row reads
`Review & sign …………………… [🖨]`.

The honest shape is a heading ROW that can carry a trailing action, because step 3 is now the only
step with one:

1. Give the `<h2>` branch a row wrapper that holds the title and an optional trailing slot. Keep
   the existing `px-4 pb-3 pt-5` inset and `text-role-display font-bold` face — those are the
   step-header face for steps 1–3 and must not change for steps 1 and 2.
2. Move the `IconButton` + `HoverTooltip` into that slot and **delete the `justify-end` row** at
   :454-470. Do not leave an empty wrapper behind.
3. The icon keeps `size="touch"` (the counter's thumb floor, `COUNTER_TOUCH`) and
   `data-testid="kiosk-repair-print"` — `repair-paperwork-law.test.ts` asserts the aria label and
   the glyph, and an e2e handle should not move for a layout change.

**Constraints**

- **This is BODY content, not a band.** `KioskPaneForm` has NO title face and the pane owns ONE
  header — the step band (`StepProgressHeader`: X left · segments · `n/N` right). Do not add the
  icon there and do not reach for `KIOSK_PANE_HEADER_BAND` /
  `KIOSK_PANE_HEADER_TITLE`. `kiosk-pane-frame.test.ts` enforces this and the double-band bug
  (2026-09-14) is exactly what it is guarding.
- Ask `ds_contract "kiosk step heading row with a trailing icon action"` first. If a heading-row
  primitive already exists, mount it; do NOT hand-roll a second one. If it does not, the row
  belongs in `KioskRepairPane` as body content — a new shared primitive for one call site is not
  earned yet.
- Never invent a hex, a px radius or `text-[Npx]` — `ds_tokens kiosk` answers (65 tokens, docblock
  prose as the `use` sentence).

### Acceptance

- `Review & sign` and the print icon are on ONE row, icon right-aligned.
- Steps 1 and 2 (`Device & quote`, `Contact information`) render **unchanged** — same inset, same
  type face, no phantom trailing slot.
- No second header band; `kiosk-pane-frame.test.ts` still passes.
- `data-testid="kiosk-repair-print"` and `ariaLabel="Print this paperwork"` survive.

---

## 2. WORK ITEM B — the commit key should say it files a ticket

### The operator's report

> *"you must ensure that the safety card text is updated to something like file ticket."*

**Read "safety card" as "Save to cart"** — it is a voice-transcription artefact, and `Save to cart`
is the exact string on that key. **Confirm this with the operator before landing**, because the
alternative reading (the caption under the paperwork) is a different change; see §4.

### Where it is now — verified

`src/app/kiosk/v2/KioskRepairPane.tsx:348-356` — the ONE key on the review floor:

```tsx
<Button
  size="lg"
  className={KIOSK_POS_CTA}
  disabled={!canSave}
  onClick={() => saveToCart()}
  title={blockReason ?? undefined}
>
  {savedFlash ? 'Saved to cart' : 'Save to cart'}
</Button>
```

`savedFlash` is a 1.5s confirmation flip (`:262-264`, timer cleared on unmount at `:91-96`).

### Why the rename is right, and what it must NOT overclaim

`Save to cart` describes the MECHANISM (a line lands on `counter_session_lines`), not the outcome
the operator cares about. The outcome is: this visit will produce a helpdesk ticket.

Traced 2026-09-15, so state it accurately:

- `KioskCartLedger.tsx:163` sets `ticketWork: { mode: 'create' }` whenever a service line exists.
- `submitCounterTransaction` (`src/lib/counter/submit-counter-transaction.ts:756-809`) enqueues one
  `CREATE_TICKET` outbox row **per repair**, and passes `ticketWork: 'skip'` inward so nothing
  mints two tickets for one device.
- The outbox drain (`src/lib/support/ticket-outbox.ts`) creates the ticket and stamps
  `repair_service.ticket_number`.
- `/api/repair-service/print/[id]:101` renders `formatRepairPaperTicketNumber(repair.ticket_number)`.

**So pressing this key does NOT file the ticket.** It commits the repair line to the cart; the
ticket is filed when the CART submits (Pay / Save on `KioskCartLedger`), asynchronously via the
outbox. A label reading `File ticket` would claim an action that happens one surface later.

**Decide explicitly and say which you picked** (the operator asked for *"something like* file
ticket", so wording is open):

1. **`File ticket`** — what the operator said. Shortest, matches their mental model (this step ends
   with a ticket existing). Cost: it is a promise the key does not keep on press; the ticket
   appears after cart submit. If the cart is abandoned, no ticket is ever filed.
2. **`Add to ticket`** — accurate for a multi-device visit (the visit IS the ticket; each device is
   a line on it) and it reads as a commit, not a completion. Closest to true without being
   mechanical.
3. **`File repair`** / **`File drop-off`** — names what is being filed (this device) without
   claiming the helpdesk ticket exists yet.

**Recommended: 2.** It keeps the operator's verb ("file"/"add" to a ticket) and does not lie about
when the helpdesk row appears. If the operator wants literal `File ticket`, take option 1 — it is
their surface — but do not also change the submit pipeline to create a ticket here (see §4).

Whichever wins, the `savedFlash` confirmation string has to move with it and stay in the same
tense: `Save to cart` → `Saved to cart` becomes e.g. `Add to ticket` → `Added to ticket`.

### Constraints

- ONE key on this floor. The trailing `Add` was removed on operator ruling today; do not
  reintroduce a second key (`repair-paperwork-law.test.ts` and the footer comment at :340-347
  record why).
- Keep `disabled={!canSave}` and `title={blockReason ?? undefined}`. `blockReason` is
  `getRepairSubmitBlockReason` — the ONE refusal sentence, also rendered under the paperwork. Do
  not write a second copy deck.
- `KIOSK_POS_CTA` stays the face. It casts nothing and presses by travel alone
  (`kiosk-pos-surface.test.ts` pins that).

### Acceptance

- The review floor's single key reads the chosen label, and its saved state is the same phrase in
  past tense.
- No new string duplicates `getRepairSubmitBlockReason`.
- `Continue` on steps 0–2 is untouched.
- The chosen label does NOT imply the helpdesk ticket exists before the cart submits, or the
  handoff report says explicitly that the operator accepted that overclaim.

---

## 3. The review step as it stands today (all landed, green)

`src/app/kiosk/v2/KioskRepairPane.tsx`, `step === lastStep` block (~:419-530):

| Order | What | Anchor |
|---|---|---|
| 1 | `<h2>Review & sign</h2>` | :379-381 |
| 2 | print icon row ← **Work Item A moves this up into 1** | :454-470 |
| 3 | the paperwork — `RepairServiceForm surface="screen" density="compact" sections="full"` inside `RepairPaperworkCanvas align="full" frame="bordered"` | :471-479 |
| 4 | off-viewport A4 print copy — `surface="print" density="full"` | :500-514 |
| 5 | ticket-preview caption (`Next support ticket is expected to be #N …`) | :515-536 |
| 6 | `SignaturePad variant="dropoff" allowFullscreen` | after 5 |
| 7 | `blockReason` sentence when the form is incomplete | after 6 |

Landed today, do not undo:

- **The paperwork replaced a hand-rolled review card.** `KioskRepairReviewCard` is deleted, pin
  removed. A summary is a SECOND rendering of the agreement and can disagree with the sheet the
  customer signs.
- **`density` = SCALE, `sections` = COMPLETENESS.** One prop carried both; the only way to get the
  pickup signature line was to accept A4 geometry, which does not fit the 512px form measure
  (`KIOSK_POS_FORM_MEASURE`).
- **Live ink.** `dropoffSignatureUrl={signatureData?.dataUrl ?? null}` paints the pad output into
  the drop-off band at printed geometry (`REPAIR_PRINT_SIGNATURE_BAND.inkHeightPx`,
  `object-contain`, bottom-anchored) so screen and paper agree. Pickup stays an EMPTY rule —
  nobody has collected the unit.
- **Print prints the A4 copy, never the on-screen sheet.** Printing the compact sheet would hand
  the customer a signed document that is not the drop-off paperwork — a third rendering, the same
  defect as the review card. Both mounts share ONE `paperworkProps` memo; the law test asserts
  exactly two `{...paperworkProps}` spreads.
- **Signature capture.** `PAD_HEIGHT` is retired; the pad is a RATIO on the kiosk axis
  (`COUNTER_SIGNATURE_PAD`, `aspect-[5/1]`), the guide is proportional
  (`COUNTER_SIGNATURE_GUIDE`, `bottom-[18%]`), and the export is CROPPED to the ink
  (`exportSignaturePng` → `signatureInkBox`) so a stroke drawn high on the pad still prints
  seated on the rule.

---

## 4. Open questions — do NOT decide these alone

- **"Safety card" = "Save to cart"?** §2 assumes yes. If the operator meant the ticket-preview
  CAPTION (`Next support ticket is expected to be #N — the printed paperwork carries the final
  number.`, :515-536), that is a different edit and the button stays. **Ask.**
- **Should this key actually file the ticket?** If the operator wants `File ticket` to be literally
  true, that is a pipeline change, not a label change: it would mean creating the helpdesk ticket
  at review time instead of on cart submit. Cost: a ticket per ABANDONED review, and a second
  create path beside `submitCounterTransaction`'s outbox enqueue — the thing `ticketWork: 'skip'`
  exists to prevent. Out of scope here; raise it as its own increment.
- **The print-template fork (pre-existing).** `/api/repair-service/print/[id]` builds its own HTML
  rather than mounting `RepairServiceForm`, so the legal wording lives in two places and even the
  A4 copy is not byte-identical to the route's output. Converging them is the real fix and its own
  increment.
- **Continue sits behind the iOS keyboard** (operator 2026-09-15, unruled). `KioskPaneForm`'s floor
  is a flex row at the bottom of a `h-full` column and iOS Safari OVERLAYS rather than resizes.
  Recommended, unbuilt: consume the existing `src/hooks/useKeyboard.ts` (`visualViewport`, already
  written and unused on this surface) in `KioskPaneForm` so the floor rides above the keyboard with
  matching scroll clearance — one edit, every pane inherits it — plus `enterKeyHint` and a per-step
  `<form onSubmit>`. The keyboard key alone is NOT sufficient: phone and price use
  `inputMode`/`tel`, and the iOS Number Pad has no Return key.

---

## 5. Gate battery

```
npx tsc --noEmit -p tsconfig.json
npx tsx --test src/components/repair/repair-paperwork-law.test.ts      # 5 pass
npx tsx --test src/components/kiosk/kiosk-pane-frame.test.ts           # 5 pass
npx tsx --test src/components/repair/repair-step-gates.test.ts         # 7 pass
npx tsx --test src/app/kiosk/kiosk-pos-surface.test.ts                 # 10 pass
npx eslint <touched files>
node tools/design-mcp/ds.mjs critique src/app/kiosk/v2/KioskRepairPane.tsx
node /home/michaelgarisek/Projects/Garisek-OS/tools/eval-engineering/cursor-eval.mjs --root . --fast
```

If you change a string the law test asserts, update the test in the same commit and say why in the
report — do NOT re-pin it to new wording without a reason.

**`KioskRepairPane.tsx` is 571 lines** and `ds_critique` flags it on size. That is a real finding
but NOT this handoff's job; do not split the pane while making a two-line layout change.

---

## 6. Lane hazards — read before you believe a red gate

- **~1,150 dirty files from concurrent workstreams.** A receiving/station/tote-label refactor is
  mid-flight and saves files continuously. On 2026-09-15 the shared gate went red FOUR times on
  files never opened by this work: `daily-checks/items/route.ts`, `picking/sessions.ts`
  (`Queryable` "unused" while used at :397/:454), `carton-add/BoxTab.tsx`,
  `master-nav/StaffAccountFooter.tsx`. Three were TORN READS — the guard read a file mid-write and
  the error vanished on re-run. One was a genuine new boundary crossing which its owner then
  absorbed into the baseline (67 → 68).
- **Protocol:** capture full output (`> /tmp/x.log 2>&1`, then grep) — `tail` swallows the failure
  block. Attribute by `git status` + `stat -c '%y'` + a direct re-lint/re-typecheck of the named
  file. Do NOT patch another lane's in-flight file. Do NOT count it against your change set. Gate
  a re-run on a quiet window (`newest foreign .ts/.tsx write age > 90s`) rather than looping.
- **NEVER `git checkout --` a shared file.** On 2026-09-15 that destroyed another workstream's
  uncommitted kiosk pins in `src/design-system/pinned.json`; they were only recoverable because an
  in-memory copy survived. Edit `pinned.json` by TEXTUAL insertion, never parse→stringify (that
  mangles unicode escaping across every other entry).
- **Commit path-scoped:** `git add -- <paths>` then `git commit -F msg -- <paths>`.
- **Do not commit** `docs/tenancy/*.generated.*`. Four of them are dirty from other lanes; two were
  regenerated by `scripts/tenancy-coverage.mjs` and reflect other workstreams' migrations. The new
  `GET /api/kiosk/repair/next-ticket` audit entry lands with whoever regenerates next.
- **Env defect, pre-existing:** this worktree's DSNs name TWO Neon branches (`kiosk_devices` on the
  owner branch, the catalog projection on the tenant branch). The app logs it on boot. It blocks a
  paired-device + populated-catalog measurement; it does not block this work.
