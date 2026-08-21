# Welded receive panel — a visible gap at the weld seam

**Status:** RESOLVED 2026-08-21 · **Created:** 2026-08-21
**Scope:** this one defect. The rest of the welded panel works; do not redesign it.
**Surface:** Unbox station dock — [`LineEditPanel.tsx`](../../src/components/receiving/workspace/LineEditPanel.tsx) → `WeldedStack` → `WeldedFeedbackPanel` + `WorkspaceNotesCard`
**Port plan this blocks:** [`welded-feedback-panel-station-port-PLAN.md`](./welded-feedback-panel-station-port-PLAN.md) — do not port the weld to Arrival/Testing until this is understood.

---

## RESOLUTION (2026-08-21)

**There was never a geometric gap.** Measured in the real runner (Playwright,
`qa-desktop`, against `:3050`) with the panel and the composer mounted in
isolation: `seamGapPx: 0`, `dx: 0`, `dw: 0`, wrapper height == panel height, the
peel wrapper's inline `height` settles to `auto`, and the composer's mount
wrapper carries `transform: none`. **H1, H3 and H4 are all dead**, and H2's
resting `matrix3d` is real but pixel-identical with `transform:none` — it is a
stray composited layer, not this defect.

What the operator was seeing was a **chrome discontinuity at the joint**, in two
independent halves, both of which are silhouette-level chrome that only ONE half
of the weld was painting:

1. **The outline changed colour at the seam.** The panel drew `palette.border`
   (amber-200 / blue-200) down its sides; the composer drew `border-border-soft`
   (slate-200) down its own, *and* its `border-top` — the seam hairline — was
   therefore a foreign cool-grey line laid straight across a warm amber box.
   Pixel-sampled at the left border column: `254,230,133` above the seam,
   `226,232,240` below it. §2 fixed exactly this discontinuity for the FOCUSED
   state and left the resting state alone.
   **Fix:** the panel's stroke is now `border-border-soft`. Tone lives in the
   fill, the glyph and the text — which is what the focus docblock already said.

2. **The elevation shadow started halfway up the shape.** `OmnichannelComposerDock`
   paints `elevationClass('raised')` on its own shell. Outside the composer's
   edges the plane fell away; outside the panel's it was flat. That step at the
   joint is the "light band".
   **Fix:** `WeldedStack` casts the shadow for the pair, and the dock drops its
   own while `weldTop` — the same hand-off the focus halo already made.

**The general law this is an instance of:** *silhouette-level chrome (focus ring,
elevation, stroke colour) belongs to the box that contains both halves; a half
that paints it alone puts a visible seam through the shape the weld exists to
make one.* The halo already followed it; the stroke and the shadow did not.

Verified after the fix: `seamGapPx: 0`, one outline colour at rest
(`rgb(226,232,240)` on both halves) and focused (`rgb(43,127,255)` on both), one
shadow on the stack, `composerShadow: none`. Screenshots at 2–5× on `loading`,
`warning`, disclosure-open and focused all read as one silhouette.

Nothing was changed about the peel, the radius tokens, the focus ratchet, or the
`-mt-px` ban. §6's constraints all hold.

---

## 0. The symptom (as reported)

The receive feedback panel is supposed to be welded to the notes composer: one
silhouette, one continuous outline, a single hairline where they meet. Instead
there is a **visible horizontal gap / light band between the panel's bottom edge
and the composer's top edge.**

Operator-reported three times, on at least two tones:

| Tone | Panel | Gap seen? |
|---|---|---|
| `loading` (in-flight, "7s", `edgeProgress` ON) | blue-50 | yes |
| `warning` (`sync_pending`, "Inventory sync still running", `edgeProgress` **OFF**) | amber-50 | yes |

**The `edgeProgress` tone matters.** `sync_pending` renders with
`edgeProgress={false}`, so whatever causes the gap is **not** the progress
sweep. See §3 for why that killed the leading theory.

---

## 1. What the DOM is supposed to be

```
WeldedStack                     rounded-2xl group [focus-within ring when welded]
├─ AnimatePresence (no DOM)
│  └─ motion.div                overflow-hidden, style={transformOrigin:'bottom'}
│     └─ div  ← THE PANEL       rounded-2xl relative rounded-b-none
│                               border border-b-0 shadow-inner
│                               border-<tone>-200 bg-<tone>-50
│                               group-focus-within:border-blue-500
│        ├─ div.flex…px-3 py-2  (status row)
│        ├─ AnimatePresence     (More disclosure, collapsed)
│        └─ div.absolute…       (edge sweep — ONLY when edgeProgress)
└─ div#zoho-notes-card
   └─ motion.div                (OmnichannelComposerDock animateMount wrapper)
      └─ div  ← THE COMPOSER    flex min-w-0 w-full flex-col
                                rounded-b-2xl rounded-t-none
                                border border-border-soft bg-surface-card
                                shadow-elev-raised
                                focus-within:border-blue-500
```

