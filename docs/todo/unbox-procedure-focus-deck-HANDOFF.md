# Unbox procedure — FOCUS DECK refactor · HANDOFF

**Date:** 2026-08-02 · **Lane:** WS-DOGFOOD (`main`, uncommitted) · **Status:** R1–R6 landed in the
tree and unverified; the surface is now being **re-shaped** on operator instruction.
**Supersedes the geometry of:** [`unbox-procedure-column-FIX-HANDOFF.md`](./unbox-procedure-column-FIX-HANDOFF.md)
(R1–R6 — its *defect analysis* still stands; its flat-column geometry does not).
**Design source:** [`unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md`](./unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md)
§4 (the depth pile) — the operator has now **ruled on it**, in favour of the pile.
**Binding rules:** [`unbox-procedure-chat-progression-GROK-RULES.md`](./unbox-procedure-chat-progression-GROK-RULES.md) ·
[`display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) ·
[`display/motion-crossfade.md`](../../.claude/rules/display/motion-crossfade.md)

---

## 0. Read this first — the ruling that changes everything

The briefing asked Gemini to rule on whether an Apple-Watch depth pile was right here, and every
rule file in the repo currently says **no**: `ProcedureColumn.tsx`'s docblock, `station-workbench.md`
and the GROK rules all ban occlusion and z-stacking outright, on the strength of two deleted
attempts (`UnboxCaptureStack` at `33a3eb609`, and the depth pile).

**The operator has overruled that ban.** The surface becomes a **Procedure Focus Deck**: a
single-focus card stack with real depth — z-index, translateY, scale and opacity by distance from
focus — inverted relative to watchOS and anchored to the bottom.

> **So the FIRST task is to rewrite the source-of-truth component and the rules that blocked it.**
> Not to work around them. A rule file that forbids the code in the tree is worse than no rule
> (GROK-RULES §0). The ban does not simply disappear either — it is *re-scoped*, and §3 below says
> exactly what survives it and why.

---

## 1. Where the tree is right now

Everything below is **uncommitted** on `main` and **was never typechecked, never linted, never run
in a browser** — the session was interrupted before `npx tsc --noEmit`. Treat all of it as unproven.

The tree also holds **other sessions' work**. Files under `src/components/station/*grid*`,
`ReceivingProgressStepper.tsx`, `ZohoSplitPane.tsx`, `MovePhotosBetweenPoPanel.tsx`,
`incoming-grid-*`, `receiving-grid-*` and the untracked `ScanStationProgress*` /
`UnboxScanProgressControl.tsx` are **not** part of this work. Attribute before you fix
(`workflow-safety.md`).

### 1.1 R1–R3, R5, R6 — landed, geometry now partly superseded

| # | Change | Files | Fate under the deck |
|---|---|---|---|
| R1 | Deleted the nested scroll port — no `flex-1`, no `overflow-y-auto`, no `overscroll-contain`, no `snap-y snap-mandatory` on the `<ol>`, no `snap-start snap-always` on the sections. Collapsed `<section><ol>` to one `<ol>`. Dropped the DS→app `STATION_WORKBENCH_COLUMN` import. `scrollIntoView` `block: 'start'` → `'nearest'`. | `ProcedureColumn.tsx` | **KEEP.** This was the actual bug and it is orthogonal to the pile. The host owns the scroll; the deck is content. |
| R2 | New opt-in `bodyAlign?: 'start' \| 'end'` on `StationWorkbench` → `flex min-h-full flex-col justify-end` on the body column; `LineEditPanel` passes `bodyAlign="end"`. `min-h-full` lives on the body column and NOT on the child because a percentage min-height only resolves against an ancestor with a definite height, and the scroll port is the nearest one. | `StationWorkbench.tsx`, `LineEditPanel.tsx` | **KEEP — it is now load-bearing.** The deck's focus slot is the bottom of this body. |
| R3 | Deleted `PROCEDURE_STEP_ACTIVE_MIN_HEIGHT` (`min-h-[12rem]`). `PROCEDURE_STEP_FACE_HEIGHT` (`h-[4.5rem]`) stays. | `ProcedureColumn.tsx` | **KEEP.** |
| R5 | Replaced the absolutely-positioned `rounded-l-[inherit]` accent rail with `border-l-4` + a `HUE_BORDER` map; `stepAccentClass` → `stepBorderClass`. | `ProcedureColumn.tsx`, `step-face.tsx` | **REVERSE — see §4.** The operator wants the left edge gone and the hue moved into a light card fill. The `rounded-*-[inherit]` *lesson* still becomes a rule (§6.4). |
| R6 | Cut the prev/next neighbour chips and the now-orphaned `prevKey`/`nextKey` from both `ProcedureColumn` and `useUnboxProcedureSteps`. | `ProcedureColumn.tsx`, `UnboxProcedureColumn.tsx`, `useUnboxProcedureSteps.ts` | **KEEP.** The deck advances by evidence and by click; chips are a third input model. |

### 1.2 R4 — the label step. Landed, and the migration is APPLIED.

**`src/lib/migrations/2026-08-02_receiving_line_label_previewed.sql` has been applied to the
dogfood database** (`node scripts/run-pending-migrations.mjs --only …`; the runner reported 0
pending before and applied exactly this one). It adds nullable
`receiving_line_testing.label_previewed_at` + `label_previewed_by`, no backfill, with a documented
rollback. **Do not re-apply, do not edit the file** — an applied migration is immutable (the ledger
is keyed `(filename, sha256)`). A follow-up change means a new dated file.

The gate question the fix-handoff left open was answered **(a)**, and the reasoning is in the
migration header. In one line: `label_note` says the face was *customised* (null on most cartons →
parks the pointer forever), `label_printed_at` is the *commit* act the dock owns (gating a capture
step on it inverts the phase order), so the step gets a fact of its own — the same shape as
`receiving_unbox.contents_confirmed_at`.

Code half, all landed and all unverified:

- `drizzle/schema.ts` — `labelPreviewedAt` / `labelPreviewedBy`.
- `lib/stations/procedure.ts` — `label` declared as the **last `capture` step**, after `serial`.
- `derive-capture-step-states.ts` — `label` in `CaptureStepKey` + `GATED_KEYS` + a gate case;
  `labelPreviewedAt: string | null` added to `DeriveCaptureStepStatesInput` as a **required** field.
- `receiving-line-row.ts` — `label_previewed_at?: string | null`.
- `lines/build-sql.ts` (3 sites) **and** `lines/legacy-route-sql.fixture.ts` (3 sites) — byte-identical
  `rlt.label_previewed_at::text AS label_previewed_at`. These two must stay identical; a
  parity test compares them.
- `procedure-receipt-resolve.ts` — `LineRow` field, SQL select, gate fold (`every` + a length guard),
  and a `label` evidence entry.
- `audit-logs.ts` — `RECEIVING_LABEL_PREVIEWED` / `RECEIVING_LABEL_REOPENED` (paired, so a rollup
  cannot count a retraction as a confirmation).
- **New route** `src/app/api/receiving/lines/[id]/label-previewed/route.ts` — `withAuth` +
  `permission: 'receiving.mark_received'` (same gate as the sibling `contents-confirm`; minting a
  new permission nobody's role grants is the `integrations.zendesk` failure). Overwrites rather than
  COALESCEs, because re-reading an edited face is a new acknowledgement.
- `steps/LabelStepBody.tsx` (new) + `steps/index.ts` registry entry + `steps/types.ts` `labelSlot`.
- `step-face.tsx` — `label: { Icon: Printer, hue: 'violet' }` (identity family, beside `classify`
  and `contents`).
- `unbox-tabs.tsx` — the standalone `<UnboxLabelPreview>` sibling is **deleted**; it is now
  `labelSlot`. That is what fixed the preview sliding under the composer: it sat outside the stack
  the dock reserves clearance for.
- `useUnboxProcedureSteps.ts` — feeds `labelPreviewedAt`, and a `'Checked'` summary.

### 1.3 What was never done

- `npx tsc --noEmit` / `npm run lint` / `npm run verify` — **none ran.**
- `npm run audit-route-auth -- --emit` — the new route is **not** in
  `docs/security/route-permissions.json`, so the route-auth drift gate will fail until it is.
- `derive-capture-step-states.test.ts` and any receipt guard fixture still miss the now-required
  `labelPreviewedAt` field → typecheck failures waiting.
- The rule-file edits the fix-handoff §2 asked for (scroll ownership, reserved height, bottom-pin,
  `rounded-*-[inherit]`) — **not written.** §6 below replaces that list.
- Zero browser verification. The dev server was up on **`:3050`** (attach, never start).

---

## 2. The ruling — Procedure Focus Deck

One sentence, for the docblock:

> **A single-focus card deck: the active step owns the focus slot at the bottom against the
> composer, completed steps read upward as a chat-style history, and upcoming steps sit *behind and
> below* the focus card as watchOS-style peeks that rise bottom→top into focus as the work
> advances.**

### 2.1 Geometry — the operator's words, decomposed

> "mobile and chat like display history, the history is at the top and moved on and next step,
> moves bottom to top, upcoming steps are behind and below the most active card"

| Zone | Position | Treatment |
|---|---|---|
| **History** (settled: `done` / `skipped`) | above the focus card, **vocabulary order, top→bottom**, oldest highest | Chat-transcript rows: **full title row** — glyph · label · summary · state mark · time. Not slivers. Clickable to reopen. |
| **Focus** (the active step) | the deck's **bottom** edge, adjacent to the composer dock | Full size, `scale 1`, `opacity 1`, highest z. **The only card with a body.** |
| **Upcoming** (`pending`, after the active one) | **behind and below** the focus card | watchOS peek pile: each layer tucked under the focus card's bottom edge with a small offset, scaling and fading with distance, z decreasing monotonically. |

On advance the next card **travels bottom→top into the focus slot** and the outgoing focus card
joins the history above it. That is the chat metaphor and it is why the history is a transcript
rather than a pile: a chat log does not stack its past messages behind one another.

### 2.2 Peek depth — the operator's second answer

> "watch os first and keep full title row for if revert and update is needed"

- **Upcoming peeks use the watchOS sliver geometry** (~12–16px offset per layer, ~2–3 visible
  layers, then the rest compressed behind). Tight, physical, unmistakably a deck.
- **The full title row is never destroyed** — it is what the card wears the moment it is not
  occluded: in the history above, on hover, and when a peek is promoted. That is the "if revert and
  update is needed" clause: an operator must be able to *identify* a step in order to click back
  into it, so the title survives even though the sliver hides it while it is queued.

**Build the sliver first**, then verify at the bench whether the upcoming pile needs to open to full
titles on hover. Do not ship a design that can only be navigated from the right-rail checklist.

### 2.3 Colour — the operator's third instruction

> "remove the left side colors, color lightly the backgrounds of the cards"

- **Delete the left accent entirely** — both the retired absolute rail *and* the `border-l-4`
  replacement R5 just added. `HUE_BORDER` / `stepBorderClass` go with it.
- **The functional hue becomes a light card fill.** Add `HUE_SURFACE` to `steps/step-face.tsx`
  beside `HUE_MEDALLION`: a **50-level tint** per family (evidence sky · identity violet ·
  judgement amber · traceability emerald), light enough that `text-text-default` keeps its contrast
  floor at 12–14px on a 1080p monitor at 3 ft.
- The hue stays **functional, never decorative**, and it stays resolved in **one registry** —
  two surfaces render these steps and a hue picked at a call site is how one green comes to mean
  three things.
- **Watch the ground plane.** The card was `bg-surface-card` (white) against `bg-surface-canvas`
  precisely so `elevationClass('raised')` had something to cast onto. A tinted fill must not erase
  that step, or the deck's depth — which is now the whole point — stops reading. If a 50-tint
  flattens it, the answer is a **stronger canvas**, not a heavier shadow.

---

## 3. The occlusion ban — what is being rewritten, and what survives

This is the part to get right, because it is the difference between an evolution and a repeat of
`33a3eb609`.

### 3.1 What the ban was actually protecting

Attempt #1 was deleted because it **hid pending steps** and **re-sorted completed ones**, so *"you
could not see the shape of the work before you were in it."* The depth pile was refused because it
layered rows **behind one another and occluded their completion times** — the record the surface
exists to produce.

Note what neither of those is: an axis, or a z-index.

### 3.2 The re-scoped rule (paste this into the docblock and the rule file)

> **Occlusion of a BODY is allowed. Occlusion of the RECORD is not.**
>
> A step's body — its capture controls — belongs to one card at a time; hiding the other eight
> bodies is the entire point of a focus surface and costs nothing, because they are not actionable
> while another step is.
>
> A step's **record** — its label, its state mark, its summary and its completion time — may never
> be occluded once it exists. That is why the **history reads as full title rows and never as a
> pile**: a settled step's timestamp is evidence, and a pile that covers it is the refused depth
> pile no matter how good it looks.
>
> An **upcoming** step has no record yet — nothing but a name and a position — so a sliver peek
> costs nothing that exists. It must still be *reachable* (click to promote) and its name must be
> recoverable (hover, promotion, and the right-rail checklist).

### 3.3 The three invariants that do NOT move

1. **Every step is mounted, from the first frame, in strict `deriveProcedureSteps` order.** A deck
   is a transform, never a filter and never a sort. `resolveActiveStep` decides the focus; nothing
   decides membership.
2. **The right-rail `checklist` display stays mounted and default.** GROK-RULES §3 makes this a
   *coupling*, not a preference: the centre is allowed a compressing geometry only because the
   checklist owns the shape of the work. If the checklist is ever de-defaulted, the deck reverts in
   the same change.
3. **Nothing is ticked by hand and nothing takes focus.** Completion stays derived from the
   carton's own facts; every pointer control dispatches `receiving-focus-scan` after it acts.

---

## 4. Implementation notes

### 4.1 Start here

`src/design-system/components/procedure/ProcedureColumn.tsx` — the SoT component whose docblock
carries the ban. Rewrite the docblock **first** (§3.2), then the render. Rename to
`ProcedureDeck` only if you also update `index.ts`, `UnboxProcedureColumn.tsx`, the rule files and
the guards in the same change; "column" is now the wrong noun, but a half-done rename is worse than
the old name.

### 4.2 Depth model

Distance-driven, transform-only, from `distance = index - activeIndex`:

- `distance === 0` → focus: `scale 1`, `opacity 1`, top z, body mounted.
- `distance < 0` (history) → **no scale-down, no overlap**: full title rows in flow, opacity ladder
  only. The record must stay legible (§3.2).
- `distance > 0` (upcoming) → peek pile: monotonic `z-index`, `translateY` pulling each layer up
  behind the focus card, `scale` and `opacity` falling with distance, capped at ~2–3 visible layers.

The pull-up is what keeps the focus card adjacent to the composer while the tail stays mounted —
without it the pending run hangs below the focus card and pushes it off the dock.

### 4.3 Motion — the law does not bend, and it does not have to

- **Transform + opacity only.** `translateY` / `scale` / `opacity` / `z-index`. Never `height`,
  never `layout`, never `layoutId` (face → focus is a *replace*, not a travel; shared-layout there
  produces a morphing artifact).
- **Active body content** crossfades on `motionRole.swap.scan` — the station-cadence preset, whose
  exit is `duration: 0`. Not `swap.focus`; this is a scan bench.
- **No GSAP, no scroll-linked animation** (`useScroll`, `animation-timeline`). A scanner-driven
  operator does not scroll this list; that would be decorating a path nobody takes.
- **Reduced motion is a hard cut and must be correct as one.** The app-wide `MotionConfig` floor
  snaps every transform and keeps opacity animating, so the deck must be readable with the travel
  removed. Verified against the installed framer 12.42.2, not the docs.
- Section height still changes when a card takes focus. That is a plain reflow in one un-animated
  frame, and it is still never animated.

### 4.4 Scroll ownership — the R1 lesson, do not undo it

`StationWorkbench` owns the port (`flex-1 overflow-y-auto`). The deck adds **no** `overflow-*`, no
`flex-1`, no `h-full`. The first revision put a second port inside a `space-y-*` wrapper, where
`flex-1` has no basis — so the port was never height-constrained, never scrolled, the snap never
engaged, and `min-h-[12rem]` rendered as a white void. Every `flex-1`, `h-full`, `snap-*` and
`min-h-*` on it was dead CSS that still occupied space. If snap ever returns it goes on the **host**
port behind an opt-in prop, never in a private scroller here.

### 4.5 Radius

`cornerClass('card')` = `rounded-2xl` (16px) for the focus card. Peeks keep the same role — a radius
that changes with state is a channel operators do not read, and the house law is that selection is
fill + ring, never a size shift. Never a hand-typed `rounded-*`, and never `rounded-*-[inherit]`
(§6.4).

---

## 5. Finish R4's tail before touching the deck

These are typecheck-level failures already sitting in the tree. Clear them first so a red gate means
the deck, not the leftovers.

1. `npm run audit-route-auth -- --emit` — register `/api/receiving/lines/[id]/label-previewed`.
2. Add `labelPreviewedAt` to the fixtures in `derive-capture-step-states.test.ts` and any receipt
   derivation guard that builds a `DeriveCaptureStepStatesInput`.
3. `npx tsc --noEmit -p tsconfig.json`, then `npm run lint`.
4. `npm run verify`. **Never raise a ratchet baseline to make it pass** — baselines only shrink. If
   the tree is red from another session's work, attribute it and say so rather than inheriting it.

---

## 6. Rules to rewrite — in the same commit as the code

### 6.1 → `.claude/rules/display/station-workbench.md` (§ *The step column*)

Rewrite the three-count "nothing is hidden, re-sorted, or occluded" list into §3.2's **body vs.
record** distinction, and record the reversal explicitly: *the ban on occlusion was named wrong; the
hazard was occluding the RECORD, and a focus deck that occludes only bodies is not that.* Keep the
citation to `33a3eb609` — the reason it was deleted is still true.

Also correct, in the same file:

- the snap-column prose (there is no snap and no private port — the host owns the scroll);
- `scrollIntoView({ block: 'start' })` → `'nearest'`; `'start'` was written for the snap column, and
  on a bottom-pinned deck it yanks the focus card to the top of the port;
- the neighbour-chip paragraph (chips are cut);
- the label preview's position (it is a step body, not a sibling under the column).

### 6.2 → `.claude/rules/ui-design-system.md` (new section: *Scroll ownership*)

> **One scroll port per region, and the HOST owns it.** A component mounted into an existing scroll
> host is **content**, never a viewport. `overflow-y-auto` inside a host that already scrolls
> produces a nested port, and if the child's parent is not a flex column with a height basis the
> child gets **no height at all** — it renders as a plain stack, and every `flex-1`, `h-full`,
> `snap-*` and `min-h-*` on it becomes dead CSS that still occupies space.
>
> **Do:** check who owns the scroll before writing `overflow-*`; compose the host's port
> (`StationWorkbench` for station bodies, `DashboardScrollShell` for workbench pages).
> **Don't:** ship `flex-1 overflow-y-auto` inside a `space-y-*` wrapper.
>
> **A scroll-snap surface must be verified to actually snap.** Snap on a zero-height port is
> invisible in code review and obvious at the bench.

### 6.3 → `.claude/rules/ui-design-system.md` (extend *Async / empty / error states*)

> **Never reserve height a body has not asked for.** A `min-h-[N]` floor on a container whose
> content is dynamic renders as an empty void the moment a small body lands in it. Reserve geometry
> only for a **skeleton at the real geometry** (a known row count, a known face height), never for
> "presence".

### 6.4 → `.claude/rules/ui-design-system.md` (anti-pattern list)

> **`rounded-*-[inherit]` on a child is not a clip.** `border-radius: inherit` copies the parent's
> radius *value* onto the child's own box, so a thin child gets a huge radius and renders as a lens.
> For an edge accent use a border on the element itself; do **not** reach for `overflow-hidden`,
> which shears the focus rings off inputs inside the element.

*(This rule survives even though the accent itself is being deleted — the trap is general.)*

### 6.5 → `.claude/rules/display/station-workbench.md` (bottom-pinned work surface)

> **A station work surface is BOTTOM-PINNED and grows upward** — `StationWorkbench bodyAlign="end"`
> (`min-h-full` + `justify-end`) inside the host's scroll port. `min-h-full` lives on the body
> column, not on the child: a percentage min-height only resolves against an ancestor with a
> definite height, and the scroll port is the nearest one. The active step is adjacent to the
> composer that commits it; that adjacency is the point of the surface.

### 6.6 → `unbox-procedure-chat-progression-GROK-RULES.md`

§3's "HARD NEVER: do not ship the centre's bottom-anchored geometry without the right-rail checklist
mounted and defaulted" is now **live and load-bearing** — restate it as the deck's precondition
rather than a caution. §4's snap-column sentence needs the same correction as §6.1.

---

## 7. Verification — non-negotiable

The previous pass shipped a surface that could not have worked, and it was not caught because **it
was never rendered**. Typecheck, lint and guards were all green.

- The dev server is the user's and runs on **`:3050`** — attach, never start. If it is down, say so
  and stop.
- **Screenshot a carton mid-procedure** showing: (a) the focus card at the bottom against the
  composer, (b) full-title history rows above it, (c) the upcoming peek pile behind and below the
  focus card, (d) light hue fills and **no** left accent edge, (e) no dead space in the focus card.
- Confirm **exactly one** scroll port inside the workbench (`document.querySelectorAll` filtered on
  computed `overflow-y: auto`), and that the page itself does not scroll.
- Confirm the scan bar still holds focus after a step advance **and** after clicking a peek and a
  history row (`data-station-scan-input`).
- Confirm the deck renders correctly with transforms snapped — emulate `prefers-reduced-motion`.
- Exercise the `label` step end-to-end against the **QA org**: confirm → the step goes done and the
  pointer settles; reopen → it retracts. E2E asserts against `QA_ORG_ID`, never the dogfood tenant.

---

## 8. Do not re-open

- **Nothing is ticked by hand.** Completion derives from the carton's own facts. `label_previewed_at`
  is an *acknowledgement that a person read something* — the one fact only a person can supply — not
  a claim that evidence exists. The deleted `checklist_templates` list is not coming back.
- **No per-step duration, anywhere** — no card, no receipt, no tooltip. There is no
  `step_started_at`; the gap between completions is not time-on-step, and timing an operator who can
  waive steps corrupts the record the procedure exists to produce.
- **One note target** (`receiving_line.notes`); the dock's trailing terminal never re-labels.
- **One label surface** — the step body. There is no standalone preview.
- **`skipped` is never drawn as `done`.**
- **Nothing on this surface takes focus**; pointer controls hand focus back via
  `receiving-focus-scan`.
- **Motion package imports** stay inside `src/design-system/motion/**`; app code imports
  `@/design-system/motion`.
