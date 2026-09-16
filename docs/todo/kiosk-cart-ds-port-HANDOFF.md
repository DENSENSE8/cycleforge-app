# HANDOFF — Fix the kiosk cart DS port, and put the kiosk INTO the design system

**Date:** 2026-09-14 · **Lane:** `cycleforge-lanes/prod` · **Surface:** `/kiosk/v2`
**Status of the thing you are fixing:** landed, uncommitted, and **rejected by the operator.**

> Operator, on the cart port done in the previous session:
> *"This is done terribly."*
> *"It should not display a depth drop shadow. Similar to the Repair Service Intake form, how it
> displays without the header, it should follow that exact same principle, displaying without the
> header and then the X button top left to close the cart and displaying a stepper on the top for
> the exact steps within the cart for the user to take."*
> *"The repair service intake form is very good and that needs to be uploaded to the design system
> MCP server."*
> *"A handoff prompt just focusing on nailing down the roots of the design system in general."*

Read §1 before you touch anything. The cart is the symptom; §1 is the disease.

**Prior context, do NOT re-read in full:** `docs/todo/kiosk-ds-unification-HANDOFF.md` carries
Phases 0–2 (what landed, what was rejected, and the open operator decisions). This doc is
self-contained for the cart port — go there only for history: its §2 for what each phase actually
shipped, its §5 for the four unanswered operator questions.

---

## 0. How to run the thing (read first)

- **View at `http://localhost:3050/kiosk/v2`.** Port 3050 is the Garisek-OS switchboard proxy
  forwarding to the port in `~/.config/cycleforge/switch` (currently `3077`), served by the
  systemd unit `cycleforge-lane@prod`.
- **NEVER hand-start `next dev` here.** Next 16 holds `.next/dev/lock`; a manual server makes the
  unit crash-loop. If the lane is down:
  ```
  systemctl --user reset-failed cycleforge-lane@prod
  systemctl --user start cycleforge-lane@prod
  ```
- **Playwright:** bundled chromium, `--project=desktop` only (`mobile` needs WebKit system libs
  this machine lacks). Chrome-devtools MCP and the eval `browser` object do not work here.
- **Three harness traps that will waste an hour if you do not know them:**
  1. The **PWA "Add to Home Screen" banner** floats over the bottom-centred action floor and eats
     clicks. Dismiss it first: `page.getByRole('button', { name: /^dismiss$/i })`.
  2. A spec must **select the command** (`kiosk-command-repair`) before picking a tile — the
     device session persists the last command across reloads.
  3. If a foreign compile error is live, the Next dev **Build Error overlay** intercepts clicks.
     `page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })` to see past it.
- **Unit runner differs per file.** `src/lib/auth/withKioskAuth.test.ts` needs
  `NODE_OPTIONS='--conditions react-server' npx tsx --test …`; the component/law tests need PLAIN
  `npx tsx --test …`.

### The gate battery

```
npx tsc --noEmit -p tsconfig.json
npx tsx --test src/components/kiosk/kiosk-pane-frame.test.ts        # 4 pass
npx tsx --test src/components/kiosk/kiosk-chip-family.test.ts       # 5 pass — YOU WILL EDIT THIS
npx tsx --test src/app/kiosk/kiosk-pos-surface.test.ts              # 9 pass
npx tsx --test src/components/repair/repair-step-gates.test.ts      # 6 pass
npx tsx --test src/lib/repair/sku-reasons.test.ts                   # 9 pass
timeout 300 npx playwright test tests/e2e/kiosk-intake-flow.spec.ts -g "landscape shell" \
  --project=desktop --retries=0 --workers=1 --reporter=list          # 2 pass
node /home/michaelgarisek/Projects/Garisek-OS/tools/eval-engineering/cursor-eval.mjs --root . --fast
```

**Known red, NOT yours:** `tsc` fails in `src/components/mobile/daily/MobileDailyChecklist.tsx`,
`src/features/daily-checks/DailyCheckItemInspector.tsx`, `src/features/home/HomeDailyMode.tsx` —
a concurrent daily-checks refactor. `src/lib/kiosk/cart-compound-view.test.ts` is red 6/8 from the
concurrent slot-table amount-column work (proven pre-existing by stashing and re-running). Do not
fix either; do not let them mask a real failure of yours.

---

## 1. THE ROOT CAUSE — the kiosk is invisible to the design system

This is the actual assignment. The cart came out badly because **the design system cannot see the
kiosk**, so every kiosk decision has been made from memory instead of from the catalog.

