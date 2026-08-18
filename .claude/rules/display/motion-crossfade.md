# Motion / crossfade engine — the transition law for every region contract

The single cross-cutting motion law shared by all four region contracts (Station, Workbench, Monitor, Canvas).
Names the canonical crossfade recipe, the singular **focus-surface** crossfade *target*, the spring-vs-tween division,
and the reduced-motion mandate — keyed to `src/design-system/motion/roles.ts` (the intent layer),
`src/design-system/foundations/motion-framer.ts` (the physics), and
`src/design-system/foundations/motion-framer-hooks.ts` (the reduced-motion bridge).

**Crossfade the focus surface only** — Station active card; Workbench detail region (pane / drawer / stack);
Monitor drill when present; Canvas inspector/overlays. **Never** crossfade the collection map, stream, or graph.

**Inherits:** `../ui-design-system.md` (Kinetic Ledger). This doc is motion only.

---

## Pick a ROLE, not a literal (ratified 2026-08-01)

**`motionRole.*` (`src/design-system/motion/roles.ts`) is the front door.** A role is an
**intent** — "this is a scan-cadence swap", "this is a push that reflows siblings" — bound to
the physics the house already ships. New animated surfaces name the role; only a surface with
no role fitting its job reaches past it into the preset catalog.

**The catalog is not deprecated — it is the implementation.** `framerPresence.*` /
`framerTransition.*` remain the named physics. Roles exist because the catalog answers
*"which of these 60 literals do I use?"* with silence: it names the curve, never the job, so
two siblings doing the same job picked different literals and neither was wrong.

**A role, once adopted, is adopted EVERYWHERE its job occurs.** Half a vocabulary is worse
than none: two spellings for one job is exactly the "which of these do I use?" question the
role was introduced to close, now asked about the role instead of the literal. So a role
migration finishes its job across the repo rather than landing surface-by-surface.

Adoption status (2026-08-01):

| Role | Raw call sites left |
|---|---|
| `swap.scan` · `swap.focus` · `push.rail` · `gesture.press` | **none** — fully swept |
| `feedback.pulse` | none *(generic mounted ack — prefer `ActionFlashRow` / chip copy; Displays arm no longer uses it)* |
| `feedback.hitMarker` | Displays Root Index leaf-commit (`StationDisplayIndexList`) — seventh role, 2026-08-07 |
| `procedure.advance` | **none — deferred.** The flat `ProcedureDeck` does not wire it *(2026-08-03)* |

`feedback.pulse` ships with **zero Displays consumers** after arm was hardened dry
(2026-08-07). It remains the generic mounted-ack job (copy flash / live cell).
**`feedback.hitMarker` is a different job** — leaf-commit / confirm juice on an
armed list row (≤100ms inset rail + optional lead micro-scale). Do not retarget
`pulse` for commit, and do not invent a page-local spring.

| Role | Physics | Resolves to (unchanged) | Legal regions |
|---|---|---|---|
| `swap.scan` | tween `easeOut` **0.12s**, exit `duration: 0` | `stationCartonSwap` + `stationCartonSwapMount` | Station |
| `swap.focus` | tween `easeOut` **0.18s** | `workbenchPane` + `workbenchPaneMount` | Workbench · Monitor drill · Canvas inspector |
| `push.rail` | tween `motionBezier.layout` **0.24s** | `detailStackPush` + `sidebarNavColumnMount` | Workbench · Monitor · Station push columns (**column width only** — not Displays ↑↓ arm) |
| `gesture.press` | engine default press spring (suppressed under reduced motion) | `framerGesture.tapPress` | Station · Workbench |
| `feedback.pulse` | `fadeInstant` (opacity 0.15s) | `chipCopyFeedback` | Station · Workbench |
| `feedback.hitMarker` | tween `easeOut` **0.10s** | `framerTransition.hitMarker` | Station · Workbench (armed-list leaf commit) |
| `procedure.advance` | tween `motionBezier.layout` **0.55s** | `procedureStackLayout` | **deferred — no consumer.** The flat deck advances by content crossfade |

**Seven roles today; the count is still the point.** An eighth is a claim that a genuinely new
*job* exists — not that a surface wants a different duration. Wanting a different duration
for the same job is the drift roles exist to stop. `feedback.hitMarker` (2026-08-07) is the
seventh: **commit acknowledge** on an armed row ≠ generic `pulse` ack. `procedure.advance`
(2026-08-03) remains the deferred sixth layout job.

**The durations above are the ones the code already ships**, deliberately. The originating
ruling (D10) proposed 150 / 200 / 250ms; the shipped curves are 120 / 180 / 240ms and were
tuned against real surfaces — `swap.scan` in particular was measured on the Unbox bench,
where it replaced ~0.6s of empty canvas per scan. Re-timing every station and pane to match a
table in a briefing would be inventing physics to satisfy a document. **The document was
corrected to the code.**

### What a role does NOT do

- **It does not replace `AnimatePresence` discipline.** `mode="wait"`, `initial={false}`, and
  stable keys are still yours to get right — a role carries physics, not structure.
- **It does not choose the crossfade TARGET.** Per-archetype targets below still rule; a
  `swap.focus` applied to a collection map is the same bug it always was, now with a nicer name.
