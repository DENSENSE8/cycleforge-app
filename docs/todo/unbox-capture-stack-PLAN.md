# Unbox capture stack — execution plan (rev. 3)

**Date:** 2026-07-31 · **Repo state:** `main` @ `1c226847d`
**Supersedes:** `unbox-input-locus-PLAN.md` rev. 1 (top-anchored input) and rev. 2 (bottom transcript, pre-motion-scan).
**Decided by the operator:** **all stations migrate onto this model.** Rev. 2's Ask-first #1 is closed.

---

## 0. What this is

A universal **bottom-anchored capture stack**: the input is the anchor at the absolute bottom; the current task sits immediately above it; every completed action collapses to a single-line bar and is pushed up into a scrollable ledger. One grammar from phone to desktop — the viewport changes how much is *simultaneously visible*, never the structure.

```
┌─ scrollable history ─────────────────────────┐
│  ✓ Scanned    · TRK 4821          (collapsed)│  ← pushed up, 1 line each
│  ✓ Condition  · A (default)       (collapsed)│
│  ✓ Serial     · SN-9910           (collapsed)│
├──────────────────────────────────────────────┤
│  ‹  ▸ PHOTOS — current task card  ›          │  ← horizontal pager, prev/next
├──────────────────────────────────────────────┤
│  [ scan / tap ____________________________ ] │  ← anchored input
└──────────────────────────────────────────────┘
```

**Vertical axis = time** (history, collapsed). **Horizontal axis = step selection** (current task, expanded). They are different axes on purpose — that is what keeps the current task one row from the input no matter how deep the history gets.

---

## 1. Motion-stack deep scan — what is buildable

Scanned `src/design-system/foundations/motion-framer.ts` (942 lines), `motion-framer-hooks.ts`, `motion-major.guard.test.ts`, `station-motion-bridge.guard.test.ts`, and `package.json`.

### 1.1 Every motion this design needs already exists as a named preset

| Need | Existing SoT | Notes |
|---|---|---|
| Completed row **pushes up** | `framerPresence.stationSerialRow` (`:461-465`) | `initial {opacity:0,y:6} → animate {y:0} → exit {opacity:0,y:-4}` — **it already exits upward.** This is literally the preset. |
| Sibling reflow as rows stack | `layout="position"` + spring | Already in `MobileFeed:82-99` (`damping:28, stiffness:340, mass:0.55`) |
| Expanded → collapsed summary | `framerPresence.collapseHeight` (`:452-456`) | The **only** sanctioned height animation (`display/motion-crossfade.md`) |
| Horizontal step pager | `tabPagerVariants` (`:659`) + `framerTransition.tabPager` (`:346-350`) | `x` slide + opacity, `[0.32,0.72,0,1]`; `tabPagerReduced` fallback already authored |
| Reduced motion | `useMotionPresence` / `useMotionTransition` | Mandatory — see 1.3 |

**No new preset is required.** If one is, it goes in `motion-framer.ts`, never inline.

### 1.2 GSAP / Moti — rejected, and this is not a style opinion

The proposal suggested GSAP or Moti for the upward push. Against the code:

- **`motion-major.guard.test.ts` runs in CI** (`npm run test:ds-guards`) and enforces exactly one framer-motion major plus "app code does not import `motion/react`". A second animation runtime is a guard failure, not a preference.
- **GSAP is already installed but quarantined.** Its *only* consumer in `src/` is `src/components/ui/card-fan-carousel.tsx:4` — an image-only fan (`CardItem { imgUrl, alt, linkUrl }`) used by `PhotoPeekFan` and a design demo. It is not the house motion language and must not become one.
- `build-gotchas.md` → *"Motion stack: one framer-motion major"*; `kinetic-ledger.md` bans importing a foreign kit.

The upward push is `translateY` + opacity + `layout` — framer-motion does this natively and it is what every existing station card already uses. **There is no capability gap to justify a second runtime.**

### 1.3 The bridge is guard-enforced, not advisory

`station-motion-bridge.guard.test.ts` pins a list of station/DS primitives that **must** route presets through `useMotionPresence` / `useMotionTransition`. Any new stack primitive that owns entrance motion joins that list. Spreading raw `framerPresence.*` is a CI failure.

### 1.4 `card-fan-carousel` is **not** the horizontal pager

It is image-only, fan-shaped, and GSAP-driven. The horizontal step pager composes `tabPagerVariants` instead. Do not repurpose the fan.

---

## 2. The primitive already exists — promote, do not build

The proposal named two new files: `StationTimelineShell` and `UnboxStepTimeline`. Both duplicate a primitive that ships today.

`src/components/mobile/feed/` already implements the whole pattern:

| Requirement | Owner | Line |
|---|---|---|
| Current task expanded, directly above input | `MobileFeed.expandLast` | `:24`, `:88` |
| Completed rows collapsed | `MobileFeedRowContext.variant` | `:9` |
| Short lists pin to bottom | `mt-auto` spacer | `:71-77` |
| Push-up motion + sibling reflow | `LayoutGroup` + `layout="position"` + spring | `:81-105` |
| Reduced motion | `useReducedMotion()` → `layout={false}`, `duration:0` | `:59`, `:100` |
| Row order newest-at-bottom | `useFeedWindow({ anchor:'bottom' })` | `useMobileFeed.ts:68-69` |
| **Auto-scroll to bottom** | `useFeedWindow` | `useMobileFeed.ts:72-85` |

