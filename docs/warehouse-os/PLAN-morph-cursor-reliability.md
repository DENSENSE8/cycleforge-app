# PLAN — Morph cursor system reliability

**Status: LIVE core, reliability hardening open.** Written 2026-09-02.

The desk `MorphCursorLayer` works: OS cursors are suppressed, the spring
follower paints, morph/scrub opt-ins respond. This plan is the reliability
contract so that behavior stays true on every desk surface — including the
recent rail, peeks, menus, and future adopters — without inventing a second
cursor system.

---

## What is shipped

| Piece | Role | Path |
|---|---|---|
| Layer (once) | Fixed follower + morph box + scrub readout | `MorphCursorLayer` in `WarehouseShell` |
| Hide sheet | Same as Motion+ `<Cursor />`: `* { cursor: none !important }` via `useInsertionEffect` | `useHideOsCursor` |
| Gate | Desk only: `(pointer: fine)` ∧ ¬`prefers-reduced-motion` | `usePointerFine` + `useReducedMotion` |
| Morph opt-in | Element box the cursor wears | `cursorMorphTarget()` → `[data-cursor="morph"]` |
| Scrub channel | Live drag value on the cursor | `publishCursorScrub` / `useCursorScrub` |
| Physics | Follow = duration 0 glue; morph = travelling-marker spring | `cursorFollowSnap` / `springArmedTrack` |
| Idle fill | Signed-in `staff.color_hex` | `getStaffColorHex({ id: user.staffId })` |
| Tooltip chip | Hover labels ride the pointer: `HoverTooltip` text (short plain string), `data-cursor-label`, and native `title` attributes (parked on `data-cf-title` while hovered, restored on leave). One black rounded chip (`cornerClass('control')`) seated below-right, flips at the viewport edges | `cursor-label.ts` + `useCursorLabel` → `data-testid="morph-cursor-tooltip"` |

**Cursor kinds (Chrome grammar, custom glyphs, staff color):**

| Kind | Chrome cousin | Writer | Adopters |
|---|---|---|---|
| idle | default | none | empty chrome |
| `click` | `pointer` | `cursorClickTarget()` | `Button`, `IconButton`, `ComposerModeRow`, `VisibilityToggle` |
| `resize-x` / `resize-y` | `col-resize` / `row-resize` | `cursorResizeTarget()` | `HorizontalEdgeResizeHandle` |
| `grab` / `grabbing` | `grab` / `grabbing` | `cursorGrabTarget()` | sash while dragging |
| `morph` | (no Chrome equivalent) | `cursorMorphTarget()` | `ScrubSlider` track only — wears the box |

The cursor **stays a small glyph on the pointer**. It does not expand to the
control's bounding box except `morph`. That is the triage-speed contract.

---

## Invariant

1. **One layer, app-wide.** A second mount is two cursors. Tests already
   assert a single `<MorphCursorLayer />` under `ReducedMotionProvider`.
2. **OS cursor never shares the desk.** While enabled, every CSS cursor
   keyword (default, pointer, text/I-beam, grab, resize) is forced off —
   including over the recent rail, inputs, and buttons.
3. **Morph is opt-in.** No morph target → idle 12px dot that still *follows*.
   Surfaces that should “wear” the cursor must spread `cursorMorphTarget()`.
4. **Floor / reduced motion stay native.** No hide sheet, no listeners, no
   DOM — a gloved touchscreen must not pay for decoration.
5. **The cursor is never the only copy of a value.** Scrub readout
   accelerates a value the control also paints in the DOM.
6. **The bubble is the fallback, never a fork.** A hover label rides the
   cursor only while the layer is live (`setCursorLabelHost`) and the label is
   a short single line (`canRideCursor`). Focus (keyboard / scan gun), touch,
   reduced motion, and long or rich labels open the anchored `HoverTooltip`
   bubble — still the `role="tooltip"` path. A hover label is the one value
   the cursor may be the only copy of: it never lived in the DOM before hover.

---

## Failure modes (why a surface can “feel wrong”)

| Symptom | Root cause | Reliability fix |
|---|---|---|
| Idle dot over recent rail (no morph outline) | Rail rows are not morph targets yet | Opt in at `RailRow` hit target (one place → every rail) |
| OS I-beam / pointer still visible | Hide sheet not injected, or layer `enabled=false` | Assert `data-cf-morph-cursor` style in head while enabled; keep gate tests |
| Morph stuck on previous target | Only `pointerover` updates `targetRef`; some trees swallow over | Re-resolve morph hit on `pointermove` (throttled via `frame.read`) |
| Morph box wrong size / detached | Target mid-layout or peek open; stale `getBoundingClientRect` | Already re-measures each paint while morphed; keep that path |
| Cursor under peek / menu | Layer is `z-tooltip` (top of scale) — should win; if not, a fork used raw z | Never lower the layer below `z-tooltip`; peeks stay below |
| Cursor invisible until first move | `opacity: awake ? 1 : 0` | Acceptable; optional: seed position from last known pointer |
| Hide sheet leaks after unmount / gate flip | Cleanup removed style node | Keep `useInsertionEffect` cleanup; add test that teardown removes `data-cf-morph-cursor` |
| Double hide / fight with Motion+ `Cursor` | Do not mount Motion+ `Cursor` alongside this layer | Refuse Motion+ `Cursor` in app code; `AnimateNumber` stays in `plus.ts` only |
| Nested morph targets | `closest('[data-cursor=morph]')` picks the innermost | Document: put the attribute on the **hit target you want worn**, not every ancestor |
| Portalled menus | Portal is still under `document`; hide sheet covers it; morph only if portal node opts in | Opt in on menu items deliberately, or leave idle |