- **It does not gate reduced motion.** The `MotionConfig` floor does that (see below), and it
  covers roles exactly as it covers raw presets.

---

## The CSS / Framer boundary (ratified 2026-08-01)

**Framer owns presence, geometry, and gestures. CSS owns pointer-driven micro-interaction.**

| Concern | Engine | Why |
|---|---|---|
| mount / unmount presence, keyed swaps | **Framer** | exit animations need a lifecycle owner; CSS has none |
| geometry pushes (`width`/`height` reflow) | **Framer** | the sanctioned layout tween needs a completion signal |
| drag / swipe / `whileTap` press | **Framer** | gesture state is React state |
| **hover lift, press travel, focus glow, row affordances** | **CSS** (`motion-safe:`) | see below |

**A hover animation on a dense row must be CSS.** A framer `whileHover` on a
`LedgerGrid` row or a MasterNav spine row binds a React state update to `mousemove` across
every row in the render window — a re-render per pointer move to move something two pixels the
compositor gives away free.

**The law survived its own reference implementation.** It was written around
`SPINE_ICON_LIFT_CLASS`, a `motion-safe:` CSS transform on the MasterNav spine's 14px glyph.
That class was deleted 2026-08-02 — **not because the technique was wrong, but because that
particular row should not move at all** (`source-of-truth.md` → MasterNav row hover/press
travel). The engine choice above is unchanged: if a dense row ever earns hover travel again, it
is CSS with `motion-safe:`, never a framer `whileHover`.

**`motion-safe:` is mandatory on CSS motion.** The app-wide `MotionConfig` floor covers framer
only — it has no visibility into a Tailwind `transition-transform`. A CSS hover lift without
`motion-safe:` is the one way left to ship vestibular motion past the floor.

**Exempt: `animate-*` loaders.** ~289 files use Tailwind keyframe animations, overwhelmingly
spinners where the motion *is* the status indicator. Do not sweep them.

---

## The import boundary — one path, one package (ratified 2026-08-01)

**No file outside `src/design-system/motion/**` may name a motion package.** The barrel
carries the **engine** (`motion`, `AnimatePresence`, `useReducedMotion`, `useMotionValue`,
types …), the **role layer** (`motionRole`), the **role hook** (`useMotionRole` /
`useMotionPressRole`), the **physics tokens** (`springSnappy`, `fadeInstant`), and the
**dense primitives** (`DenseRowReveal`, `DenseList`/`DenseListItem`, `ActionFlashRow`).

The 60-literal preset catalog and the reduced-motion bridge hooks keep their existing
`@/design-system/foundations/motion-framer*` paths — they are house modules, not packages, so
they were never what the boundary is about, and funnelling them through the barrel would add
~60 re-exports nothing imports from it (knip would flag every one).

- **The package underneath is `motion/react`**, not `framer-motion`. Same v12 engine, same
  API; `motion` is the maintained package name and `framer-motion` is the legacy alias.
  Because the swap happens in exactly one file, it is a dependency decision rather than a
  220-file migration next time it changes — which is the entire reason for the boundary.
- **`framer-motion` and `motion/react` are both banned outside `src/design-system/motion/**`.**
  Guard: `motion-major.guard.test.ts` (also still pins a single major in the lockfile — dual
  majors split React context and break nested `AnimatePresence`).
- **`AnimateNumber` stays at `@/design-system/motion/plus`, off the main barrel.** Re-exporting
  it from the index would put `motion-plus` in the module graph of every one of the ~220 barrel
  consumers — the exact bundle-altitude hazard `build-gotchas.md` catalogues.

---

## The transition law, in one paragraph

**Default: animate `opacity` + a small `transform` (`x`/`y`/`scale`) only; do not animate layout
(`width`/`height`/`padding`/`margin`) on high-frequency or collection surfaces.** GPU-composited
properties (opacity, transform) don't trigger reflow, so a crossfade stays at 60 fps under load while
a height/width tween thrashes layout on a list that re-renders every keystroke. For height changes
elsewhere use `grid-template-rows` (or Framer's `height: 'auto'` *only* on low-frequency
expand/collapse, e.g. `framerPresence.collapseHeight`), never an animated box you also crossfade.
**Swap one keyed entity for another with `AnimatePresence mode="wait"`, `initial={false}` so the first
paint doesn't animate, and a stable key** (entity id / `skuId` — *never* an array index). The
previous element exits, then the next enters; never two on screen at once. Durations are
**sub-300ms, ease-out by default** (`motionBezier.easeOut` = `[0.22, 1, 0.36, 1]`) — except the
two sanctioned layout jobs below, which may run up to **~400ms** on `motionBezier.layout`.

> Rule of thumb: if a transition touches `width`, `height`, `top`, `left`, or `padding`, it is wrong
> **unless** it is one of the two named layout exceptions below. Everywhere else, re-express it as
> opacity + transform, or as `grid-template-rows` for height.

**Sanctioned layout animation #1: a deliberate PUSH toggle.** A panel that makes room for itself — the sidebar
nav column (`framerTransition.sidebarNavColumnMount`), the right-rail
inspector (`RightRailHost` in push mode), the photo viewer's details drawer (`photoContextPanelMount`), a
`collapseHeight` reveal **for in-content disclosures** — animates its **own** `width`/`height` as a flex sibling,
because "make room" *is* a reflow and has no transform-only spelling. Three conditions, all required:

