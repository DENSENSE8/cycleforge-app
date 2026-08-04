# Motion API findings — Station multi-section scroll host

> **RULED 2026-08-04 — see [`station-multi-section-scroll-host-RULING.md`](./station-multi-section-scroll-host-RULING.md).**
> Every settled item below is now pinned into `.claude/rules/display/station-workbench.md`.

**Status:** Validated engineering findings, not a research request. Every quote below was pulled
live on **2026-08-04** via the Motion+ MCP (`https://mcp.motion.dev/plus`, tool
`search-motion-source` / `resources/read`), cross-checked against the installed package
(`motion@12.42.2` in `package.json` / `node_modules`). This doc **narrows** the companion brief —
[`station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md`](./station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md)
— to what Motion's own API cannot answer. Read this FIRST; the rewritten brief assumes it.

**Do not re-derive anything below from memory or from a stale scrape.** Every claim here is either
a verbatim doc quote (`motion://docs/react/...`), real example source (`motion://examples/react/...`),
or a direct repo grep with a file:line citation.

---

## 1. Corrections to prior assumptions

The original brief and this session's earlier (pre-MCP, WebFetch-scraped) research pass got three
things wrong or incomplete. Corrected here because they'd otherwise leak into an SoT amendment.

### 1.1 `layout` prop legal values — `true` | `"position"` | `"size"` (not `"preserve-aspect"`)

Verbatim from `motion://docs/react/react-motion-component`:

> `layout` — Default: `false`. If `true`, this component will perform layout animations.
> If set to `"position"` or `"size"`, only its position or size will animate, respectively.

`"preserve-aspect"` does not exist in the API — that was an unvalidated guess made earlier in this
research pass (before MCP tools were live) and must not appear in any SoT amendment.

### 1.2 `layoutAnchor` is NOT a scroll/viewport/dock-pinning primitive

This is the most consequential correction. Earlier in this research pass, `layoutAnchor` was framed
as a candidate fix for "keep the focus card pinned near the dock while siblings above it grow." The
real doc text says something narrower:

> **`layoutAnchor`** — Default: `{ x: 0, y: 0 }`. Motion's layout animations look correct when a
> parent and child animate with different transitions, because it resolves the child's position
> **relative to its parent**. By default, it does this using the top/left of the parent.
> `layoutAnchor` can customise this point, where `x` and `y` can be set as independent progress
> values between `0` and `1`. `0` = top/left, `0.5` = center, `1` = bottom/right. Setting to `false`
> disables relative projection for this element, and elements will animate relative to their
> **page-relative** change.
>
> ```jsx
> <motion.ul layout>
>   <motion.li layout layoutAnchor={{ x: 1, y: 0 }} transition={{ delay: 1 }} />
> </motion.ul>
> ```
>
> Live example: https://examples.motion.dev/react/layout-anchor

Full real source pulled via `motion://examples/react/layout-anchor` confirms the demo: a parent
`motion.div` with `layout` resizes on click, and a nested child with `layoutAnchor={{x, y}}` stays
visually anchored at that normalized point of the **parent's own resizing box** while the rest of
the parent grows around it — a crosshair overlay literally marks the anchor point. This is
**relative-projection math between a parent and child that are both mid-`layout`-animation with
different transitions.** It is not a general "pin element A to the edge of scrollport B regardless
of what siblings do" tool, and it does not know about the DOM's scroll position or an unrelated
sibling's height at all.

**Applicability to this problem:** narrow. It would only be relevant if the Section Host's *own
container* and the *focus card inside it* are both running `layout` animations with **different**
transition timings and visibly drifting apart during that specific animation. It is not a
substitute for CSS positioning (sticky/scroll-padding) to keep an element above an absolute dock —
that remains a plain CSS question, unresolved by any Motion prop. **Do not reach for `layoutAnchor`
as the fix for the dock-occlusion bug in §2.2 below.**

### 1.3 `layoutRoot` targets `position: fixed` — the Station dock is `position: absolute`

Verbatim from `motion://docs/react/react-motion-component`:

> **`layoutRoot`** — For layout animations to work correctly within `position: fixed` elements, we
> need to account for page scroll. Add `layoutRoot` to mark an element as `position: fixed`.
>
> ```jsx
> <motion.div layoutRoot style={{ position: "fixed" }}>
>   <motion.div layout />
> </motion.div>
> ```

