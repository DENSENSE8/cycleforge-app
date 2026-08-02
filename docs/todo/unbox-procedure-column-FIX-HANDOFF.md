# Unbox procedure column — FIX HANDOFF (ROI-ordered)

**Date:** 2026-08-02 · **Lane:** WS-DOGFOOD (`main`) · **Status:** the column shipped broken; fix in order
**Fixes:** the surface landed by [`unbox-procedure-chat-progression-HANDOFF.md`](./unbox-procedure-chat-progression-HANDOFF.md) (M-0/M-2)
**Binding rules:** [`unbox-procedure-chat-progression-GROK-RULES.md`](./unbox-procedure-chat-progression-GROK-RULES.md) ·
[`display/station-workbench.md`](../../.claude/rules/display/station-workbench.md)

---

## 0. What is actually wrong (one sentence)

**The column added a second scroll port inside a host that already had one, so it has no
height, the snap never engages, and its two height constants render as empty white voids.**

Everything in the screenshots — the giant blank active card, the nav chips floating
mid-canvas, the label preview sliding under the dock — is downstream of that one defect.
Fix R1 first; do not touch cosmetics before it.

### The evidence

| Fact | Where |
|---|---|
| The host already owns the scroll | `StationWorkbench.tsx:96` — `min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto` |
| The column adds a second one | `ProcedureColumn.tsx` — `<ol className="flex-1 … snap-y snap-mandatory overflow-y-auto">` |
| …inside a non-flex parent, so `flex-1`/`h-full` have **no basis** | `unbox-tabs.tsx` `buildUnboxOverview` → `<div className="space-y-4">` |
| ⇒ the port is 0-height-constrained, never scrolls, never snaps | the sections just stack in the OUTER scroll |
| ⇒ `min-h-[12rem]` becomes literal dead space | screenshot 1 |
| ⇒ the bottom nav chips land mid-document | screenshot 2 |

---

## 1. ROI order — do them in this sequence

Each fix is gated on the one above it. R1–R3 are one change in practice and should land together.

### R1 · Delete the second scroll port (unblocks everything)

**The column is CONTENT, not a viewport.** `StationWorkbench` owns the scroll; the column
renders into it.

- Remove `flex-1`, `overflow-y-auto`, `overscroll-contain` and `h-full` from
  `ProcedureColumn`'s `<ol>` and `<section>`.
- Snap moves to the **host** port, not a private one. Add the snap type to the workbench
  scroll host (`StationWorkbench`, behind an opt-in prop — do **not** turn it on globally for
  every station) and keep `snap-start snap-always` on the sections.
- If the host cannot take the snap type this pass, **ship without snap** rather than with a
  dead nested port. A column that scrolls correctly and does not snap is usable; one that
  neither scrolls nor snaps is what is on screen now.

### R2 · Bottom-pin it and grow upward (the mockup's actual geometry)

The operator's eye path is product → down → the live card → the input that commits it. The
active step must sit **adjacent to the composer**, not float at the top of an empty canvas.

- The column's outer element gets `flex min-h-full flex-col justify-end` **inside the host
  port**. With few steps the stack hugs the dock; as steps accumulate it grows **upward** and
  the host scrolls.
- `min-h-full` (not `h-full`) is the load-bearing bit: it makes the content at least a
  viewport tall so `justify-end` has something to push against, while still allowing growth.