Intended seam = **exactly one 1px line**, the composer's `border-top`. The panel
contributes none (`border-b-0`).

---

## 2. What has been VERIFIED (do not re-derive)

Measured by injecting the real composed class strings into a live page and
reading `getBoundingClientRect` / `getComputedStyle`:

- **Horizontal geometry is identical.** Stack, panel wrapper, panel, composer
  wrapper, composer: all `left: 20, right: 660, width: 640`. Both `border-box`,
  both 1px left/right borders. **The gap is not a width or inset problem.**
- **`rounded-b-none` does apply** on the panel — measured
  `border-bottom-left-radius: 0px`, `border-top-left-radius: 16px`.
- **`border-bottom-width: 0px`** on the panel is real.
- Class merging survives `cn` (tailwind-merge). Verified output:
  ```
  rounded-2xl relative rounded-b-none border border-b-0 shadow-inner
  border-amber-200 bg-amber-50 group-focus-within:border-blue-500
  ```
  `COMPOSER_SHELL_CORNER` **must stay first** — `cn('rounded-b-none','rounded-2xl')`
  merges down to bare `rounded-2xl` and silently un-flattens the welded edge.
- **`--ds-elev-raised` has zero x-offset** on all three layers, so the composer's
  shadow is left/right symmetric and is not an asymmetry source.

A separate, real colour bug WAS found and fixed on the way (panel border stayed
tone-coloured while the composer went `border-blue-500` on focus → outline
changed colour halfway up). That fix landed via `focusRing('grouped')` /
`focusRing('halo')`. **It is not this bug** — the gap survives it.

---

## 3. Theories already tried and DISPROVED

| # | Theory | Why it's dead |
|---|---|---|
| 1 | Horizontal misalignment between the two boxes | Measured identical, see §2 |
| 2 | `shadow-elev-raised` bleeding asymmetrically | Zero x-offset in the token |
| 3 | Focus border colour discontinuity | Real, fixed, gap persists |
| 4 | **`edgeProgress` track** — the sweep shipped as an in-flow `h-0.5 w-full bg-border-soft` strip at the panel's bottom, i.e. a 2px slate band across the seam | Genuinely wrong and now fixed (moved to `absolute inset-x-0 bottom-0`, no track). **But `sync_pending` has `edgeProgress={false}` and still gaps**, so this was at most a second, additive defect |

---

## 4. Live hypotheses, most likely first

**H1 — Motion leaves an inline `height` on the panel's peel wrapper.**
`framerPresence.weldedPanelPeel` animates `height: 0 → 'auto'`. Motion measures
the child, animates to a px value, and is expected to settle back to `auto`. If
it settles on a **rounded/stale px height larger than the content** — likely,
because the status line crossfades (`AnimatePresence mode="wait"` on the ticker)
and can change height *after* the measurement — the wrapper keeps `overflow-hidden`
and the extra px renders as the stack's background below the panel. That is
exactly a light band at the seam, on every tone, `edgeProgress` or not.
- **Test:** with the panel mounted, read
  `document.querySelector('[data-testid=welded-feedback-panel]').style.height`
  and compare `getBoundingClientRect().height` of the wrapper vs its child `div`.
  A non-`auto` inline height, or wrapper height > child height, confirms it.
- **Likely fix:** drop `height` from the peel preset and animate only
  `opacity` + `rotateX` (the peel reads fine without a height collapse), or add
  `onAnimationComplete` → clear the inline height. Prefer the former — it also
  removes the one layout animation from a hot path.

**H2 — `rotateX` leaves a residual transform.**
`transformPerspective: 900` + `rotateX: 0` still composites the element in 3D.
A 3D-transformed box can render a sub-pixel seam against the box below it, and
the browser will not snap it to the pixel grid. This would show as a hairline
light band that **changes with zoom level** — the reports are all zoomed
screenshots.
- **Test:** temporarily set `peel.animate` to `{height:'auto', opacity:1}` with
  no `rotateX` / `transformPerspective` and see if the band disappears.
- **Likely fix:** clear the transform at rest (`rotateX: 0` → remove the key
  once settled), or accept the height-less peel from H1 which also removes the
  need for `transformPerspective`.

**H3 — the composer's `animateMount` wrapper contributes offset.**
`OmnichannelComposerDock` wraps its shell in `motion.div` with
`framerPresence.composerDock` (opacity + small `y`). If that `y` does not settle
at exactly 0, the composer sits a px or two low and the stack's background shows
through.
- **Test:** read the composer wrapper's computed `transform`.
- **Likely fix:** pass `animateMount={false}` from `WorkspaceNotesCard` while
  `weldTop` is set — a welded composer should not have its own mount motion
  anyway; the panel above owns the entrance.

