# HANDOFF — Repair Service Intake Form: signature geometry + a reviewable, non-destructive Add

**Date:** 2026-09-15 · **Lane:** `cycleforge-lanes/prod` · **Surface:** `/kiosk/v2` → Repair
**Scope:** the Repair Service Intake Form and the repair process in kiosk mode. NOTHING ELSE.
Not the cart, not sales, not the catalog trail, not Lighthouse. Those are landed or parked.

**The operator tests this surface themselves.** Do NOT drive the browser, do NOT run the kiosk
e2e specs to "confirm" a fix. Land the change, run the unit/law gates below, and report. The
operator will come back with exact changes.

---

## 0. How to run it

- **View at `http://localhost:3050/kiosk/v2`** → command menu → Repair → tile → the catalog's
  primary key (`[data-kiosk-continue]`) → the intake form.
- Port 3050 is the Garisek-OS switchboard proxying the lane on 3077.
- **NEVER hand-start `next dev`.** If the lane is down:
  ```
  systemctl --user reset-failed cycleforge-lane@prod
  systemctl --user start cycleforge-lane@prod
  ```
  Known trap: a hand-started `next dev` holding `.next/dev/lock` makes the unit crash-loop on
  `EADDRINUSE :::3077`. Check `ss -ltnp | grep 3077` before starting anything.
- **Env defect, pre-existing, not yours:** this worktree's DSNs name TWO Neon branches
  (`kiosk_devices` on the owner branch, the catalog projection on the tenant branch). The app
  logs it on boot. It blocks a paired-device + populated-catalog measurement; it does not block
  this work.

### Gate battery for this handoff

```
npx tsc --noEmit -p tsconfig.json
npx tsx --test src/components/repair/repair-step-gates.test.ts       # 7 pass
npx tsx --test src/components/kiosk/kiosk-pane-frame.test.ts         # 5 pass
npx tsx --test src/components/kiosk/kiosk-chip-family.test.ts        # 7 pass
npx tsx --test src/app/kiosk/kiosk-pos-surface.test.ts               # 10 pass
npx eslint <touched files>
node /home/michaelgarisek/Projects/Garisek-OS/tools/eval-engineering/cursor-eval.mjs --root . --fast
```

Design MCP is mandatory before any write under `src/**/*.{tsx,jsx,css}`:
`node tools/design-mcp/ds.mjs contract "<job>"` · `ds.mjs tokens kiosk` · `ds.mjs critique <file>`.
The kiosk now has a catalog home and its own `kiosk` token axis — **ask it**, do not invent
geometry. 55 kiosk tokens answer with their docblock prose.

---

## 1. The form as it stands today

`src/app/kiosk/v2/KioskRepairPane.tsx` — FOUR steps on `KioskPaneForm` with a
`StepProgressHeader` (X top-left, segments, `n/N` right):

| # | Header | Body | Gate (`repairStepGates`) |
|---|---|---|---|
| 0 | Reason for repair | `KioskReasonStep` → pills + notes | an issue or notes |
| 1 | Device & quote | serial · price (green `Receipt` mark) · notes | serial **and** price |
| 2 | Contact information | phone · name · email · address | phone ≥ 7 digits |
| 3 | Review & sign | `SignaturePad variant="dropoff"` | `canSubmitRepairIntake` |

- Gates: `src/components/repair/repair-intake-logic.ts:93` (`repairStepGates`, 4-tuple).
  PG6 — the header counts SATISFIED units, never the step in view.
- Address is a VISIT fact: written to the session (`actions.setCustomer({ address })`), never
  into `RepairFormData` (`KioskRepairPane.tsx:163`). Do not widen the line form with it.
- Footer, last step: `Save to cart` + an `Add` secondary key with a pencil glyph
  (`KioskRepairPane.tsx:286-296`, `data-testid="kiosk-repair-add-another"`).

---

## 2. WORK ITEM A — the signature must be half height, wider than tall

### The operator's report

> *"It should display the signature at a half height. The problem is the customer will sign
> their signature with their finger and they will move the signature up to the most above the
> second half of the signature and then it will display off the page when printed out. It should
> be half height and so it has a more centered more width than height."*