- This is the geometry the original handoff specified (`justify-end`, "it does not float in
  the middle of an empty canvas") and that the snap-column rewrite dropped. Restore it.

**This is NOT the refused attempt #1.** That one *hid pending steps* and *re-sorted completed
ones* to get the current card to the bottom. Nothing is hidden or re-sorted here — the whole
vocabulary stays mounted in order; only the stack's resting position changes. Keep that
distinction in the docblock, because it is the thing that will get this reverted otherwise.

### R3 · Kill the fixed active-height floor

`PROCEDURE_STEP_ACTIVE_MIN_HEIGHT = 'min-h-[12rem]'` is the white void in screenshot 1: the
`shipping_label_photo` body is one camera button, and the constant reserves 12rem for it.

- **Delete the constant.** The active section's height is whatever its body needs.
- `PROCEDURE_STEP_FACE_HEIGHT` **stays** — a face is a fixed one-row object and the rhythm
  depends on it.
- The un-animated face→active reflow is still fine. What is banned is *animating* height, not
  height changing.
- **Never reserve height a body has not asked for.** An empty box at a bench reads as "this
  step is broken", and it costs the vertical room the whole column is spending to exist.

### R4 · Label becomes a step, and the standalone preview dies

This also fixes the dock overlap in screenshot 2: the preview is a sibling *after* the column,
so it slides under the composer.

- Add `label` to the **capture** phase in `src/lib/stations/procedure.ts`. `print` stays
  `commit` on the terminal dock.
- Face: `Printer` (or `Tag`), hue **violet** (identity) in `steps/step-face.tsx`.
- Body: the existing `UnboxLabelPreview`, moved into `steps/` and registered in
  `UNBOX_STEP_BODIES`. **Delete the standalone `<UnboxLabelPreview>` mount** in
  `unbox-tabs.tsx` — one label surface, never two.
- **The gate is the open question and it must be answered explicitly.** Gating on
  `label_note` parks the pointer forever on most cartons (`resolveActiveStep` returns the
  first not-done step, so `activeKey` never reaches `null` and the settled-carton signal the
  receipt read model depends on never fires). Pick one and say which:
  - **(a)** add a `label_previewed_at` stamp (migration; expand → code → contract, migration
    lands first) — honest, and it is an observation of a real event, not a hand-tick;
  - **(b)** ship `label` as the last capture step gated on `label_note` **and** fix the
    settled signal at the same time so a never-done tail step cannot break it.
  **Do not gate on `labelPrinted`** — that is the commit act and it belongs to the dock.

### R5 · Fix the accent-rail radius clipping

`rounded-l-[inherit]` on the rail is wrong: `border-radius: inherit` gives the 4px-wide rail
the **card's** radius value (≈16px), so it renders as the lens/notch artifact in screenshot 3.

- **Do:** drop the absolutely-positioned `<span>` and give the card itself
  `border-l-4 border-l-{hue}`. A border follows the element's own corner radius natively, so
  there is nothing to clip and nothing to inherit.
- The hue class moves to a `HUE_BORDER` map in `steps/step-face.tsx` beside `HUE_ACCENT`
  (which is then deleted with its last consumer).
- **Do not** "fix" this with `overflow-hidden` on the section — that shears the focus rings
  off the inputs inside an active body, which is the trap the sign-in password reveal already
  documents.

### R6 · Re-home the neighbour chips

They currently render after a non-scrolling `<ol>` and land in the middle of the document.

- Once R1/R2 land they belong to the **pinned bottom chrome**, directly above the composer —
  or are cut entirely, since the active step is already adjacent to the dock and the chips
  duplicate a scroll the operator can just do.
- **Recommendation: cut them for now**, reinstate only if the demo shows paging is needed.
  They are the least load-bearing thing here and they cost a focus-handback each.

---

## 2. Hard rules to add (this is the "same pattern" the user asked for)

These are general, not Unbox-specific. Land them in the rule files named, in the same commit
as the fix.

### 2.1 → `.claude/rules/ui-design-system.md` (new section: *Scroll ownership*)

> **One scroll port per region, and the HOST owns it.**
>
> A component mounted into an existing scroll host is **content**, never a viewport. Adding
> `overflow-y-auto` inside a host that already scrolls produces a nested port, and if the
> child's parent is not a flex column with a height basis, the child gets **no height at all**
> — it silently renders as a plain stack, and every `flex-1`, `h-full`, `snap-*` and
> `min-h-*` on it becomes dead CSS that still occupies space.
>
> **Do:** check who owns the scroll before writing `overflow-*`. Compose the host's port
> (`StationWorkbench` for station bodies, `DashboardScrollShell` for workbench pages).
> **Don't:** ship `flex-1 overflow-y-auto` inside a `space-y-*` wrapper — `flex-1` has no
> basis there and the port is inert.
>
> **A scroll-snap surface must be verified to actually snap.** Snap on a zero-height port is
> invisible in code review and obvious at the bench.

### 2.2 → `.claude/rules/ui-design-system.md` (extend *Async / empty / error states*)

> **Never reserve height a body has not asked for.** A `min-h-[N]` floor on a container whose
> content is dynamic renders as an empty void the moment a small body lands in it. Reserve
> geometry only for a **skeleton at the real geometry** (a known row count, a known face
> height), never for "presence".

### 2.3 → `.claude/rules/display/station-workbench.md` (extend *The step column*)

> **A station work surface is BOTTOM-PINNED and grows upward** — `min-h-full` + `justify-end`
> inside the host's scroll port. The active step is adjacent to the composer that commits it;
> that adjacency is the point of the surface. A work surface that floats at the top of an
> empty canvas has put the operator's eye in the wrong place.
>
> Bottom-pinning is **not** the refused attempt #1. That failed by *hiding* pending steps and
> *re-sorting* completed ones. Pinning the stack's resting position while the full vocabulary
> stays mounted in order is a different thing, and the difference is the whole ruling.

### 2.4 → `.claude/rules/ui-design-system.md` (extend the token/anti-pattern list)

> **`rounded-*-[inherit]` on a child is not a clip.** `border-radius: inherit` copies the
> parent's radius *value* onto the child's own box, so a thin child gets a huge radius and
> renders as a lens. For an edge accent use a **border on the element itself**
> (`border-l-4`), which follows that element's corner radius natively.

---

## 3. Verification — non-negotiable this time

The previous pass shipped a surface that could not have worked, and the reason it was not
caught is that **it was never rendered**. Typecheck, lint and guards were all green.

- The dev server must be up on **`:3050`** (the user owns it — attach, never start). If it is
  down, say so and stop; do not report a UI change as done without seeing it.
- Screenshot: a carton mid-procedure showing (a) the stack pinned to the bottom against the
  composer, (b) a settled face, an active step with **no dead space**, and a pending face,
  (c) the label as a step in the column, (d) a clean accent edge at the corner radius.
- Scroll the host and confirm the **page** does not scroll and there is exactly one scroll
  port. `document.querySelectorAll` for elements with `overflow-y: auto` inside the workbench
  should return one.
- Confirm the scan bar still holds focus after a step advance and after any click on the
  column (`data-station-scan-input`).

---

## 3b. §2 executed 2026-08-02 (rules + stale fixtures)

R1–R6 had already landed in the working tree when this was picked up; what was outstanding was
§2 and the test fixtures the `label` step (R4) invalidated.

- **Rules landed**, all four:
  - `ui-design-system.md` → new **Scroll ownership** section (one port per region, the host owns
    it; snap must be verified to actually snap; a nested port needs a definite height) — plus the
    `rounded-*-[inherit]` anti-pattern in the same block.
  - `ui-design-system.md` → *Async / empty / error states* now carries **Never reserve height a
    body has not asked for**.
  - `display/station-workbench.md` → the step-column bullets were rewritten to the shipped code:
    one height constant, **bottom-pinned and grows upward** (`bodyAlign="end"` on the host, with
    the not-refused-attempt-#1 distinction kept), the column is content not a viewport, and snap
    belongs to the host port or nowhere.
- **Stale references removed** from `station-workbench.md`: the neighbour-chip paragraph now
  records that they were cut and what would bring them back, and the guard list dropped
  `procedure-column-order.test.ts` / `procedure-column-neighbours.test.ts`, neither of which
  exists on disk.
- **Fixtures fixed** for `label` joining the capture phase:
  `derive-capture-step-states.test.ts` (vocabulary, length 9→10 unfound, positions, last key) and
  `procedure-receipt-derivation.guard.test.ts` (`workedGates` now stamps `labelPreviewedAt`, or the
  bench pointer never reaches `print`).
- **The R4 gate question is answered in code: option (a).** `label_previewed_at`
  (`2026-08-02_receiving_line_label_previewed.sql`) + `POST /api/receiving/lines/:id/label-previewed`,
  modelled in Drizzle. Not `label_note`, not `labelPrinted`.
- **§3 browser verification was NOT run for this section** — a concurrent session was mid-rewrite of
  the column into `ProcedureDeck` while this landed (the tree briefly had a half-written
  `UnboxProcedureDeck.tsx` and a dangling `../UnboxProcedureColumn` import). The geometry claims in
  §3 belong to whoever finishes that rewrite; nothing here asserts them.

## 4. Do not re-open

- The occlusion ban (no z-stacked pile), the no-hiding and no-re-sorting rules — unchanged.
- No animated height anywhere on this surface.
- One note target (`receiving_line.notes`); the dock's trailing terminal never re-labels.
- No per-step timers, no hand-ticks, no `step_completed` row.
- Nothing on this surface takes focus; pointer controls hand focus back via
  `receiving-focus-scan`.