`tools/design-mcp/server.mjs` builds its catalog by walking an explicit `SOURCES` list of
directories (around line 88). Today that list is:

```
src/design-system/primitives        src/design-system/components
src/components/ui                   src/components/composer
src/components/tables               src/lib/tables
src/components/desk                 src/components/labels
src/lib/optimistic                  src/design-system/themes
src/design-system/components/item-record
src/components/search               src/components/mobile{,/redesign,/receiving}
```

```
grep -c "src/components/kiosk\|src/app/kiosk" tools/design-mcp/server.mjs
→ 0
```

**Neither `src/components/kiosk` nor `src/app/kiosk` is catalogued.** Consequences, all verified:

- `ds_contract "kiosk cart panel"` cannot return `KioskPaneForm`, `KioskChip`,
  `KioskCartLineCard`, `KioskCustomerIntake`, or any `KIOSK_*` token. It answers with desk
  components — which is how a desk compound table ended up rendering the cart.
- Any `pinned.json` entry naming a kiosk component **merges onto nothing**. The server's own
  comments call this out for `src/components/desk`, `src/components/search` and
  `src/components/mobile`: *"Without this home the pin for it in `pinned.json` merges onto nothing
  and is law no agent can find."* The kiosk is the next instance of that exact bug.
- `StepProgressHeader` — the repair intake header the operator likes — is findable ONLY because it
  happens to live in `src/design-system/primitives`. Its sibling law (`KioskPaneForm`) is not.
- 66 pins exist; **zero** name a kiosk component (`CopyChip` is the only fuzzy match).

### Work item 1A — give the kiosk a home in the catalog (do this FIRST)

In `tools/design-mcp/server.mjs`'s `SOURCES`, add homes following the precedent of the mobile kit
entries (specific before general, `match` to name real faces, with a comment saying WHY):

- `src/components/kiosk` — label `kiosk kit (house)`, alias `@/components/kiosk`. Faces to name:
  `KioskPaneForm`, `KioskChip`, `KioskCartLineCard`, `KioskCustomerIntake`, `KioskCartSwipeRow`,
  `KioskCartLineEditor`, `KioskPaymentStepUpSheet`, `ConsultStanceControls`.
- `src/app/kiosk` — the kiosk TOKEN files, so `ds_tokens` can answer a kiosk question:
  `kiosk-chrome.ts`, `kiosk-pos-surface.ts`, `kiosk-counter-surface.ts`.
  Check how `ds_tokens` axes are registered (`axis: 'station-skin'` / `'kiosk-pos'` are the
  precedents — `kiosk-pos` already exists as an axis name, so confirm what it currently reads).

Verify with real calls, not assumption:
```
node tools/design-mcp/ds.mjs contract "kiosk cart panel, step flow on a tablet"
node tools/design-mcp/ds.mjs tokens kiosk-pos
```
`KioskPaneForm` must come back. If it does not, the pins in 1B are dead letters.

### Work item 1B — pin the repair intake form as the gold, and the rest of the kiosk kit

The operator's words: *"The repair service intake form is very good and that needs to be uploaded
to the design system MCP server."* That means `pinned.json` entries (hand-curated prose, only
`useWhen` / `doNot` / `law`, every entry citing where the decision was taken — read `_README` at
the top of the file, and copy the tone of the `StepProgressHeader` entry).

Pins owed, at minimum:

| id | the law it must carry |
|---|---|
| `KioskPaneForm` | The frame every kiosk centre surface wears. `progress` → the pane owns its header and it is `StepProgressHeader`; absent → the shell painted it and the pane paints NOTHING. **There is no title face** — that is what made two chromes stack on pickup. Footer hairline derives from `progress`, never a per-pane flag. |
| `KioskChip` | The TOUCH tier of the chip family. `badge` is the desk tier (square, 18px, bordered). Two faces: `row` (full-width selectable pill) · `meta` (inline fact chip). `onClick` decides button-vs-span. Never hand-roll `rounded-full` + padding. |
| `KioskCartLineCard` | A cart line is a CARD, never a `CompoundRow`. `SURFACE_LAW` §5: lists on a phone-shaped surface are cards. Staff and customer faces mount the SAME card. |
| `KIOSK_UTILITY_SHEET` | The utility slot face (cart · paperwork · triage). Bounded, rounded, **flat** (see §2). Corner is the `/m` token, not a kiosk invention. |
| `KioskCustomerIntake` | One intake face across every channel; `KioskEntryField` is the kiosk form control (one token, `KIOSK_POS_ENTRY`). |