- **The operator asked for it.** It fires on an explicit toggle, once per request — not on selection, keystroke,
  filter, or scan cadence. A surface that reflows on its own is still the bug this law exists to prevent.
- **Tween, never spring.** A spring overshoots its target, and the target here is the width every sibling lays out
  against — the work surface would rubber-band on each open. Use `motionBezier.layout`.
- **The growing element must not squash its own content.** Two shapes satisfy this, and which one you need is
  decided by whether the panel has an **outset** resize grip:
  - **No grip → clipping host.** Fixed-width, edge-anchored inner content inside an `overflow-hidden` host, so it
    slides out from behind the frame edge (`SidebarNavColumn`).
  - **Outset grip → the card animates itself.** `HorizontalEdgeResizeHandle` `placement="outset"` renders the pill
    *outside* the card border, so an `overflow-hidden` host would shear it. Animate the card's own width at
    `overflow-visible` and clip on an **inner** shell instead (photo drawer and any surface that still
    elects the tween). This is the same recipe, not a second drawer — do not "fix" one into the other.
  - **Context rail (`ContextPanelLayout`) parks/restores with NO width tween** — instant `style.width`
    snap, same as Station Displays in-flow mount. Live sash drag still paints every frame; only the
    open↔park toggle is animation-free.
  - **Desk `RightRailHost` push (Orders · History · Incoming · …) also snaps** — plain `<aside style={{ width }}>`
    with no `motionRole.push.rail`, no opacity presence, no occupant crossfade on open. Row select must land
    the inspector on the same frame (Unbox Displays twin). Overlay / modal / intake keep their presence fade.

**Not Workbench KPI Band 2 (or sibling sheet-chrome metric doors).** Those free/occupy height *above the
grid* and must **snap instantly** (`WorkbenchKpiBand` → `hidden`) — never `collapseHeight` / opacity /
layout tween. Warehouse ops chrome is a tool door, not a push flourish. Hard law: `AGENTS.md` → Ops chrome
binary show/hide is instant. Guard: `workbench-kpi-collapse.guard.test.ts`.

**A push column that still tweens** (photo drawer and other surfaces that elect
`motionRole.push.rail`) needs its `AnimatePresence` to OUTLIVE its child. A presence that mounts
together with its child suppresses the enter under `initial={false}`; one that unmounts with its child can never play
the exit at all. Keep the presence resident and toggle the child — an empty presence renders no element and costs
nothing in the flow. And use an **opacity-only** presence preset (`framerPresence.detailStackPush`): the width tween
already owns arrive/leave, so an `x` translate would slide the column out of the slot it just reserved.
`framerPresence.detailStackOverlay`'s `x: 48` is correct **only** for the fixed/overlay branch.

**Desk `RightRailHost` push does not use that recipe.** It mounts a plain `<aside style={{ width }}>` (instant
snap). Stable occupant ids (`detail:order`, …) keep the column mounted across record→record swaps so content
updates in place — never exit→empty→enter. Overlay occupants alone keep `AnimatePresence` + the overlay preset.

Transform-only remains the law for everything that merely *moves* or *swaps*. If a panel can do its job by covering,
it covers.

**Sanctioned layout animation #2: Procedure Focus Deck step advance — RETIRED
(flat foundation 2026-08-03).** `ProcedureDeck` is a plain expandable list: every
step is a full face; only the active body expands. Step advance uses content
crossfade only (`motionRole.swap.scan` + `framerPresence.procedureFocusBody`) and
`scrollIntoView({ block: 'nearest' })`. Do **not** wire
`motionRole.procedure.advance` / `layout="position"` / peek pull-ups on the deck
without amending SoT. The catalog role remains deferred. Law:
`source-of-truth.md` → Scan-station procedure focus deck ·
`display/station-workbench.md` → Procedure Focus Deck.

**What stays banned on the deck:** HIDING and RE-SORTING; peeks / covered tuck /
negative-margin piles; scroll-linked `animation-timeline` / `useScroll` on the
step list; `layoutId` morphs between step faces; animating the dock terminal.

---

## Canonical crossfade recipe (the 7 steps)

The reference is the Station active card (`framerPresence.stationCard` + `framerTransition.stationCardMount`) and the
workbench right pane (`ReceivingRightPane.tsx`). Every archetype's crossfade is this same 7-step shape:

1. **Wrap the swapping region in `<AnimatePresence mode="wait" initial={false}>`.** `mode="wait"` = exit completes
   before enter starts (no overlap); `initial={false}` = the first-ever mount is instant, not animated.
2. **Key the inner `motion.*` by the entity identity** — `key={activeOrder.tracking}` (StationPacking),
   `key={`workspace-${workspace.row.id}`}` (ReceivingRightPane). A changed key is what triggers the exit→enter swap.
3. **`initial` = entered-from offset:** `{ opacity: 0, y: 8 }` (station card) / `{ opacity: 0, y: 6 }` (right pane).
4. **`animate` = rest:** `{ opacity: 1, y: 0 }`.
5. **`exit` = leave-toward offset, opposite sign and smaller:** `{ opacity: 0, y: -6 }` (station) so the old card lifts
   up and out while the new one rises in. Asymmetric in/out is intentional — it reads as forward motion.
