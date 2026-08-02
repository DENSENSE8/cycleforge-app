# Plan B — Unbox step procedure + Playwright coverage

**Lane:** B · **the restructure lane** · land **after** A and C
**Surface:** capture stack step machine, photo intent, `LineEditPanel` composition
**Date:** 2026-07-31 · `main` @ `1c226847d`
**Depends on:** `unbox-capture-stack-PLAN.md` Phases 0–2 (the `CaptureStack` primitive must exist)

> ## SUPERSEDED IN PART — 2026-08-01
>
> **The step-vocabulary half shipped; the restructure half is dead on the operator's verdict.**
>
> - **Shipped:** the data-driven vocabulary (`derive-capture-step-states.ts`), B2's `unbox_carton`
>   fold, the ungated condition step, and 5 of the 8 coverage rows
>   (`tests/e2e/unbox-procedure-checklist.spec.ts`). The procedure renders as the **Checklist
>   display** in the Displays push column (`UnboxProcedureChecklist`), and replaced the
>   org-editable checklist outright.
> - **Rejected:** the bottom-anchored capture stack in the work surface (*"completely terrible"*,
>   `UnboxCaptureStack` deleted `33a3eb609`) and the ambient right-rail card (*"an absolutely
>   terrible display"*). Everything below about one-card-above-the-input, push-up collapse, and
>   the back/forward pager describes a surface that will not be built.
> - **Permanently out of scope** with it: back/forward, the multi-qty `n of N` **loop** (`n of N`
>   survives as a row summary), and the 50-row scroll-depth assertion.
> - **What remains** is two slices — the desktop item-photo affordance (B1) and three Playwright
>   rows — carried by the rewritten
>   [`unbox-B-step-procedure-EXECUTION-PROMPT.md`](./unbox-B-step-procedure-EXECUTION-PROMPT.md).
>   That prompt wins over this plan on every conflict.

---

## The requested step sequence

1. **PO / box photos** — the carton as it arrived
2. **Packing material** — dunnage, void fill, condition of the packaging
3. **Item photos** — the products themselves, out of the box
4. **Condition grading** — per item
5. **Serial scanning** — per item

Each step: one card, expanded, directly above the input. Completed steps collapse to one line and push up. Back/forward moves between steps without losing state.

---

## Blocker resolutions (operator, 2026-08-01)

Both blockers below are **closed**. The original analysis is kept for rationale; these decisions win.

- **B1 → no desktop camera.** The phone stays the capture device (existing mobile components,
  used as-is). The desktop step card gets an **upload-from-computer `+` control scoped to that
  step's stage**. "Build the desktop item camera" is out; wiring `receivingLineId` +
  `photoStage="unbox_item"` into the existing pill is in.
- **B2 → fold packing material into `unbox_carton`.** No new stage; `stages.ts`, the write matrix,
  `photo-intent.ts`, `display-names.ts` and the timeline glyph map are all untouched. The step
  **does** exist on both the mobile and the desktop surface — folding is about the *stage it
  writes*, not about dropping the step.
  - Consequence for the bench, and the reason the fold is clean: the requested sequence maps
    one-to-one onto the three stages that already exist —
    **PO / box photos → `arrival_package`** (shot at the door / Triage; on the Unbox bench this
    step *verifies* that evidence, it does not capture it), **packing material → `unbox_carton`**
    (the bench's own carton capture, which is exactly "the carton after opening"), and
    **item photos → `unbox_item`**.
  - **The bench still never writes `arrival_package`.** That stage is the pre-opening insurance
    shot and `require_one` counts only it (`photo-policy.ts:149`). Step 1 on the bench is
    read-and-verify; every bench capture lands on `unbox_carton` or `unbox_item`.
- **Feed scope → per carton** (capture-stack PLAN §5): the ledger clears on carton open.

## Background on the two blockers (resolved above — kept for rationale)

### B1 — why "no desktop camera, upload instead" is the cheap answer

`LineEditPanel.tsx:620-626` states it in the code: *"Item evidence (RECEIVING_LINE + receiving_item) currently has NO desktop capture surface."*

`ReceivingPhotoButton` documents an item mode (`receivingLineId` + `photoStage="unbox_item"`, `:5-8`, `:88-93`) but **no call site passes `receivingLineId`** — `CartonContextCard:623-630` passes only `receivingId`.

Per the resolution, the desktop gets an **upload-from-computer `+` scoped to the step's stage**, not a viewfinder; the phone remains the capture device via the existing mobile routes. Mechanically this is the same unused `ReceivingPhotoButton` item mode — the affordance differs, the wiring is identical. **The stage must still be threaded explicitly at every call site** (`.claude/rules/backend-patterns.md` — a safety classification is never defaulted); add a wiring guard.

### B2 — why folding into `unbox_carton` is clean

`src/lib/photos/stages.ts:42-59` — `PHOTO_EVIDENCE_STAGES` is exactly:
`arrival_package · unbox_carton · unbox_item · testing · packing`

There is no `packing_material`, and per the resolution none is added. The three requested photo steps map one-to-one onto stages that already exist, so `stages.ts`, the write matrix, `photo-intent.ts`, `display-names.ts` and the timeline glyph map are all untouched.

**The bench still never writes `arrival_package`.** That stage is the pre-opening insurance shot and the `require_one` receive gate counts only it (`photo-policy.ts:150-164`); step 1 on the bench is read-and-verify. `docs/todo/dock-receiving-vs-unbox-GEMINI-RESEARCH-BRIEFING.md` documents what a mis-threaded stage default already cost once — the Playwright matrix below pins it.

---

## Step vocabulary must be data-driven

Hardcoding the five steps will break immediately on:

- **Unfound cartons** — classify/match comes first; there is no PO to photograph against.
- **Local pickup** — `isLocalPickupFulfillment(row)`; no carrier packaging.
- **Returns** — serial scanning may precede grading (the serial identifies which unit is being graded).
- **Multi-qty lines** — steps 3–5 are a **loop over N units**, not single steps (`ActiveLineConditionSerial.tsx:94` branches on `quantityExpected > 1`).

Compose `deriveLinearStepStates` (`derive-receiving-step-states.ts:97-113`) — the shared walk that already serves matched and unfound flows. Each intake type supplies its own `LinearStepFlag[]`. **This is a sibling vocabulary over the shared primitive, not a forked stepper** (the module's own doc comment says so).

**Condition stays ungated** (`derive-receiving-step-states.ts:47-55`): it renders as an already-satisfied row showing the default grade, and the active-step pointer skips it. Tapping it or scanning a condition token edits it. Do not make it a blocking gate.

## Back / forward navigation

- Horizontal pager: `tabPagerVariants` (`motion-framer.ts:659`) + `framerTransition.tabPager` / `tabPagerReduced` (`:346-357`), through `useMotionTransition`.
- **Never** `card-fan-carousel` — image-only, GSAP-driven, quarantined.
- Moving back must **not** discard captured data. Steps are a view over durable state, not a wizard buffer.
- Enter = submit-and-advance in the scan input. It does **not** commit the carton until the terminal step.

---

## Playwright coverage

**Against the QA org, never the dogfood tenant** (`.claude/rules/verify.md`): `pnpm provision:qa-org` → `npx playwright test <spec> --project=qa-desktop`, asserting on `QA_FIXTURE_*` from `src/lib/tenancy/qa-org.ts`.

**Extend, do not orphan, the existing specs** (24 receiving/unbox specs exist):
`receiving-scan-resolution.spec.ts` · `receiving-serial-absent.spec.ts` · `unbox-nas-photos.spec.ts` · `unit-photo-scan.spec.ts` · `receiving-silent-print.spec.ts` · `unbox-receive-zoho-push.spec.ts` · `unbox-open-purges-arrival.spec.ts`

New coverage required — **settled 2026-08-01**. Five rows landed against the Checklist display, three
are permanently out of scope (they assert behavior of the deleted capture stack — a passing test for
a surface that does not exist is worse than none), and the last two landed with the item pill:

| Spec | Asserts | Outcome |
|---|---|---|
| Step order | The intake type's vocabulary renders in order; exactly one step is active | ✅ `unbox-procedure-checklist.spec.ts` |
| Push-up | Completing a step advances the pointer without reordering the list | ✅ same spec (restated for a list, not a stack) |
| ~~Back/forward~~ | ~~Navigating back and returning preserves captured data~~ | ❌ out of scope — no pager exists |
| ~~Multi-qty loop~~ | ~~`n of N` advances per unit; the loop completes only at N~~ | ❌ out of scope — `n of N` is a row summary, not an iterating step |
| Photo stage integrity | Carton captures write `unbox_carton`, item captures write `unbox_item`; **no bench capture writes `arrival_package`** | ✅ carton leg in `unbox-procedure-checklist.spec.ts`; item leg in `unbox-item-photo-capture.spec.ts` + source guard `item-photo-wiring.guard.test.ts` |
| Condition skip | A default-grade carton's active pointer lands on the serial step, not condition | ✅ `unbox-procedure-checklist.spec.ts` |
| ~~Scroll~~ | ~~The current step stays one row above the input with 50 history rows~~ | ❌ out of scope — no bottom-anchored stack |
| Focus | Wedge scan lands in the input after every submit; the focus hotkey returns focus to the scan bar | ✅ `unbox-scan-focus.spec.ts` |

**The focus hotkey is read from `DEFAULT_FOCUS_SCAN_HOTKEY`, never typed.** This table said "F2" for
months while the code has always defaulted to `Insert`; the spec imports the constant so it tracks the
binding instead of restating a guess (`.claude/rules/display/station.md` §3).

Assert on **invariants, not samples** — for a virtualized/windowed stack the last DOM row may be outside the render window; measure the scrollport edge.

---

## Out of scope

- Label printing and per-item notes → **lane C**.
- Identity header rows → **lane A**.
- Migrating other stations onto the stack → after this lane proves out.

## Verification

- `npm run verify` green; no baseline raised.
- ~~`station.md` amended **before** the input moves~~ — **not needed.** §2 (scan bar pinned top) and
  §5 (card replaces, never accumulates) were only threatened by the capture stack, which never landed.
- Desktop wedge + mobile keyboard both verified against `:3050` (attach only).