Also amend the `StepProgressHeader` pin: its `law` still says *"Sole mount today:
KioskRepairPane; buyback/pickup port next"*, which is now stale — buyback/pickup mount
`KioskPaneForm` with NO progress (the shell owns their header), and the CART is the next real
`progress` mount (§2).

### Work item 1C — check the other side of the loop

`ds_critique` currently flags `KioskChip` as `forks-the-system` for its raw `<button>` even though
it carries the sanctioned `ds-raw-button` marker (class + comment) that the repo's own guard
honours. Decide once and write it down: either teach the critique heuristic about the marker, or
record in the pin that the flag is expected for this component and why. Do not leave it as a
standing false positive that trains the next agent to ignore critique output.

---

## 2. THE CART — what it must become

**Reference implementation: `src/app/kiosk/v2/KioskRepairPane.tsx` + `KioskPaneForm`.** The
operator named the repair intake form as the thing that is right. Go read it, run it
(`/kiosk/v2` → Repair → pick a tile), and copy its PRINCIPLE, not just its classes.

What the repair intake does that the cart must do:

1. **No titled header band.** Read "without the header" precisely: the flat
   `KIOSK_PANE_HEADER_BAND` bar — *"Cart · N lines · Void · ✕"* — is **REPLACED**, not merely
   deleted. What replaces it is `StepProgressHeader`. The pane still has exactly one band; it is
   just a step band instead of a title bar. `KioskRepairPane` is the worked example: it mounts
   `StepProgressHeader` and no titled band at all.
2. **`StepProgressHeader`:** X top-LEFT closes/exits, segmented progress across the middle, `n/N`
   right. That single band IS the header.
3. **Step bodies inside one fixed measure** (`KIOSK_POS_FORM_MEASURE`), one bold display header
   per step, top-left.
4. **One footer key per step** — Continue while there are steps left, the real verb at the end.
5. **Progress is a COUNT of satisfied units (PG6), never the index of the step in view.**

### 2A — kill the drop shadow, and replace the float cue

`KIOSK_UTILITY_SHEET` in `src/app/kiosk/kiosk-chrome.ts` currently composes
`elevationClass('overlay')`. **Remove the elevation.** Operator: *"It should not display a depth
drop shadow."* The shadow is what makes it read as a popover.

**But do not just delete it — the shadow is currently the ONLY thing separating the sheet from the
stage.** Verified planes: the shell's stage is `bg-surface-card` (white) and the sheet is
`bg-surface-card` + `border border-border-soft` (white on white). Strip the shadow and the sheet
reads as pasted-on with a stray outline.

Recommended shape — but **you MUST pick the rung with `ds_tokens`, not from this prose.**
`surface-sunken`, `surface-bench` and `surface-trough` are visually different rungs and only the
token lookup can tell you which is the quiet recessed plane versus a station bench fill. Run
`ds_tokens color --filter surface` and `ds_tokens border` and choose deliberately:

- **Sink the STAGE, not the sheet** — so the white sheet reads as the raised plane by CONTRAST
  instead of by shadow. Depth from the plane, not from a blur.
- **SCOPE IT TO `utilitySlot !== null`.** This is a conditional class on the stage wrapper in
  `KioskShell`, NOT a permanent repaint. The catalog's own plane depends on the current white:
  `ProductSelector`'s `KIOSK_POS_CANVAS` is `bg-surface-card`, the product cards are
  `bg-surface-card`, and the glass dock is `bg-surface-card/70` over it. A permanent sunken stage
  would recolour the whole browse surface and break `kiosk-pos-surface.test.ts`'s ground law
  (`KIOSK_POS_CANVAS` = one SoT background, pinned 2026-09-14). The stage is only vacated while a
  utility slot is open — that is exactly the window in which it may change colour.
- **Keep the hairline** (`border-border-soft`) as the sheet's edge; it stops being a stray outline
  once the plane behind it differs.
- **Same question for `KioskCartLineCard`**, which carries `elevationClass('raised','soft')` per
  line. Cards sitting ON the white sheet have the same white-on-white problem; if the sheet stays
  white, the cards want a recessed fill or a hairline rather than a soft lift. One decision for
  both, written down in the pin.

If the operator wants the stage left white, invert it — a recessed sheet on a white stage. Either
way: **two different planes, zero blur**, and the rung comes from `ds_tokens`.

### 2B — put the cart on `KioskPaneForm` with a real stepper