Building `StationTimelineShell` beside this is the page-local fork `pattern-evolution.md` bans. **Promote and rename instead.**

- `MobileFeed` + `useMobileFeed` + `MobileRowCard` → `@/design-system/components` as **`CaptureStack`**. They move as **one unit** — split them and bottom-anchoring breaks (the behavior lives in two files).
- **Five consumers**, all must stay behavior-identical: `MobilePackingList`, `MobileReceivingList`, `PickQueue`, `Receive`, `UniversalScan` (+ `MobileRowCard` in `MobilePackingRow`, `MobileReceivingRow`).

### 2.1 `flex-col-reverse` — rejected

The proposal suggested it. `useFeedWindow:68-69` already reverses row order and `:72-85` already auto-scrolls; `MobileFeed` deliberately uses an `mt-auto` spacer instead, with the reason in-comment (`scrollTo(bottom)` only works once the list overflows). `flex-col-reverse` additionally breaks keyboard/scroll a11y. Do not introduce it.

---

## 3. Density — the question, answered

> *Will historical blocks remain fully expanded, or collapse into dense single-line summaries?*

**Collapse to single-line summaries.** Four independent reasons converge:

1. **The primitive already does it** — `variant: 'collapsed' | 'expanded'`, only the last row expanded.
2. **House law** — one-row anatomy (`ui-design-system.md`): title → meta → chips(right), `truncate`, constant `py-1.5`.
3. **The operator's own instruction** — *"only the step that is displaying is what's needed."*
4. **It is the mitigation for the desktop ergonomic friction** (§4).

Expanded history is not an option: on a phone, three expanded steps push the current task off-screen — the exact failure this design exists to prevent.

---

## 4. Desktop ergonomic friction — honest position

The friction is real and was correctly raised: on a 24″ monitor with a standing operator, a bottom-locked input separates the physical focal point (product in hand) from the digital one.

**Collapse is what bounds it.** Because history rows are single lines and the current task is one row above the input, the *entire* active zone — ledger tail, current task, input — occupies a compact band at the bottom of the screen. **The input↔current-task distance is constant (~1 row) regardless of history depth.** The eye does not traverse the monitor per scan; it traverses it only when the operator *chooses* to review history, which is rare and deliberate.

What we are trading: reviewing deep history costs an upward glance on desktop. What we get: one grammar, zero fork, and a phone-viable bench. Given the operator's explicit mobile-first mandate, that trade is theirs to make and they have made it — but Phase 2's bench trial exists to measure it, not to assume it.

---

## 5. The `station.md` contract change — the largest risk, stated plainly

`.claude/rules/display/station.md` currently dictates:

- §2 — scan bar **pinned at the top**, sticky.
- §5 — *"One card. The new scan's card **replaces** the previous one"* via `AnimatePresence mode="wait"`; explicitly *"there are never two cards on screen, which would imply a list the operator must choose from."*

This design inverts both. That is a **rule change, not an implementation detail.** It must be made deliberately in `station.md` with rationale, in its own commit, before Phase 3 — not discovered afterward as a guard failure.

**Open question the operator must answer before Phase 3:** does the feed accumulate **per carton** (clears on the next carton) or **per shift** (continuous chat history)?

Our recommendation: **per carton.** The steps *are* that carton's work; §5's act-and-clear contract survives if the ledger is carton-scoped. Cross-carton history already has two homes — the recent rail and `EventTimeline` (`display/reference-timeline.md`) — and duplicating it in the stack would be a third. Per-shift accumulation also unbounds the scroll region, which breaks §4's ergonomic mitigation.

---

## 6. Phases

**Phase 0 — dead-tail removal.** Delete `submitSerialScan` + its unused state from `useSerialScan.ts`; rename to `useReceivingReturnsBanner`. Keep `armedLineId` (shared — `usePoContext.ts:36-57`, `scan-apply.ts:273`, `useTrackingScan.ts:163/552/646`) and keep `serialInputRef` (Phase 3 attaches it). Free, no UX change. **Note the rationale correction:** this does *not* "enforce a single input locus" — `submitSerialScan` has zero call sites and the sidebar renders no serial input, so it is already single. This is hygiene.

**Phase 1 — promote the primitive.** Feed module → `CaptureStack` in `@/design-system/components`, behavior byte-identical, five consumers updated. Add `capture-stack.guard.test.ts` pinning bottom-anchoring, `expandLast`, and auto-scroll. Join `station-motion-bridge.guard.test.ts`.

**Phase 2 — the stack, read-only.** ✅ **LANDED 2026-08-01.** Mount as the Unbox center rendering the step vocabulary, **no input yet**; accordion still captures. Proves row anatomy, collapse density, push-up motion, and §4's ergonomics on real cartons at zero risk.