### Why it happens — both ends of the pipe, verified

**Capture.** `src/components/repair/SignaturePad.tsx:34` — `const PAD_HEIGHT = 200`, applied at
line 216 as an inline `style={{ height: PAD_HEIGHT }}` when `fill` is false. The kiosk mounts it
WITHOUT `fillHeight`, inside `KIOSK_POS_FORM_MEASURE` (`max-w-lg`, 512px), so the canvas is
~512×200. `signature_pad`'s `toDataURL()` exports the WHOLE canvas, empty regions included.

**Print.** `src/app/api/repair-service/print/[id]/route.tsx:315` (drop-off) and `:342` (pickup):

```
style="position:absolute;bottom:2px;left:0;height:90px;max-width:100%;width:auto;
       object-fit:contain;filter:contrast(2.2) brightness(0.55) saturate(0);"
```

`object-fit:contain` at a fixed 90px height preserves the PNG's aspect. A finger signature that
lands in the UPPER half of a 200px-tall canvas therefore prints as ink in the upper ~45px of that
90px box — and because the box is anchored `bottom:2px` against the signature line, the strokes
ride up out of their band. The taller the capture canvas relative to the ink, the worse it gets.

Note the **kiosk receipt** (`src/app/api/kiosk/visit/[id]/receipt/route.ts`) does not render a
signature at all — the `sig-img { height: 48px }` rule at
`src/app/api/walk-in/receipt/[id]/route.tsx:161` is the walk-in receipt, a different surface.
The paperwork print above is the one the operator is describing.

### What to do

1. **Halve the capture height** so the ink fills the box instead of floating in it. Roughly
   `512×100` ≈ 5:1, which is also much closer to the print box's own aspect (a 90px-tall, full-
   width band) — ink then maps nearly 1:1 and cannot drift into dead canvas.
   - `PAD_HEIGHT` is a bare literal today. It is GEOMETRY on a kiosk surface, so it belongs on
     the kiosk axis: ask `ds_tokens kiosk` first, and if there is no rung for it, add the
     constant with a docblock that states WHY (this handoff) rather than leaving a magic 200/100
     in a component. Check whether `variant` should carry it — `default` is the staff pad and
     may legitimately want a different height from `dropoff`.
2. **Re-check the in-pad chrome at the new height.** `SignaturePad.tsx:228-231`: the dashed
   baseline sits at `bottom-10` (40px) and the "Sign above" caption at `bottom-3`. At 200px that
   is a fifth of the pad; at 100px it is nearly half, and the customer would be signing in a
   third of the box — reintroducing the exact problem one altitude down. The baseline and the
   caption have to compress (or the caption move out of the canvas) so the SIGNABLE band is most
   of the pad.
3. **Do not change the print CSS to compensate.** `object-fit:contain` + `max-width:100%` is
   correct and defensive; the defect is the capture aspect. Changing both would hide which one
   was wrong.
4. **Fullscreen path:** `allowFullscreen` mounts the same `canvasArea` inside a full-viewport
   Dialog where `fill` is true (`min-h-0 flex-1`), so it ignores `PAD_HEIGHT` entirely. That path
   produces a TALL canvas and therefore the same clipping. Decide deliberately: either cap the
   fullscreen canvas to the same aspect, or state in the docblock why fullscreen is exempt.
   A ResizeObserver already re-scales on change (`:127`), so an aspect cap is safe.
5. **Existing signatures.** Rows already captured at 200px still print through the same `<img>`.
   Confirm the new geometry does not regress them — `object-fit:contain` means an old, tall PNG
   still fits; it just keeps its old floating-ink look. No migration, no backfill.

### Acceptance

- The drop-off pad is visibly wider than tall, and the signable band is most of its height.
- A stroke drawn near the TOP of the pad prints inside the signature band on
  `/api/repair-service/print/<rs>` — the operator will check this on paper.
- `PAD_HEIGHT` is no longer an unexplained literal.
- No change to the print route's `object-fit` / `max-width`.

---

## 3. WORK ITEM B — `Add` must not cost the operator the whole form

### The operator's report

> *"There's an add button at the bottom right on the signature page, but you then have to
> restart the entire Repair Service Intake Form. How would you have something like that saved?
> Or something like a summarization in a small display for you to review?"*