The cart currently hand-rolls its own frame: `KIOSK_PANE_HEADER_BAND` + a "Cart" title + line
count + Void + X on the right (`KioskCartLedger.tsx` ~line 289), then intake, then the list, then a
totals band, then a footer. That is the shape the operator rejected. Mount `KioskPaneForm` with
`progress`, exactly like the repair pane, and delete the header band from this file.

**The X goes top-LEFT** — that is `StepProgressHeader`'s own X (`onClose` → the cart's `onClose`),
not a second icon button on the right. Delete `kiosk-cart-close` from the right side; keep the
`data-testid` on the step band's X if any test depends on it (check
`tests/e2e/kiosk-intake-flow.spec.ts` — it drives `kiosk-cart-void-all` and `kiosk-cart-line`, so
re-home the Void verb deliberately rather than dropping it).

**The cart has NO steps today — the decomposition is a DESIGN DECISION to propose, not to invent
silently.** The cart is currently one long screen: intake → line list → totals → Save/Pay. Propose
the split to the operator (or state it plainly in your first message and proceed if they have
already approved it), because it changes what a customer is asked for and when.

**Do not build a parallel gate model.** `collectKioskTriage` (`src/lib/kiosk/visit-triage.ts`)
already returns items with `target: 'cart' | 'customer' | 'line'` and `severity: 'block' | 'warn'`,
and `firstKioskBlocker` is what the Pay/Save buttons gate on today. That taxonomy maps ONE-TO-ONE
onto steps, which is why it is the honest basis: `target: 'line'` blocks gate the Items step,
`target: 'customer'` blocks gate the Customer step, `target: 'cart'` blocks (empty ticket) gate
Pay. One gate model feeding both the per-step Continue key and the header count, so the button and
the stepper can never disagree — exactly how `repairStepGates` serves the repair flow.

Proposed units (confirm the mapping against the triage targets before coding):

1. **Items** — the ticket has at least one line and no `target: 'line'` block (serial, price,
   signature on a repair line).
2. **Customer** — no `target: 'customer'` block (phone is the match key, so it is the real gate).
3. **Pay** — no `target: 'cart'` block; totals + Save / Pay live here.

`severity: 'warn'` items must NOT gate a step — they are advisories, and a stepper that refuses to
advance on a warning is a stepper an operator learns to fight. Only `'block'` counts.

Write the gate function as a pure, injectable module in `src/lib/kiosk/` with unit tests, the same
way `repairStepGates` + `repair-step-gates.test.ts` do it. That test is the model: 6 behavioural
tests defending PG6, including "a satisfied unit counts regardless of which step is on screen" and
"clearing an earlier unit takes its segment back".

### 2C — what to KEEP from the previous session

Not all of it was wrong; do not throw the parts that answered the ask:

- `KioskChip` (touch chip tier) and `KioskCartLineCard` (cards, not `CompoundRow`) — the operator
  asked for "a mobile-like chip display… pills and buttons", and the chips/cards are that. Keep
  them; restyle if the shadow decision changes their face.
- `cart-card-view.ts` — pure line derivations, shared with `cart-compound-view.ts` so the tablet
  card and any desk row state the same facts.
- The sheet being **bounded** rather than full-bleed. Only the shadow is wrong.
- `KioskPaneForm` + `kiosk-pane-frame.test.ts` (Phase 1) — the cart mounting it is the point of 2B.

### 2D — what else is still a desk fork in the cart

While you are in there, these are known and unfixed:

- `KioskCartLineEditor` and `KioskPaymentStepUpSheet` were not reviewed against the intake
  principle. If the editor opens as a nested panel inside a card, decide whether it is a step, a
  `BottomSheet`, or an inline expansion — and write the law down.
- The success face (`if (result)`) still paints its own header band + footer band. Same treatment.
- `KioskTriagePanel` shows the same triage items the stepper will consume. Two surfaces reading one
  gate model is fine; two surfaces DERIVING it separately is not.

---

## 3. Repo laws that constrain every line of this

- **Design MCP is mandatory for UI writes.** `ds_contract` BEFORE writing a component,
  `ds_tokens <axis>` for any value (never invent a hex / px / `text-[Npx]`), `ds_critique <file>`
  after. Project hooks DENY writes under `src/**/*.{tsx,jsx,css}` without a fresh
  `.cursor/design-mcp-session.json` stamp — any `ds.mjs` call refreshes it.
  CLI (works when the MCP tools are absent): `node tools/design-mcp/ds.mjs {contract|tokens|critique} …`
- **`ds_adjudicate`** answers "would this exact code be allowed" against the same rules the
  PreToolUse hook enforces. Use it on the new frame markup before you commit to it.