6. **`transition` = a named tween preset:** `framerTransition.stationCardMount` (`0.26s`, `easeOut`) for the station
   card; `framerTransition.workbenchPaneMount` (`0.18s`, `easeOut`) for the workbench / Monitor right pane.
7. **Route the whole thing through the reduced-motion bridge** (`useMotionPresence` / `useMotionTransition`) so steps
   3–6 collapse to pure opacity when requested. `ReceivingRightPane` is the reference — it consumes
   `framerPresence.workbenchPane` + `framerTransition.workbenchPaneMount` through the hooks, with **no inline
   `prefersReducedMotion` ternary.**

The horizontal-swipe variant (mobile tab pager) is `tabPagerVariants` + `framerTransition.tabPager`, with its own
reduced fallback `framerTransition.tabPagerReduced` already baked in — copy that pattern for any directional pager.

---

## Per-archetype crossfade TARGET

The recipe is shared; **what** crossfades is archetype-specific and **singular**. This is the most-violated rule.

| Archetype | What crossfades | What stays put |
|---|---|---|
| **Station** | the **active entity card** (replaces on each scan) | scan bar, goal/throughput HUD — never animate |
| **Workbench** | the **right pane** (empty/overview ⇄ selected detail) | the sidebar picker / list — the map is stable |
| **Monitor** (detail) | the **detail pane / slide-over** on row select | the timeline / KPI list — stream stays mounted |
| **Canvas** | the **overlay / inspector repaint** on lens/zoom | the node graph — pan/zoom is direct, never a fade |

- **Station = the active card.** `StationPacking.tsx` / `ActiveOrderScanFeedback.tsx` crossfade the single result card
  on entity change. The scan bar and `StationGoalBar` are persistent chrome — they must not be inside the
  `AnimatePresence`.
- **Workbench / Monitor-detail = the right pane.** `ReceivingRightPane.tsx` is the reference: the History/Incoming table
  is **kept mounted** behind a `display: none` toggle (`style={{ display: isTableOnlyMode ? 'block' : 'none' }}`) so its
  react-query cache + scroll survive; the focused workspace crossfades *over* it keyed on `workspace.row.id`.
- **Canvas = overlay repaint, never the graph.** Lens/zoom changes repaint overlays and the inspector; the React-Flow
  graph itself pans/zooms directly. **Never crossfade the graph** — it destroys spatial continuity.
- **Never crossfade a list, map, or graph.** A list re-fading on every keystroke/selection reads as flicker and loses
  scroll. The list is the stable navigator; only the *detail* transitions.
- **No exception for the MasterNav body swap (2026-08-08).** Replacing the spine's flat map with the
  Scan Stations drill or ranked search results is a change of what KIND of list the body is, and it
  used to earn an opacity-only crossfade on that argument. It swaps INSTANTLY now — see the RESOLVED
  section below. The spine imports no motion at all.

> Rule of thumb: there is exactly **one** crossfading region per archetype. If you're fading two regions, or fading the
> list, you've picked the wrong target — re-read the table. (Stock drill is the sole sanctioned spine-list swap.)

---

## Stable-mounting patterns

**Keep the navigator mounted; transition only the detail.** Unmount-on-swap throws away cache, scroll, and in-flight
fetches, and re-fires first-mount effects.

- **Display-toggle, don't unmount** for a region you re-show often: `ReceivingRightPane` keeps the table at
  `position: absolute; inset-0` with `display` flipped, "so the auto-select / first-mount effects don't re-fire on every
  close." A `key`-swap or conditional unmount would lose the cache and scroll.
- **Scope the `key` to the row/selection id**, not to a boolean or a counter — that is what scopes the crossfade to a
  genuine identity change. `key={`workspace-${workspace.row.id}`}`, `key={activeOrder.tracking}`.
- **Put `<AnimatePresence>` OUTSIDE the unmounting conditional**, with the conditional *inside* it
  (`<AnimatePresence>{show ? <motion.div .../> : null}</AnimatePresence>`). If `AnimatePresence` is itself behind the
  `&&`, it unmounts before it can play the exit and the exit animation silently never runs.
- **A slide-over that swaps contents keeps one stable key** so only its body changes: the Incoming panel uses
  `key="incoming-details-panel"` "so only the contents swap" as rows flip — the panel does not re-enter per row.

---

## Spring vs cubic-bezier — pick by surface physics

**Springs for physical / gesture / dense-layout surfaces; cubic-bezier tweens for discrete view swaps.**
A spring models momentum and settle — right when a finger, a value, or a dense row is "thrown"; wrong for an
abstract A→B view change, where its variable duration and tail read as imprecise.

House physics tokens live in `src/design-system/motion/tokens.ts` and are what every spring / opacity-flash
preset resolves to:

- **`springSnappy`** — utilitarian spring (stiffness 500 / damping 40 / mass 0.8 / restDelta 0.001). Critically
  damped: organic settle, **no bounce**. Use for layout shifts, height reveals, list reflow, modal shells,
  indicators, quantity bumps. Dense primitives (`DenseRowReveal`, `DenseListItem`) compose it directly;
  named `framerTransition.*` springs reference the same object.
- **`fadeInstant`** — opacity-only tween (150ms easeOut). Tooltips, state icons, copy/save flashes
  (`chipCopyFeedback`, `overlayScrim`, `ActionFlashRow`).