### Why it happens — verified

`Add` is `onClick={onBack}` (`KioskRepairPane.tsx:292`). `onBack` is `returnToRepairCatalog`
(`src/app/kiosk/KioskShell.tsx:236`) → `setCatalogPhase('browse')`. The pane is passed to
`ProductSelector` as `stageContent`, and that renders it ONLY in checkout:

```
src/components/repair/ProductSelector.tsx:1529
{catalogPhase === 'checkout' && stageContent ? stageContent : browseColumn}
```

So `Add` UNMOUNTS `KioskRepairPane`, and every piece of local state dies with it:
`formData`, `signatureData`, `step`, `activeLineId`, `savedFlash`
(`KioskRepairPane.tsx:70-73`). Nothing is persisted on the way out.

**What DOES survive:** whatever `saveToCart` already wrote (`:182-216`) — the cart line plus
`actions.setCustomer(...)`. And re-entering the pane for the SAME model re-hydrates from that
line (`existingRepair` model-match at `:92-103`, hydration effect at `:127-151`). So:

- `Add` **after** `Save to cart` → lossless, by accident: the cart line is the store.
- `Add` **before** `Save to cart` → everything typed and signed is silently gone. This is the
  operator's bug, and it is worst on step 3, where the cost is a customer's signature.

The signature is the sharpest edge: `signatureData` is local-only until `saveToCart` writes
`signatureDataUrl` into the line payload, so an unsaved signature cannot be recovered at all.

### The decision to make (do not silently pick one — say which and why)

**Option 1 — make `Add` save first.** `Add` means "this device is done, let me add another", so
the honest verb is: commit the current line, THEN return to the catalog. One line change in
spirit, but it must refuse when the line cannot be saved (`canSave` false) rather than commit a
half line — and then the operator needs to be told why, which is really Option 3's summary.

**Option 2 — persist the draft.** Mirror `formData` + `signatureData` into the session store
keyed by `activeLineId ?? 'draft'`, so unmount is lossless and re-entry restores. Strongest
against data loss, biggest surface: it adds a second store of line facts beside the cart line,
and the two can disagree — the exact "two sources of one truth" failure the address field was
kept out of `RepairFormData` to avoid. If you take this, the draft must be DERIVED-FROM /
CLEARED-BY the cart line, never an independent record.

**Option 3 — a review summary on step 3 (what the operator asked for second).** Step 3 is
"Review & sign" but currently shows ONLY the pad: there is nothing to review. Put a compact
summary above the signature — device + serial + quote + reasons + customer — each row tappable
back to its own step, and a visible saved/unsaved state so `Add` is never a blind exit. This
fixes the *reason* the operator loses work (no idea what state the form is in) and is the
smallest honest change to the form's information design.

**Recommended: 3 + 1.** The summary makes the step live up to its name and shows what is at
stake; `Add` committing first (and refusing with the block reason when it cannot) removes the
silent loss. Option 2 only earns its complexity if the operator still loses work after those.

### Constraints for whatever you build

- `KioskPaneForm` has **no title face** and the pane owns ONE band. A summary is BODY content on
  step 3, never a second header or a third band (`kiosk-pane-frame.test.ts` enforces this).
- Facts come from `formData` + `session`; do not re-derive a price or a state label in the
  summary. The cart already has `cartLineCardView` (`src/lib/kiosk/cart-card-view.ts`) deriving
  exactly these facts for `KioskCartLineCard` — reuse it if the summary is a saved LINE, and say
  so in the docblock. A second derivation of the same row is the fork to avoid.
- `getRepairSubmitBlockReason` (`repair-intake-logic.ts:43`) already produces the one-sentence
  reason for every missing field. That is the summary's copy source and `Add`'s refusal text —
  do not write a second set of sentences.
- Any new gate/derivation goes in a pure module with behavioural unit tests in the
  `repair-step-gates.test.ts` mould (7 tests; it pins PG6 and that un-editing takes a segment
  back). Source-shape tests belong in `kiosk-pane-frame.test.ts`.
- Operator ruling still standing: *"add or edit text with a pencil icon, not too many words"* —
  the `Add` key stays a pencil + one word.