**H4 — sub-pixel rounding from a fractional stack width.**
`STATION_WORKBENCH_COLUMN` may produce a fractional width; a 1px border on a
fractional box can round differently for two stacked elements.
- **Test:** check whether the gap disappears at exactly 100% zoom / integer
  widths.

---

## 5. How to reproduce

**You need an authenticated session** — this surface is behind sign-in and the
previous session could not reach it (which is why this handoff exists rather
than a fix).

1. Attach to the operator's dev server at `http://localhost:3050` — **never
   start, restart, or kill it** (`.claude/rules/workflow-safety.md`).
2. Open `/unbox`, select a carton with a linked PO.
3. Drive a receive, or — faster — the two easiest tones to inspect:
   - `loading`: press Receive and look during the in-flight window.
   - `warning` / `sync_pending`: the state in the operator's screenshot. Hardest
     to provoke naturally; see §7 for the deleted harness.
4. Zoom to 300%+ on the seam at the left and right corners.

**Measure, do not eyeball**, and measure in the real runner (Playwright or the
page itself), not an embedded preview pane — `.claude/rules/verify.md` →
*Measure in the real runner*.

```js
const p = document.querySelector('[data-testid="welded-feedback-panel"]');
const panelBox = p.firstElementChild.getBoundingClientRect();
const composer = document.querySelector('[data-testid="omnichannel-composer-dock"]').getBoundingClientRect();
({
  wrapperInlineHeight: p.style.height,
  wrapperH: p.getBoundingClientRect().height,
  panelH: panelBox.height,
  seamGapPx: composer.top - panelBox.bottom,   // MUST be 0
  wrapperTransform: getComputedStyle(p).transform,
})
```

`seamGapPx` is the number this handoff is about. It must be `0`.

---

## 6. Constraints on the fix

- **Do not** delete the weld or go back to a detached card.
- **Do not** paper over it with a negative margin (`-mt-px`) — that hides a
  layout bug behind a magic number and will drift at other zoom levels.
- The panel keeps `border-b-0`; the seam is the composer's `border-top`, one
  hairline.
- Radius goes through `COMPOSER_SHELL_CORNER` / the `radius` prop, never a
  `className` override (`AGENTS.md` → *Do not paint over primitives*).
- Focus recipes go through `focusRing()` — there is a **shrink-only ratchet** at
  35 in `src/components/ui/focus-ring-tokens.test.ts`. Do not raise it; add the
  archetype to `focus-ring.ts` (already has `halo` and `grouped`).
- `npm run verify` before done. **Note:** `right-rail-inspector-header.test.ts`
  → *"ShippedDetailsPanel composes DeskRailChromeRow"* is **failing at HEAD and
  is unrelated** — do not adopt or fix it as part of this.

---

## 7. Useful history

A dev tester that drove all 18 panel states from fixtures (including
`sync_pending`, `cooldown`, `rate_limit` and the two reconcile verdicts only
reachable via a `demoStatus` hatch) was built and then removed at the operator's
instruction. It is recoverable at **`308cd4983`**:

```
src/components/receiving/workspace/ReceiveFeedbackTester.tsx
src/components/receiving/workspace/receive-feedback-scenarios.ts
src/components/receiving/workspace/receive-feedback-scenarios.test.ts
```

Restoring it locally (do not commit it) is by far the fastest way to sit on the
`sync_pending` tone and measure the seam without provoking a real timeout.

---

## 8. Files

| File | Role |
|---|---|
| [`WeldedFeedbackPanel.tsx`](../../src/components/receiving/workspace/WeldedFeedbackPanel.tsx) | the panel + `WeldedStack`; peel motion, edge sweep |
| [`OmnichannelComposerDock.tsx`](../../src/design-system/primitives/OmnichannelComposerDock.tsx) | `weldTop` (flattens top radius, drops its own halo) |
| [`LineEditPanel.tsx`](../../src/components/receiving/workspace/LineEditPanel.tsx) | mounts `WeldedStack` around region + composer, no margin |
| [`motion-framer.ts`](../../src/design-system/foundations/motion-framer.ts) | `framerPresence.weldedPanelPeel` · `framerTransition.weldedPanelPeel` · `framerPresence.composerDock` |
| [`focus-ring.ts`](../../src/design-system/tokens/focus-ring.ts) | `halo` · `grouped` archetypes |
| [`radius.ts`](../../src/design-system/tokens/radius.ts) | `COMPOSER_SHELL_CORNER` |