- **Cubic-bezier `easeOut` (discrete swaps):** active-card crossfade, right-pane crossfade, table rows, dropdowns,
  chevrons, MasterNav Stock drill. Presets: `framerTransition.stationCardMount` / `tableRowMount` /
  `dropdownOpen`, all on `motionBezier.easeOut [0.22, 1, 0.36, 1]`.
- **Push WIDTH remains tween, never spring** (`sidebarNavColumnMount`, `photoContextPanelMount`,
  `motionRole.push.rail`) — even a critically damped spring on a width every sibling lays out against reads as
  rubber-band under load. Height reveals on dense rows are the exception that uses `springSnappy`.
- **Duration-locked springs stay special-cased** (`viewerPaging`, `photoHeroMorph`) — visualDuration + bounce:0
  so flick distance does not change perceived settle time. Do not collapse them onto `springSnappy`.
- **`scanFailure` keeps its intentional bounce** (shake feedback) — not utilitarian settle.
- **Durations sub-300ms for routine tweens.** Longest routine tween here is the tab-pager x-slide at `0.32s`;
  card mounts are `0.26s`, right-pane `0.18s`, scrims/`fadeInstant` `0.15s`.

| Role / job | Physics | Catalog | Regions |
|---|---|---|---|
| Dense height reveal / list reflow | `springSnappy` | `DenseRowReveal` · `DenseListItem` · `stationCollapse` · `cardExpansion` · `captureStackRowMount` | Station · Workbench |
| Save / copy flash | `fadeInstant` | `ActionFlashRow` · `chipCopyFeedback` · `motionRole.feedback.pulse` | Station · Workbench |
| Armed-list leaf commit | tween 0.10s | `framerTransition.hitMarker` · `motionRole.feedback.hitMarker` | Station · Workbench |
| Armed-list ↑↓ geometry | instant remount (no FLIP) | plain absolute track on armed row | Station Displays Root Index |
| Boxed selection pulse (commit) | tween 0.35s opacity+scale | `framerTransition.selectionPulse` | Station Displays commit only |
| Armed-list binary cut / track spring (optional cohorts) | `duration: 0` / `springArmedTrack` | `framerTransition.armedSnap` · `armedTrack` | PhotosActionsArmedList / reduced-motion |
| `gesture.press` | engine default press spring | `framerGesture.tapPress` | Station · Workbench |

---

## Reduced-motion is a hard mandate

**`prefers-reduced-motion` is not optional polish — honor it on every animated surface.** WCAG 2.3.3 (Animation from
Interactions) and Apple HIG both require that motion-sensitive users get the content without the movement. The accepted
technique is "**replace slides with crossfades**" — not "no motion." A pure opacity fade is the reduced form, not a
hard cut.

- **The floor is automatic** — `<MotionConfig reducedMotion="user">` is mounted app-wide
  (`ReducedMotionProvider`), so every framer `motion.*` reduces without any per-call-site wiring.
  Transforms, layout, and the positional box keys (`width`/`height`/`top`/`left`/`right`/`bottom`)
  snap; **opacity keeps animating**. See *RESOLVED — `MotionConfig` is the reduced-motion FLOOR*.
- **The bridge in `motion-framer-hooks.ts` is the escape hatch**, for stronger-than-default reduction:
  - `useMotionTransition(transition)` → the transition unchanged, or `{ duration: 0 }` when reduced.
  - `useMotionPresence(presence)` → the full `initial/animate/exit`, or the same shape with
    transform/filter keys stripped when reduced (`height` and `opacity` are **preserved**).
- **Reduced means collapse transforms to 0 + fade, never "instant cut" everywhere.** `framerTransition.tabPagerReduced`
  shows the baked-in form: same opacity crossfade, `x` duration dropped to `0.01s`.
- **Where the hook isn't used, do the inline ternary** (`ReceivingRightPane` reads `prefersReducedMotion` and swaps
  `{ opacity: 0, y: 6 }` → `{ opacity: 1 }`). Acceptable, but the hook is the SoT — prefer it.

---

## The exception: a queue-processing inspector swaps in place

**Rule:** key the crossfade on the entity id — *except* for an inspector whose job is
walking a queue record by record. There, key on a **stable occupant id** and swap the
content in place, with **no exit animation at all**.

`RightRailHost` keys its `AnimatePresence mode="wait"` on the occupant id, and the
right-rail store states that the id "must change only when the slot content genuinely
swaps to a different entity" — so a per-record id (`detail:order:<id>`) made every
`j`/`k` step a full exit-then-enter: ~0.4s out, ~0.4s in, with an **empty slot between**.
Arrowing down a queue is the core loop on that surface, and a blank gap per step is the
wrong cost. The dashboard order inspector therefore registers the stable id `detail:order`
and lets the store's node-update path (which exists precisely for this) swap the record.

**Preconditions — do not take this exception without them:**
- The panel must fully **re-seed** on record change: every editable field re-reads from
  the incoming record and transient view state (open tab, open sub-form) resets.
- Any **dirty draft must be flushed for the outgoing record first**, while the save
  closure still points at it — otherwise instant swap silently discards typed work.
- Navigating **without editing must write nothing**. Guard that with a test; a misfiring
  flush writes one record's field onto another.