- **Mobile-first surface law** (`docs/mobile-first/SURFACE_LAW.md`): every operator verb must be
  completable on `/m/*` first; desks and kiosks CONSUME that SoT. §5 is the one you are enforcing:
  lists on a phone-shaped surface are cards + `BottomSheet` detail, never a DataTable.
- **PG6** (`docs/warehouse-os/PROGRESSION-INTERVIEW-LEDGER.md`): progress is a COUNT of satisfied
  required units, NEVER a pointer position.
- **M1 / PG12:** progress fills are `scaleX` + `transformOrigin:'left'`, duration
  `framerDuration.progressFill`, gated by `useReducedMotion`. Never animate width/height/position.
- **One header band per pane.** The reason `KioskPaneForm` has no title face.
- **`ds-raw-button`** is the sanctioned escape for a genuinely-required raw `<button>` (there is a
  guard counting them against a baseline). Annotate with a reason; never raise the baseline.
- **Never delete a `slot-table-discover.ts` KEEP id.** `engine:CART_COMPOUND_COLUMNS` is one:
  `cart-compound-view.ts` / `cart-grid-layout.ts` are unused by the cart now but must stay until
  the slot-table owner retires that entry.
- **No motion work.** Operator: *"Let's not even think about motion dev until everything is fully
  cleared up in terms of the cart design system port."* Phase 3 is closed until then.

---

## 4. Acceptance

The cart, at `/kiosk/v2` → cart glyph, on an iPad-landscape viewport:

- [ ] **No drop shadow** on the sheet (computed `box-shadow: none`), still bounded and rounded —
      AND a replacement separation cue is in place (two different planes; see §2A). Read the
      computed `background-color` of BOTH the stage and the sheet and confirm they differ.
- [ ] **No titled header band, no "Cart" title.** One band only: `StepProgressHeader`.
- [ ] **X is top-LEFT** and closes the cart. No second close control on the right.
- [ ] A **stepper** with the cart's real steps, `n/N` right, count = satisfied units (PG6) — back-
      editing an earlier step takes its segment back.
- [ ] One footer key per step; the final step carries Save / Pay with the existing block reasons.
- [ ] Lines stay chip-carrying cards; zero `[data-grid-row]`, zero `role="table"` in the cart.
- [ ] Paperwork + triage panels still render correctly on the shared sheet face.
- [ ] `ds_contract "kiosk cart panel"` returns `KioskPaneForm` / `KioskChip` (proof that 1A landed),
      and `pinned.json` carries the new entries (proof that 1B landed).
- [ ] Gate battery green, `ds_critique` on every touched file, and the new gate module has
      behavioural unit tests in the `repair-step-gates.test.ts` mould.
- [ ] Handoff updated: `docs/todo/kiosk-ds-unification-HANDOFF.md` §2 records what actually shipped,
      and the `KIOSK_UTILITY_SHEET` docblock's operator quote is corrected (it currently cites the
      "mobile-like chip display" quote for a shape the operator then rejected).

**Verify at runtime, not by reading your own diff.** Read computed styles
(`getComputedStyle(el).boxShadow`), count bands, screenshot it, and look at the screenshot.

---

## 5. State of the tree you are inheriting

- **Committed:** `593690bff` — device-authed per-SKU repair reasons + Add CTA + command ink + the
  prior session's build closure (25 files).
- **Uncommitted:** Phase 1 (`KioskPaneForm` + 3 panes ported + spine tokens retired) and Phase 2
  (`KioskChip`, `KioskCartLineCard`, `cart-card-view.ts`, `KIOSK_UTILITY_SHEET`, cart/paperwork/
  triage on the sheet, customer face on the same card) — plus the two law tests.
- The lane has **~1,150 other dirty files** from concurrent workstreams. Commit path-scoped
  (`git add -- <paths>` then `git commit -F msg -- <paths>`); the index already holds 16 foreign
  staged renames that must stay staged. Verify a candidate commit by copying it into a scratch
  worktree at `HEAD` and running `tsc` there before landing.
- **One foreign file was edited** to unblock the dev build: `src/components/fba/sidebar/index.ts`
  re-exported `AdminFbaSidebarPanel`, which `FbaSidebar.tsx` had deleted — a Build Error on every
  route. Keep or revert is the operator's call.
- Still unanswered by the operator: sheet vs right-anchored drawer (reverses Phase 0's stage-swap
  ruling); the A2HS banner over the action floor; `GlobalHeaderKioskButton.tsx` deleted-but-
  unstaged; `pinned.json` holding new pins alongside other sessions' law edits.