---

## Reliability hardening (do in order)

### R1 — Hit-test on every frame of motion (engine)

Today morph target is set only in `pointerover`. Nested hover chrome (rail
⋮, peek open/close, age fade) can change the leaf under the pointer without
a fresh over event that clears/sets morph.

- Inside the existing `frame.read` paint path, when not scrubbing, re-run
  `document.elementFromPoint(clientX, clientY)?.closest(CURSOR_MORPH_SELECTOR)`.
- Keep `pointerover` as a fast path; move is the source of truth.
- Still ignore `pointerType !== 'mouse'`.

### R2 — Recent rail as the cohort gold (adoption)

Wire morph **once** on the shared row hit target in
`src/components/sidebar/rail-shell/RailRow.tsx` (the `button[data-rail-row]`),
not on each domain rail.

```tsx
{...cursorMorphTarget(rowLabel /* or short id */)}
```

That covers Unbox / Pack / Support / Search / Testing recents without N
forks. Labels are optional; empty label = morph box only.

**Do not** morph the whole scrollport or the peek card by default — morph
the row the operator is about to click.

### R3 — Adoption catalog (desk interactive chrome)

Spread `cursorMorphTarget()` only where the cursor should **wear the
control** before click. Candidate list (ship as capacity allows):

| Surface | Mount point |
|---|---|
| Recent rail rows | `RailRow` button (R2) |
| Desk header CTAs | `DeskHeaderAction` / `DeskActionSlot` primary |
| Segmented faces | already: `VisibilityToggle` |
| Scrub ranges | already: `ScrubSlider` |
| MasterNav leaf (desk) | leaf button — **not** on floor if gate already off |
| Composer mode faces | `ComposerModeRow` face when `showModeFaces` |

Refuse: every table cell, every link, chrome-only fill tracks. Morph is a
signal, not a wallpaper.

### R4 — Hide-sheet contract tests

Extend `morph-cursor.test.ts` (source + optional jsdom):

1. Enabled → injects `[data-cf-morph-cursor]` with `cursor: none !important`
   on `*, *::before, *::after`.
2. Disabled / unmount → style node gone.
3. Selector still equals `cursorMorphTarget()` writer (`CURSOR_MORPH_SELECTOR`).
4. Single shell mount.

### R5 — Runtime probe (optional, desk-only)

A tiny `data-testid="morph-cursor"` state machine already exposes
`data-cursor-state=idle|morph|scrub`. Playwright desk smoke (one page with
a known morph target + one rail row after R2):

- OS cursor hidden (computed `cursor` on a `cursor-pointer` button is `none`).
- Hover morph target → `data-cursor-state="morph"`.
- Leave → `idle`.
- Floor / coarse pointer path: no `[data-cf-morph-cursor]` in head.

### R6 — Region law stays prose + gate

`motionRole.cursor.*.regions` excludes `'station'`. The runtime gate is
`usePointerFine` — do not add a second “are we on /unbox” check that can
drift from media. Floor stations on a desk mouse still get the layer; that
is correct (a real pointer exists).

---

## Explicit non-goals

- Replacing the layer with Motion+ `<Cursor />` (magnetic / matchTextSize).
  Keep the hand-rolled morph + scrub channel; only the **hide sheet** was
  copied from Motion+.
- Hiding the text **caret** (`caret-color`) in inputs — that is insertion
  feedback, not the mouse cursor.
- Morphing every hoverable node in the app.
- Mounting the layer on public / marketing routes (shell already scopes it).

---

## Eval / done when

1. `pnpm exec tsx --test src/design-system/motion/morph-cursor.test.ts` green
   with R4 assertions.
2. `cursor-eval --fast` green after engine (R1) or rail (R2) edits.
3. Manual desk pass: recent rail row morphs; OS pointer never returns over
   buttons/inputs; Escape/menus do not leave a stuck morph; reduced-motion
   restores the native cursor.

Graph before shared edits: `find MorphCursorLayer` / `WarehouseShell` →
`impact` (rebuild index if find is empty). Design MCP before UI writes.

---

## Decision log

| Date | Ruling |
|---|---|
| 2026-09-02 | Hide sheet = Motion+ inject pattern, not `html` class alone |
| 2026-09-02 | Morph remains opt-in via `cursorMorphTarget()` |
| 2026-09-02 | Reliability SoT = this plan; idle-over-rail is expected until R2 |
| 2026-09-02 | Follow is duration-0 (`cursorFollowSnap` / `useMotionValue`). A spring on x/y is lag. Morph size still `springArmedTrack`. No velocity smear. Idle dot = signed-in `staff.color_hex`. |
| 2026-09-02 | Default display is Chrome-style **kind glyphs** (click / resize / grab), not box-wear. `morph` remains opt-in for scrub tracks. |
| 2026-09-03 | Tooltips ride the cursor on the desk. `HoverTooltip` hands a short plain label to the layer (`cursor-label.ts`); the anchored bubble stays for focus / touch / reduced motion / long labels. Label-only `data-cursor-label` readouts take the same black tooltip chip; the light value chip is scrub-only. |
| 2026-09-05 | Native `title` attributes ride the cursor too: the layer lifts a short title onto the chip and parks the attribute while hovered so the browser tip cannot double it. Long titles (> 48 chars) stay native. Chip corner is `control` (rounded), not `row`. Click-focus while the label rides never opens the bubble (`useCursorLabel().riding`). |