**Per-entity crossfade stays the default for every other occupant** (assistant ⇄ SKU
detail ⇄ repair claim …). This is a scoped exception, not a host change — it is achieved
purely by id stability, and `mode="wait"` is left alone.

## The station-cadence sibling: `stationCartonSwap`

**A scanner-driven bench does not get the pointer-driven pane preset.** Unbox
swaps between *physically different cartons* at scan cadence, where
`workbenchPaneSettle` (0.3s each way, `mode="wait"`) cost **~0.6s of empty
canvas per scan** — the browse table underneath is `visibility: hidden`, so the
operator watched the app background between boxes.

**`framerPresence.stationCartonSwap` + `framerTransition.stationCartonSwapMount`**
is the sibling for that job: identical opacity shape, but the **exit carries its
own `{ duration: 0 }`**. Browse→first open uses `mode="wait"` + enter fade (0.12s).
Carton→carton uses sync + hard cover (see below).

- **Carton→carton uses `mode="sync"` + opaque hard cover.** `mode="wait"` removes
  carton A before mounting B and punches a white hole through the host while the
  browse underlay is `visibility: hidden`. Concurrent *semi-transparent* fades
  still double-image — that is not a fix. Opaque cover-replace (new pane at full
  opacity on top, old exits underneath) does not. `UnboxLineWorkspace` switches
  `mode={cartonSwapHardCut ? 'sync' : 'wait'}`, uses `initial={false}` on swap,
  and paints the overlay shell `bg-surface-canvas` (station fill, not card white).
- **Browse→first open keeps `mode="wait"` + enter fade.** Do not hard-cut the
  first open or the station→browse close path without re-checking underlay paint.
- **This is a sibling, not a replacement.** `workbenchPaneSettle` keeps serving
  its six pointer-driven consumers (Review, Outbound, FBA, Packer, Triage, …).
  Do not retune the shared preset for a station's problem.
- **Killing the animation is NOT the same as killing the remount.** The
  queue-inspector exception below (swap in place, stable occupant id) has
  preconditions — full re-seed on record change, dirty-draft flush for the
  outgoing record. `LineEditPanel` does not meet them today (`unboxView`,
  `classifyExpand`, `pairingOpen` have no reset keyed on `row.id`; the notes
  composer has no flush-before-swap). Take the cheap win, leave the remount.

## RESOLVED — the named `workbenchPane` preset

The Workbench / Monitor right-pane swap now has a shared preset: **`framerPresence.workbenchPane`**
(`initial { opacity:0, y:6 }` → `animate { opacity:1, y:0 }` → `exit { opacity:0, y:-6 }`) +
**`framerTransition.workbenchPaneMount`** (`0.18s`, `easeOut`). `ReceivingRightPane.tsx` and `TechRightPane.tsx` consume
it through `useMotionPresence` / `useMotionTransition`, so the reduced-motion collapse is automatic and there are no
inline literals left to drift. **New right-pane crossfades call `useMotionPresence(framerPresence.workbenchPane)`** —
never re-inline the values.

## RESOLVED — the MasterNav spine has NO motion

**`SidebarNavList` does not import the motion barrel. Every state change in the spine happens on one
frame**: mounting the map, selecting a row, opening a nest, entering the Scan Stations drill,
switching to ranked search results.

That is a navigator on a scan bench doing what it is for. Everything in the column is something the
operator has clicked a hundred times and reaches for by muscle memory, so any duration at all is
time inserted between the reach and the target. Four treatments were tried and all four lost:

| Treatment | Why it went |
|---|---|
| `spineActiveWash` — 150ms selection settle | Imperceptible once the monochrome pass made the fill a few-percent plane step |
| `spineRowStagger*` — 15ms × index nest cascade | A five-row nest reads as a wave travelling down-and-right, not a disclosure |
| `collapseHeight` — one-block nest height expand | No sweep, same delay |
| `spineBodySwap` — 120ms body crossfade | `mode="wait"` meant the outgoing list finished fading before the incoming one mounted: ~240ms round trip with an EMPTY column between two lists, sitting on the app's most-repeated navigation |

The chevron's `motion-safe:transition-transform` went with them. It was the last moving thing —
150ms of CSS on the control the operator had just committed to, confirming a click whose result
was already on screen.

**`framerVariants.spineRowStagger*` is NOT deleted** — `CommandBar` still consumes it, and a palette
revealing ranked results is a genuinely different job from a navigator disclosing a fixed nest.
`spineBodySwap` and `spineActiveWash` ARE deleted, presets and all: they had exactly one consumer
each and an orphan preset is both a knip finding and an invitation to re-wire it.

**Do not reintroduce motion here** — not a crossfade, not a settle, not a rotate transition. Guard:
`main-nav-groups.guard.test.ts` asserts the file imports no motion barrel, no preset, no hook.

## RESOLVED — the MasterNav nest opens INSTANTLY (no motion at all)

**A spine nest is a plain `<ul>`. No `motion.*`, no presence, no transition.** Rows paint on the
same frame as the chevron rotates.