**Phase 3 — capture moves in.** Pinned input; wire `c.enqueueSerial` (existing write waist); attach `serialInputRef` so `scan-apply.ts:78` stops being a no-op; register F2. Remove capture from `LinePoItemsSection.tsx:216`. Add the horizontal step pager (`tabPagerVariants`). **`station.md` amended first.**

**Phase 4 — collapse the tab strip into the right panel.** Seven of nine tabs (`classify · listings · po-note · checklist · support · tracking · timeline`) plus PO pairing move to the record plane.

**Phase 5 — condition row + bench barcode.** Defaulted row, `detectStationScanType`-style token (`station-scan-routing.ts:15`).

**Phase 6 — mobile mount + station rollout.** `MOBILE_ALLOWED_PREFIXES` (`sidebar-navigation.ts:208`); E2E on the **QA org**. Then Testing → Triage → Shipping → Pack, per the all-migrate decision.

Sequencing: 0 → 1 → 2 → **bench trial** → 3 → **bench trial** → 4 → 5 → 6.

**Status (2026-08-01):** Phases 0, 1, 2 are landed (uncommitted). Phase 2 shipped the
step-vocabulary SoT (`derive-capture-step-states.ts`, a third sibling over
`deriveLinearStepStates`), per-stage photo counts
(`useReceivingPhotoStageCounts`), and the read-only mount above the Unbox
accordion. **Bench trial RUN 2026-08-01** — measured half green, ergonomic judgment outstanding.

What the read-only trial already caught on a real carton (both fixed + pinned):
an ungated step (Condition) entered the ledger *before* the pointer reached it,
so a fresh carton opened claiming "Condition · NEW" as completed history; and the
step number rendered from the row index, labelling Classify as step 2. Rule 4 in
`deriveCaptureStackRows` and `row.position` are the fixes. This is exactly the
class of bug Phase 2 exists to surface before capture moves in.

**Bench trial results (2026-08-01), measured on the QA org:**

| Claim | Result |
|---|---|
| §4 constant input↔task distance | **Holds.** Active card sits 12px above the scrollport bottom at both 3 and 6 ledger rows — measured at the scrollport edge, not the last DOM row. |
| Collapse density | **Holds.** Completed step 41px, active card 74px. |
| Push-up | **Holds.** Completing a step collapses it and promotes the next below it. |
| Photo stage integrity | **Holds.** A bench `unbox_carton` shot leaves `arrival_package` unsatisfied, so `require_one` is intact. |
| Condition skip | **Holds.** Pointer lands on Serial, never on the defaulted grade. |
| Reduced motion | **Renders.** No layout animation; opacity-only path taken. |
| Desktop ergonomics on a standing bench | **OPERATOR JUDGMENT — not measurable here.** |

Three defects the trial found (all fixed + pinned):
1. Ungated Condition entered the ledger before the pointer reached it.
2. Step number rendered from the row index (Classify read "2").
3. Un-hydrated photo counts read as "nothing shot", so the stack painted a
   confident wrong active step for one beat and then jumped. Now gated on
   `settled`; the first fix for that then hung the stack forever on rows whose
   carton id had not hydrated (query disabled ⇒ never settles), which the
   repeat-run stability check caught.

Plus one unrelated production bug: `POST /api/receiving-photos` 500'd on every
successful attach — an em dash in the `Deprecation` response header is not a
valid ByteString, so the response threw *after* the photo, audit and count had
already been written. One-character fix.

Coverage: `tests/e2e/unbox-capture-stack.spec.ts` (5 tests, 10/10 across repeat
runs on `qa-desktop`) + 20 unit tests on the vocabulary.

---

## 7. Verification

- `npm run verify` green per phase. **Never raise a ratchet baseline** — if `station-workbench-chrome.guard.test.ts` must change shape, change it deliberately in its own commit with rationale.
- **Desktop:** hardware wedge scan auto-focuses the bottom input; no focus loss after submit; F2 returns focus.
- **Mobile:** input sits above the keyboard in the thumb zone; history scrolls cleanly; no layout jump on keyboard open.
- **Reduced motion:** stack settles with opacity only, no `y` travel, no layout animation.
- **Depth:** 50-row history keeps the current task one row above the input.

---

## 8. Corrections to prior revisions

| Claim | Correction |
|---|---|
| "Two call sites" for the feed primitive (rev. 2) | **Five**, plus `MobileRowCard`'s two |
| "Auto-scroll must be built" (rev. 2 risk 5) | **Already exists** — `useMobileFeed.ts:72-85`. Pin it, don't build it |
| "Deleting `useSerialScan` enforces one input locus" | It is already dead code; this is hygiene, not enforcement |
| "Use GSAP/Moti for the push" | CI-blocked by `motion-major.guard.test.ts`; no capability gap |
| "Build `StationTimelineShell` / `UnboxStepTimeline`" | Duplicates `MobileFeed`; promote instead |
| "Use `flex-col-reverse`" | Order + auto-scroll already solved; breaks a11y |