### Acceptance

- Pressing `Add` on step 3 never loses a filled form or a captured signature.
- When `Add` cannot proceed, it says why in the existing block-reason sentence.
- Step 3 shows what is being signed for, in a compact display, with a route back to each step.
- The summary states facts it does not own — no second derivation, no second copy deck.

---

## 4. Laws that constrain both items

- **Design MCP before UI writes**; hooks DENY `src/**/*.{tsx,jsx,css}` without a fresh
  `.cursor/design-mcp-session.json` stamp (any `ds.mjs` call refreshes it).
- **`ds_tokens kiosk`** is the counter-tablet axis (55 tokens, docblock prose). Never invent a
  hex, a px radius, or `text-[Npx]`. A token's law lives in its DOCBLOCK — `pinned.json` merges
  by COMPONENT id, so a pin named after a constant merges onto nothing.
- **PG6:** progress is a COUNT of satisfied units, never a pointer
  (`docs/warehouse-os/PROGRESSION-INTERVIEW-LEDGER.md`).
- **M1 / PG12:** progress fills are `scaleX` + `transformOrigin:'left'`, `framerDuration.progressFill`,
  gated by `useReducedMotion`. Never animate width/height/position.
- **One header band per pane**; `KioskPaneForm` renders a step band or nothing.
- **`ds-raw-button`** is the sanctioned escape for a genuinely required raw `<button>`; annotate
  the reason, never raise the guard's baseline.
- **Mobile-first** (`docs/mobile-first/SURFACE_LAW.md`): the kiosk CONSUMES the `/m` SoT. Lists
  on a phone-shaped surface are cards. `verify:fast` runs `Mobile-first` and `Nav names` as
  always-gates.

---

## 5. State of the tree you are inheriting

All of this is landed, `verify:fast` green, 52 kiosk unit/law tests passing, `tsc` clean:

- **Design system roots:** `src/components/kiosk` is a catalogued primitive home and
  `src/app/kiosk/*.ts` is the `kiosk` token axis in `tools/design-mcp/server.mjs`; pins for
  `KioskPaneForm` · `KioskChip` · `KioskCartLineCard` · `KioskCustomerIntake` in
  `src/design-system/pinned.json`; 10 kiosk assertions in `tools/design-mcp/smoke.mjs`.
  Side effect: `ds_critique` stopped false-flagging `KioskChip`'s sanctioned raw `<button>`,
  because fork detection is off where primitives are DEFINED.
- **Repair form:** 4 steps (Device & quote split out of Contact, 2026-09-15); green `Receipt`
  price mark via `KIOSK_POS_ENTRY_ICON*` + the new `icon` slot on `KioskEntryField`; repair
  notes moved onto the same rounded `KioskEntryField multiline` the contact block uses (it was a
  square flush `TextField`).
- **Cart:** on `KioskPaneForm` with a 3-unit stepper (`cart-step-gates.ts`), full-bleed white
  `KIOSK_CENTRE_SURFACE`, X top-left, no sheet wrapper, no drop shadow anywhere;
  `cartMoneySplit` (`src/lib/kiosk/cart-money.ts`) decides Due now / Due at pickup AND which
  terminal key exists — a drop-off takes no money and offers no Pay key.
- **Catalog trail:** ONE search glyph (it opens and closes); `SearchField` gets
  `hideLeadingIcon`; the standalone close X is gone.
- **First paint:** `KioskCatalogFirstPaint` wears trail tokens, no literal paint — this killed
  the bottom hairline that flashed under the header on reload.
- **LCP:** first catalog row is `loading="eager" fetchpriority="high"`
  (`KIOSK_EAGER_TILE_COUNT`); `/kiosk/v2` server-seeds the first 16 tiles into the SSR HTML
  (`src/lib/kiosk/seed-catalog.ts` + `.server.ts`, `export const dynamic = 'force-dynamic'`).
  Production Lighthouse, unseeded: **perf 87 · a11y 100 · best-practices 96 · SEO 92**.
  The seeded re-measure is BLOCKED on the two-Neon-branch env defect in §0, not on code.