This took three passes and the sequence is the useful part. Modes staggered at `40ms` while pages
did not stagger at all, so a 4-mode page resolved *slower* than the 12-page section containing it —
the cascade read as lag, not order. That was unified onto one `15ms × index` ladder
(`spineRowStagger*`, `opacity 0→1` + `y 2→0`). The unified cascade was internally consistent and
still wrong for the job: at 15ms per row with a y-offset, a five-row nest is a wave travelling
down-and-right, so a nav dropdown announced its contents one at a time instead of disclosing them.
Replacing it with a single height expand (`collapseHeight` + `stationCollapse`) fixed the sweep and
kept the underlying mistake.

**The underlying mistake: this is a navigator on a scan bench.** The operator clicking a nest
already knows what is in it — they are reaching for a row they have hit a hundred times. Any
duration at all is time inserted between the click and that row. A disclosure whose contents are
fixed and known does not need to be *shown arriving*; it needs to be there.

- **The chevron's CSS `motion-safe:transition-transform` stays.** It is chrome confirming the click
  landed, it runs on the compositor, and it does not sit between the operator and a destination.
  That is the distinction — not "no motion in navigators", but no motion *on the path to a target*.
- **`framerVariants.spineRowStagger*` is NOT deleted.** `CommandBar` still consumes it, and a
  palette revealing ranked results is a genuinely different job from a navigator disclosing a fixed
  nest. What is gone is the spine's use of it.
- **The nest still keys on the SECTION id**, never the filter query or the filtered array. This
  mattered while it animated; it is kept because a churning key remounts the subtree and discards
  scroll and focus for nothing.

**The spine now has exactly ONE motion left**: the opacity-only body swap between the map and ranked
results, which is a change of what KIND of list the body is rather than a navigation step.
Selection is instant — `spineActiveWash` was deleted 2026-08-08 when the monochrome pass replaced
the saturated selected fill with a few-percent plane step, leaving a 150ms fade between two
near-identical neutrals that nobody can see. Row hover/press travel was deleted 2026-08-02. Never a
framer `whileHover` on a spine row.

## RESOLVED — `MotionConfig` is the reduced-motion FLOOR

**`<MotionConfig reducedMotion="user">` is mounted app-wide** at `src/app/layout.tsx` via
`ReducedMotionProvider` (`src/components/providers/ReducedMotionProvider.tsx`). framer itself
now honors `prefers-reduced-motion` for **every `motion.*` in the tree**, so compliance is the
**default** — present and future — rather than something each call site opts into.

**Consuming `framerPresence.*` / `framerTransition.*` raw is therefore no longer a WCAG bug.**
The former instruction ("new animated code must call the hook bridge") is retired: it sent agents
to do work the floor already does.

What framer actually does when the preference is on — **verified against the installed
`framer-motion@12.42.2`, not the docs** (isolated Playwright A/B, `reducedMotion: 'reduce'`):

| Key | Under reduce | Measured |
|---|---|---|
| transforms (`x`/`y`/`scale`/`rotate`/…) | **snap** — `{type:false}` | `y` 24 distinct frames → **2** |
| `width` · `height` · `top` · `left` · `right` · `bottom` | **snap** (they are positional keys too) | `height` 30 → **2** |
| layout animations (`layout` / `layoutId`) | **disabled** (`type:false`, `delay:0`) | — |
| **`opacity`** | **animates normally** | 31 → **33 distinct frames** |

So reduced motion here is genuinely *"replace slides with crossfades"* — the slide dies, the
crossfade lives. That is **more faithful than the old bridge**, whose `{ duration: 0 }` produced a
hard cut.

**Do not assume `collapseHeight` keeps tweening under reduce.** `height` is a positional key, so
the sanctioned height animation still *collapses* — instantly. There is no framer setting that
tweens it under reduce; do not go looking for one.

**The bridge survives as an escape hatch, not as the compliance mechanism.** Reach for
`useMotionPresence` / `useMotionTransition` only when a surface needs *stronger-than-default*
reduction — suppressing an animation outright rather than crossfading it. `useMotionPresence`
strips only transform/filter keys and **preserves the rest** (notably `height`); it previously
returned a flat opacity-only shape, which discarded `collapseHeight`'s height keys so the element
faded while holding its full box and never collapsed.

**Still outside the floor** (each needs its own gate):

- **GSAP** — different engine, no `MotionConfig`. `card-fan-carousel.tsx` gates explicitly with
  `useReducedMotion()` zeroing every tween `duration`/`delay`.
- **`motion-plus` `AnimateNumber`** — separate package/context; its only consumer `AnimatedStat`
  already handles reduce manually.
- **Tailwind `animate-*`** (~289 files) — CSS animations, mostly loaders where a spinner is a
  status indicator rather than vestibular motion. **Do not sweep them.**

**REJECTED — "every presence must route through `useMotionPresence`" (D2, 2026-08-01).** The
2026-08-01 architecture briefing proposed re-mandating the bridge at every call site, enforced
by an AST lint rule. That is the rule this section already retired, and re-adopting it would
undo a measured result: the floor was verified frame-by-frame against the installed
`framer-motion@12.42.2` (transforms and positional keys snap, `opacity` keeps animating), so a
mandatory bridge would buy **zero** additional compliance while sending every agent to do work
the runtime already does — and `useMotionPresence`'s own history is of *over*-reducing
(it discarded `collapseHeight`'s height keys and left elements faded at full box).

The bridge stays what it is: the escape hatch for **stronger-than-default** reduction. The
`station-motion-bridge.guard.test.ts` allowlist — station card primitives that must suppress
motion outright, not merely crossfade it — remains the correct scope, and it may grow. A
blanket mandate is not on the roadmap; reopen it only with evidence the floor misses a case.

**Compact auth/wizard step forms** follow [`auth-step-panel.md`](auth-step-panel.md) — not this archetype split. Use
`signInStepVariants` + fixed viewport + bundled back chip; do not apply workbench right-pane or field-level pager patterns.

---

## Frequency & continuity discipline

- **Don't animate high-frequency or keyboard-driven actions.** A crossfade on every scan is fine (the operator paces
  it); a crossfade on every keystroke in a filter, or on each arrow-key row move, is flicker — render those instantly.