Repo verification — `slicedActionDockWrapperClass` in
[`SlicedActionDock.tsx:134`](../../src/design-system/primitives/SlicedActionDock.tsx#L134):

```ts
: 'pointer-events-none absolute inset-x-0 bottom-0 z-fab px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6';
```

The Station/Unbox floating dock is `position: absolute`, not `position: fixed` — it's positioned
relative to its nearest positioned ancestor (the station panel root), not the viewport. Per Motion's
own documented scope, `layoutRoot` is written specifically for the `fixed` case (accounting for
*page* scroll offset, which an `absolute` element already doesn't need — its projection is computed
relative to its positioned ancestor by Motion's default parent-relative model). **Recommendation:
do not add `layoutRoot` to the dock reflexively.** If a genuine layout-projection drift bug is
observed on the dock specifically, diagnose it as its own ticket rather than pattern-matching to
this prop from the doc title alone.

### 1.4 `layoutScroll` — confirmed, and there's a live, separate bug

Verbatim from `motion://docs/react/react-motion-component`:

> **`layoutScroll`** — For layout animations to work correctly within scrollable elements, their
> scroll offset needs measuring. For performance reasons, Framer Motion doesn't measure the scroll
> offset of every ancestor. Add the `layoutScroll` prop to elements that should be measured.
>
> ```jsx
> <motion.div layoutScroll style={{ overflow: "scroll" }}>
>   <motion.div layout />
> </motion.div>
> ```

Also from `motion://docs/react/react-layout-animations` (advanced use-cases section):

> To correctly animate layout within a scrollable container, you must add the `layoutScroll` prop
> to the scrollable element. This allows Motion to account for the element's scroll offset.

**Repo finding — a live, independent defect, not hypothetical:**

[`StationWorkbench.tsx:142`](../../src/components/station/workbench/StationWorkbench.tsx#L142):

```tsx
<div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
```

This is a plain `<div>`, not a `motion.div`, and carries no `layoutScroll`. Yet
[`ProcedureDeck.tsx:930`](../../src/design-system/components/procedure/ProcedureDeck.tsx#L930) runs
`layout={reduceMotion ? false : 'position'}` on children that live inside this exact scrollport. Per
the doc text above, Motion is blind to this ancestor's scroll offset when computing layout-projection
math for anything animating inside it.

The repo already gets this right in five other places:

```
src/components/ui/DateGroupHeader.tsx:134:      layoutScroll
src/components/ui/ChipColumns.tsx:78:                layoutScroll
src/components/board/SwimlaneBoard.tsx:398:      layoutScroll={colCount > 1}
src/components/board/SwimlaneBoard.tsx:399:      layoutDependency={colCount > 1 ? colCount : undefined}
src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx:1019:      layoutScroll={animateLayout}
```

**This is a P0-shaped, independently-fixable bug**, orthogonal to the Section Host redesign this
brief is about. Fix: promote `StationWorkbench`'s scroll port to a `motion.div` (or wrap it) and add
`layoutScroll`, matching the five existing call sites. File it separately — do not block it on the
Gemini research round-trip.

---

## 2. What Motion actually offers for the Section Host mechanism

### 2.1 The nearest Motion precedent is the WRONG grammar — and here's proof

Searched `motion-source` for `"app store card expand fill screen"` → no hit by that phrase, but a
direct search for `"layout anchor"` and general layout-animation browsing surfaced
`motion://examples/react/app-store` — Motion's own canonical "small card expands to full detail"
example. Full source read. It is a **shared-element modal takeover**, not an in-place floor swap:

- Uses `layoutId` (not bare `layout`) to morph a small grid card into a full-screen overlay.
- The expanded state is `position: fixed`, `z-index: 1000001`, with a dark `.overlay` scrim
  (`rgba(0,0,0,0.8)`, its own `position: fixed`, `z-index: 1000000`) behind it.
- `AnimatePresence` wraps the single open `<Item>`, mounted/unmounted on click.

This is architecturally a **different UI grammar** than what the Section Host needs. The product
requirement (per §2.4 of the companion brief) is: both Items and Procedure stay mounted, in the
**same sunken plane**, side by side — no scrim, no viewport takeover, no full-screen overlay. Kinetic
Ledger's own law bans exactly this kind of takeover for a non-blocking pick+edit surface (see
`ui-design-system.md` → "Async / empty / error states" and the house rule that a non-modal panel
never darkens the rest of the screen). **Do not model the Section Host on the App Store example** —
it solves a different problem (peek → full-screen detail with a dismiss-to-return affordance), not
"one of N always-visible regions temporarily claims more of a shared column."

### 2.2 The right primitive is bare `layout`, not `layoutId` — with `LayoutGroup`

The Section Host's actual shape — a flex/grid item's size changing because a CSS class/style swap
changed its `flex-grow` or `height`, tweened instead of snapped — is exactly what bare `layout`
(boolean or `"position"`) is for. From `motion://docs/react/react-layout-animations`:

> Layout animation can animate previously unanimatable CSS values, like switching
> `justify-content` between `flex-start` and `flex-end`.
> ...
> Layout changes can be anything, changing `width`/`height`, number of grid columns, reordering a
> list, or adding/removing new items.

And critically, for **two components that don't re-render at the same time but do affect each
other's layout** (exactly the Items/Procedure sibling relationship — clicking Items's chrome
re-renders Items, but Procedure's box also needs to resize in the same frame):

> When one re-renders, for performance reasons the other won't be able to detect changes to its
> layout. We can synchronise layout changes across multiple components by wrapping them in the
> `LayoutGroup` component... When layout changes are detected in any grouped `motion` component,
> layout animations will trigger across all of them.
>
> ```jsx
> import { LayoutGroup } from "motion/react"
> function List() {
>   return (
>     <LayoutGroup>
>       <Accordion />
>       <Accordion />
>     </LayoutGroup>
>   )
> }
> ```

**Recommendation:** the Section Host's two (or N) sections are siblings, each a `motion.div layout`
flex/grid item, wrapped in one `LayoutGroup`. Floor ownership is driven by a plain state value (which
section id is active) that flips a CSS class/style (`flex-grow: 1` vs `flex-grow: 0; height: <chrome
row height>`, or a grid `1fr` vs a fixed row in `grid-template-rows`) — `layout` tweens the resulting
box-size change on both siblings in the same commit because `LayoutGroup` makes their re-renders
mutually visible.

### 2.3 Mutual-exclusivity state machine — validated against real, accessible source

Fetched full source for `motion://examples/react/radix-accordion` (Radix UI `Accordion.Root` +
Motion). It uses `type="single"` with external `value`/`onValueChange` state:

```tsx
const [value, setValue] = useState<string>("")
<Accordion.Root type="single" value={value} onValueChange={setValue} className="accordion">
  {accordionContent.map((item) => (
    <AccordionItem key={item.id} item={item} isOpen={value === item.id} value={item.id} setValue={setValue} />
  ))}
</Accordion.Root>
```

This is a real, working, WCAG-correct ("exactly one open, driven by one external id") pattern — the
`aria-expanded`/`aria-controls` wiring and keyboard focus-ring handling (`onFocus`/`onBlur` +
`layoutId="focus-ring"`) come for free from Radix. **This validates the "one `activeId` state value,
one setter" shape for the Section Host's ownership model** — but only that half. Radix's accordion
content grows **page height** (`height: "auto"` via `variants`), not **floor ownership inside a fixed
viewport region**. Do not copy its height-animation mechanism (§2.2's `layout`+flex/grid approach is
correct for that); do copy its state-machine shape (single `value`, single setter, `isOpen = value
=== id`).

### 2.4 `AnimatePresence mode="popLayout"` does not apply here — sections never unmount

Verbatim from `motion://docs/react/react-animate-presence`:

> **`popLayout`** — Exiting elements will be "popped" out of the page layout, allowing surrounding
> elements to immediately reflow. Pairs especially well with the `layout` prop... When using
> `popLayout` mode, any immediate child of `AnimatePresence` that's a custom component must be
> wrapped in React's `forwardRef` function... ensure that the animating parent has a `position`
> other than `"static"`.

`popLayout` solves "an item leaves the list, let siblings reflow without waiting for its exit tween."
It requires the exiting element to actually unmount. The Section Host's hard product law forbids
this: Items and Procedure must both **stay mounted** at all times (procedure steps are
evidence-derived and must never unmount/reorder — see companion brief §13 "Non-negotiable
invariants," unchanged by this doc). This is a resize-in-place problem, not an enter/exit problem.
**`popLayout` is not the mechanism; plain `layout` per §2.2 is.**

### 2.5 The house's tween-only (no-spring) rule for layout push jobs is confirmed, not contradicted

Every fetched Motion example that resizes a persistent layout element uses the modern spring
shorthand — `{ type: "spring", visualDuration: 0.2, bounce: 0.2 }` (toggle switch, radix-accordion) —
while the card-stack drag example uses raw `stiffness`/`damping` for a **physical, gesture-driven**
interaction. Cycle Forge's `motionBezier.layout` (fixed-duration tween, no spring) for `push.rail`-
class jobs is a **deliberate, different, and still-correct** choice for this specific class of
animation — not something Motion's examples override. The house rationale
(`motion-crossfade.md` → "Sanctioned layout animation #1"): *"Tween, never spring — a spring
overshoots its target, and the target here is the width every sibling lays out against."* A toggle
handle's spring is safe because nothing else in the tree measures against the handle's resting
position; a Section Host resize is exactly the case where a sibling **does** lay out against the
result (the collapsing section's new chrome height). **No change recommended — this finding
strengthens the existing house rule with a real contrast case, it doesn't just assert it.**

---

## 3. What Motion's docs explicitly do NOT cover (stays open for the companion brief)

Searched and read `react-scroll-animations`, `react-use-scroll`, `react-layout-animations`,
`react-motion-component`, `react-animate-presence` in full. None of them discuss:

- **`scroll-padding-bottom` interaction with `Element.scrollIntoView({ block: 'end' })`** under an
  absolutely-positioned sibling overlay. This is pure browser/CSSOM behavior, not a Motion API
  surface — Motion's `useScroll` only *reads* scroll position as motion values, it never calls
  `scrollIntoView` or sets `scroll-padding` itself. **Stays a genuine open question** — hand to
  Gemini / MDN / browser-engine research, not to Motion.
- **`position: sticky` nested inside `overflow-y-auto` inside a flex column with
  `justify-content: flex-end`.** Motion's docs mention `position: sticky` exactly once, in the
  *unrelated* "Horizontal scroll section" recipe (a wide `sticky` container used for a
  scroll-scrubbed horizontal gallery — nothing to do with vertical dock clearance). **Stays open.**
- **CSS Grid `1fr` floor vs Flexbox `min-h-0 flex-1` as the Section Host's container contract.**
  Motion animates whatever layout the DOM already computes — it has no opinion on which CSS layout
  model produces that box. This remains a plain CSS-authoring decision. **Stays open**, though §2.2
  above establishes that either model works equally well as a `layout`-animation target (Motion
  doesn't care), so the choice should be made on CSS merits (grid `1fr` is simpler for "exactly one
  variable-size row among fixed ones") not on animation-compatibility grounds.
- **Industry-idiom precedent** (VS Code/JetBrains panel maximize, Linear peek→full, POS/WMS
  directed-workflow shells). Motion is a browser animation library; it has no opinion on product
  information architecture. **Stays entirely with the companion brief.**

---

## 4. One-line amendments this doc licenses immediately (no Gemini round-trip needed)

These don't require product/industry research — they're settled by the doc text above and can go
straight into a follow-up PR:

1. **File a standalone fix:** `StationWorkbench.tsx:142`'s scroll port needs `layoutScroll` (promote
   to `motion.div` or wrap). Independent of the Section Host redesign; blocks nothing else.
2. **Do not add `layoutRoot` to the floating dock.** It's `position: absolute`, not `fixed` — outside
   `layoutRoot`'s documented scope. Only reach for it if a specific, observed drift bug names it.
3. **Do not reach for `layoutAnchor` to solve dock-occlusion or scroll-clearance.** It corrects
   nested-`layout`-animation projection math between a parent and child running *different*
   transitions — it has no relationship to scroll position, `sticky`, or an absolute sibling.
4. **When the Section Host ships, use bare `layout` (not `layoutId`) + `LayoutGroup`**, driven by a
   single `activeId` state value (Radix `type="single"` shape) — not a shared-element
   modal/overlay pattern (App Store example is the wrong precedent).
5. **`AnimatePresence mode="popLayout"` is not applicable** to section resize (sections never
   unmount) — don't bring it into scope for this feature.