- **Seed gotcha, already fixed, do not reintroduce:** a blanket catch around the seed swallowed
  Next's `DYNAMIC_SERVER_USAGE` control-flow throw, so the build declared `/kiosk/v2` static and
  `next start` served a prerender with `seed: null` forever while dev looked perfect.
  `seedKioskCatalog` now rethrows that digest; `seed-catalog.test.ts` pins it.
- The lane has ~1,150 other dirty files from concurrent workstreams (a receiving/station
  refactor is mid-flight and can make `tsc` look red for files you never touched — re-run before
  believing it). Commit path-scoped: `git add -- <paths>` then `git commit -F msg -- <paths>`.

## 6. Open questions the operator has NOT answered

- Should contact information move OUT of the repair line flow entirely and live only on the
  cart? Phone/name/email/address are visit facts and the cart asks for them too, so a mixed
  visit asks twice. Proposed once, not ruled on.
- Does a repair drop-off ever take a DEPOSIT? Answered NO on 2026-09-15 (*"a repair service on
  drop off never takes money off, it just prints out a receipt"*) — recorded here because the
  money split depends on it.
- Paperwork and triage panels still paint their own titled band inside `KIOSK_UTILITY_SHEET`
  while the cart owns its step band. Porting them onto `KioskPaneForm` is the next increment and
  is NOT part of this handoff.

---

## 7. LANDED 2026-09-15 — the decisions taken, and why

`verify:fast` green · 51 kiosk/repair unit+law tests · `tsc` clean · ESLint clean on every
touched file · `ds_critique` clean on all three UI files · `design-mcp/smoke.mjs` all good.

### Item A — signature geometry

**Decision: a RATIO, not a height, and the export is CROPPED to the ink.**

The handoff's halve-the-height step alone does NOT pass its own acceptance. Measured: a stroke
in the top half of a 512×100 pad still prints ≈41px above the line (vs ≈45px at 200px tall),
because `object-fit:contain` scales the dead canvas along with the ink. Cropping the export to
the ink bounds is what actually seats the signature on the line WHEREVER it was drawn. Both
landed; the crop is the load-bearing half.

- `src/lib/repair/signature-geometry.ts` — the pure law: `REPAIR_PRINT_SIGNATURE_BAND` (the
  paper measurement), `SIGNATURE_CAPTURE_ASPECT = 5`, `signatureInkBox()`, `containBox()`,
  `printedSignatureFit()`. 7 behavioural tests in `signature-geometry.test.ts`.
- `src/components/repair/signature-canvas.ts` — DOM half (DPR scaling + the crop draw),
  split out so the component is behaviour and this is pixels.
- `COUNTER_SIGNATURE_PAD` + `COUNTER_SIGNATURE_GUIDE` on the **kiosk axis**
  (`kiosk-counter-surface.ts`, `ds_tokens kiosk` now answers 65). `PAD_HEIGHT` is retired.
  `kiosk-signature-pad.test.ts` pins the `aspect-[5/1]` literal to the constant.
- **ONE aspect, not per-`variant`.** `variant` was considered and rejected as the carrier:
  `default` and `dropoff` print through the SAME 90px band on the same paper
  (`print/[id]/route.tsx` drop-off + pick-up rows), so a per-variant height would be two laws
  for one piece of paper — and it would put a fixed height back in the component, which the
  token docblock and the law test now forbid. The staff pads are protected by MOUNT instead:
  `fillHeight` still fills (`Boolean(fillHeight) && !expanded`), so `RepairIntakeForm`'s 200px
  wrapper and `RepairPickupFlow`'s 260px wrapper render at their own heights, untouched.
- **Fullscreen is NOT exempt** (the deliberate call §2.4 asked for). `expanded` used to set
  `fill`, producing a viewport-tall canvas — the same defect one altitude up. It now takes the
  aspect law, centred, with `max-h-full` as a short-wide-viewport ceiling that can only flatten
  the pad, never make it taller than wide.
- The in-canvas "Sign above" caption is DELETED and the guide is proportional (`bottom-[18%]`,
  was `bottom-10`). The label row already names the act and "Touch to sign" covers the verb, so
  a second in-canvas caption was costing the signable band for nothing.
- **Print CSS unchanged** — verified byte-identical output. `repairSignatureInkHtml()` dedupes
  the two identical inline styles, and `lineHeightPx` now defaults to the band constant (both
  `96` literals gone), so row height and ink height share one source.

### Item A — surfaces the crop changed, named on purpose

The crop changes what EVERY `SignaturePad` consumer receives, so:

- `signatureInkBox` clamps the export to 1:1–6:1. Un-clamped, a horizontal dash crops to ~200:1.
- `/api/walk-in/receipt/[id]` styled `.sig-img { height: 48px }` with **no width bound at all**.
  Now bounded to the same 260px band as the `.sig-line` it replaces, with `max-height` instead
  of a forced `height`. Strictly better for old tall PNGs too (identical rendering), and the
  trailing "Date:" can no longer be pushed off the row.
- `CounterIntakeForm` (`src/components/counter`, `variant="dropoff"`, no `fillHeight`) is the
  one non-kiosk mount that DOES take the new aspect. Correct there — it is the same counter
  tablet, the same finger, and it prints the same band — but it is a visible layout change on a
  staff surface, so it is called out rather than left to be discovered.
- Staff deviation, accepted: the guide moved 40px → 18% (36px on the 200px mount) and the
  in-canvas caption is gone on those pads too. The pad is one component; a per-variant guide
  position would be the same two-laws-for-one-paper fork.
- No migration. Rows captured at 200px still `contain` into the band; they keep their old
  floating look.

### Item B — `Add`

**Decision: Option 3 + 1, as recommended. Option 2 (persist the draft) NOT built.**

- **3 —** `KioskRepairReviewCard` is BODY content on step 3: device + saved/unsaved chip, then
  one tappable row per fact (Reason · Serial · Quote · Customer), each routing back to the step
  that owns it. Pinned in `pinned.json`; registered in `kiosk-chip-family.test.ts`.
- **1 —** `Add` COMMITS then leaves (`saveToCart(true)`), disabled with the block-reason title
  when it cannot. The flash never renders on a dying mount — `onBack()` returns before
  `setSavedFlash`, and the timer is cleared on unmount (a pre-existing leak, fixed).
- **2 rejected:** a draft store beside the cart line is two sources of one truth — the exact
  failure the address field was kept out of `RepairFormData` to avoid. The cart line stays the
  only store and `saved` is DERIVED from it (`isRepairLineSaved`), never tracked as a flag.
- `src/lib/kiosk/repair-review-summary.ts` — `repairLinePayload()` (ONE builder, replacing the
  inline literal in `saveToCart`), `isRepairLineSaved()`, `buildRepairReviewSummary()`,
  `repairPriceToCents()`. 7 behavioural tests. No second derivation: money is the cart's
  `formatCartCents`, the refusal is `getRepairSubmitBlockReason`.

### Still open after this increment

- **The X still discards an unsaved draft.** `Add` is now lossless; the step band's X is the
  deliberate abandon verb and was left alone. If the operator loses work there, that is where
  Option 2 (or a commit-on-exit-when-savable) earns its complexity.
- **`Add` is disabled on an incomplete form**, so step 3 then has no enabled secondary key —
  the X is the only way out. Intended (it cannot commit a half line), but worth watching.
- **The Continue key sits behind the iOS keyboard.** Operator 2026-09-15: *"I would have to
  close the keyboard then press the continue button."* `KioskPaneForm`'s floor is a flex row at
  the bottom of a `h-full` column and iOS Safari overlays rather than resizes. Recommended fix
  (NOT landed, awaiting the ruling): consume the existing `src/hooks/useKeyboard.ts`
  (`visualViewport`, already written and unused on this surface) in `KioskPaneForm` so the floor
  rides above the keyboard with matching scroll clearance — one edit, every pane inherits it —
  plus `enterKeyHint` + a per-step `<form onSubmit>` so the keyboard's own key advances. The
  keyboard key alone is NOT sufficient: phone and price use `inputMode`/`tel`, and the iOS
  Number Pad has no Return key.
- `pinned.json` carries concurrent uncommitted work from other workstreams (the four kiosk pins
  among them). The `KioskRepairReviewCard` entry is a 5-line textual insertion; commit
  path-scoped and do not sweep the rest.