- **Keep station flourishes minimal.** The bench serves the *next scan*; the active card's crossfade is the whole budget.
  No decorative entrances, no per-field animation competing for the eye.
- **`layoutId` only for genuine spatial continuity** — one element that physically travels (the sliding tab/button
  indicator under `framerTransition.sliderIndicator`). **Never** use `layoutId` for the list→detail swap: that is a
  *replace*, not a *move*, and shared-layout there produces a morphing artifact, not continuity.

---

## Anti-patterns

- **Array-index `key`** on `AnimatePresence` children — reorders mis-animate; key by entity id.
- **`<AnimatePresence>` inside the conditional** (`{show && <AnimatePresence>…}`) — exit never plays; put it outside.
- **Springs on a discrete view fade** — variable duration + tail reads as imprecise; use `easeOut` tween.
- **Bounce/overshoot on a photo or an opacity fade** — `viewerPaging` deliberately uses `damping: 38` for none;
  "bounce reads as tacky on a photo."
- **Routine transitions over ~300ms** — sluggish; reserve longer only for large physical slides (sheet, pager).
- **Animating `width`/`height`/`padding`/`margin`** outside the two sanctioned layout jobs (PUSH toggle · Procedure Focus Deck advance) — layout thrash; use `grid-template-rows` for height, transform for the rest.
- **Crossfading the list / map / graph** — only the detail/active-card/overlay transitions; the navigator stays put.
  (The MasterNav body swap was the one exception; it is instant as of 2026-08-08.)
- **Any motion at all in the MasterNav spine** — it imports no motion barrel; see the RESOLVED section.
- **Animating outside framer without a gate** — GSAP / `motion-plus` sit outside the `MotionConfig`
  floor, so they need their own `useReducedMotion()` check. (Consuming `framerPresence.*` raw is
  *fine* — the floor covers it.)
- **Importing `framer-motion` / `motion/react` outside `src/design-system/motion/**`** — the barrel
  is the only motion import path; the guard fails the build.
- **A framer `whileHover` on a dense list row or spine row** — CSS `motion-safe:` transform instead
  (see the CSS / Framer boundary).
- **CSS motion without `motion-safe:`** — the `MotionConfig` floor cannot see it.

---

## Do / Don't

**Do**
- Name a `motionRole.*` first; reach into the preset catalog only when no role fits the job.
- Import every motion symbol from `@/design-system/motion` — the one path.
- Crossfade exactly one region per archetype (card / right pane / overlay), keyed by entity id.
- Use `mode="wait"` + `initial={false}` + opacity-and-transform-only presets from `motion-framer.ts`.
- Trust the `MotionConfig` floor for framer; reach for the bridge only for stronger reduction.
- Put hover / press travel in CSS with `motion-safe:`; leave presence and geometry to framer.
- Keep the navigator (list/sidebar/graph) mounted; display-toggle, don't unmount.
- Pick spring for gesture/physical surfaces, `easeOut` tween for discrete swaps; stay sub-300ms.

**Don't**
- Name a motion package (`framer-motion` / `motion/react`) anywhere outside the barrel.
- Add a sixth role because a surface wants a different duration for an existing job.
- Animate layout (`width`/`height`/`padding`/`margin`) outside PUSH toggle + Procedure Focus Deck advance, or crossfade a list/map/graph.
- Key by array index, or put `AnimatePresence` behind the `&&`.
- Ship a **non-framer** animation (GSAP, `motion-plus`, CSS) with no reduced-motion path.
- Invent new right-pane crossfade literals — use `framerPresence.workbenchPane` via `useMotionPresence`.
- Animate anything in the MasterNav spine — it is motion-free by ruling.
- Use `layoutId` for a list→detail replace.

---

## Background — industry references

- Motion — `AnimatePresence` (mount/unmount, `mode="wait"`, `initial={false}`): <https://motion.dev/motion/animate-presence/>
- Motion — layout animations / `layoutId` (when shared-layout is appropriate): <https://motion.dev/docs/react-layout-animations>
- Emil Kowalski, *Great Animations* (sub-300ms, ease-out, purposeful motion): <https://emilkowal.ski/ui/great-animations>
- Nielsen Norman Group, *Animation Duration* (100–300ms feedback window): <https://www.nngroup.com/articles/animation-duration/>
- WCAG 2.1 SC 2.3.3, *Animation from Interactions* (reduced-motion mandate): <https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions>
- Apple HIG, *Motion* ("replace slides with crossfades" for reduced motion): <https://developer.apple.com/design/human-interface-guidelines/motion>

---

Indexed by ../contextual-display.md
