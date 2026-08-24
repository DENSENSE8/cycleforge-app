# HANDOFF — motion sweep (execute)

**For a fast model. Mechanical work only. Everything requiring judgment is a
REPORT, not an edit.**

Paste everything below the line into a fresh session pointed at this worktree.

---

You are executing a **mechanical motion sweep** in
`/home/michaelgarisek/Projects/cycleforge-app/.claude/worktrees/warehouse-os-refactor-8f2dc3`.

Do not redesign anything. Do not improve anything you were not asked to change.
Three tasks, in order. Task C is report-only.

## The law you are enforcing

From `docs/warehouse-os/LAWS.md`:

> **M1 — Nothing animates geometry.** No transition and no keyframe may touch
> `width`, `height`, `top`/`left`/`right`/`bottom`, margin, padding, `transform`,
> or framer's `layout` / `layoutScroll` / `layoutId`.
>
> **M2 — Only colour and opacity may animate.**

Why: a collapse that tweens its height still occupies the space for the length of
the tween, which is backwards for an interaction whose only purpose is to hand
space back. A row that springs into position delays the paint that tells a
scanning operator the scan landed. This is WMS software on a warehouse floor.

---

## ⚠️ The trap — read this before touching anything

`layout` is **two different props** in this codebase:

1. **Framer Motion's** `layout` — animates geometry. **This is what you remove.**
2. **A custom prop on this project's own components** — `layout="strip"`,
   `layout="cluster"`, `layout="barDistribute"`, `layout="rows"`,
   `layout="workspace"`, `layout="spread"`, `layout="kiosk-split"`,
   `layout={layout}`. **These are variant names. Deleting one breaks the
   component.**

**The mechanical test — framer's `layout` accepts only these values:**

```
true (bare attribute) | false | "position" | "size" | "preserve-aspect"
```

**Any other string value means it is a custom prop. Leave it alone.**

Second check, always: the element must be a `<motion.*>` tag (`motion.div`,
`motion.li`, `motion.span`, `motion.button`, `motion.img`). If the tag is a
capitalised project component, it is not framer.

---

## TASK A — remove framer layout animation (16 sites, 15 files)

For each site: confirm the element is `<motion.*>`, confirm the value passes the
test above, then **delete the whole prop line**. Do not replace it with
`layout={false}` — delete it.

### A1 · Already gated on a reduce/feature flag — the off-path is proven, safest first

| File | Line | Prop |
|---|---|---|
| `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` | 824, 825 | `layout={animateLayout}` · `layoutScroll={animateLayout}` |
| `src/components/warehouse/RoomsSidebarList.tsx` | 384 | `layout={!reduceMotion}` |
| `src/components/receiving/workspace/PoLineRow.tsx` | 189 | `layout={animateLayout ? 'position' : false}` |
| `src/components/board/SwimlaneBoard.tsx` | 401, 402 | `layout={…? 'position' : false}` · `layoutScroll={colCount > 1}` |
| `src/design-system/components/capture-stack/CaptureStack.tsx` | 119 | `layout={reduceMotion ? false : 'position'}` |
| `src/design-system/primitives/CardShell.tsx` | 180 | `layout={!shouldReduce}` |
| `src/components/station/displays/StationDisplaysEdgeToggle.tsx` | 65 | `layoutId={reduce ? undefined : …}` |

After deleting the prop, **check whether the gating variable is now unused**
(`animateLayout`, `reduceMotion`, `shouldReduce`, `layoutReady`, `reduce`). If a
variable becomes unused, remove its declaration too — lint will fail otherwise.
If it is still used elsewhere in the file, leave it.

`StationDisplaysEdgeToggle.tsx` also has a `STATION_DISPLAYS_EDGE_TOGGLE_LAYOUT_ID`
constant. If nothing else references it after the deletion, remove it and its
export; check with `grep -rn STATION_DISPLAYS_EDGE_TOGGLE_LAYOUT_ID src`.

### A2 · Ungated framer layout — delete the prop

| File | Line | Prop |
|---|---|---|
| `src/components/ui/HorizontalButtonSlider.tsx` | 263 | `layoutId={…}` on `motion.span` |
| `src/components/receiving/workspace/line-edit/CartonMatchHub.tsx` | 707 | `layout="position"` on `motion.div` |
| `src/components/fba/sidebar/active-shipments/ActiveShipmentCard.tsx` | 65 | `layout="position"` on `motion.div` |
| `src/components/shipped/photo-gallery/PhotoViewerModal.tsx` | 582, 617 | `layoutId={heroLayoutId}` on `motion.img` |

`PhotoViewerModal`: after deleting both, check whether `heroLayoutId` is still
used. Note — `src/components/photos/PhotoThumb.tsx` carries a comment saying a
`layoutId` hero morph was already removed there for this reason. You are
finishing that job.

### A3 · Framer layout inside `AnimatePresence mode="popLayout"` — delete the prop, then STOP

| File | Line |
|---|---|
| `src/components/ui/ChipColumns.tsx` | 77, 78 |
| `src/components/ui/DateGroupHeader.tsx` | 164, 165, 170 |
| `src/design-system/components/FilterRefinementBar.tsx` | 168, 200 |
| `src/design-system/components/SectionTabsSlider.tsx` | 391 |

Delete the `layout` / `layoutScroll` props as normal. **Do NOT change
`mode="popLayout"`** — that is Task C, report only.

### A4 · Already a no-op — leave it

`src/components/fba/sidebar/FbaWorkspaceScanField.tsx:223` — `layout={false}`.
Already off. Do not touch.

---

## TASK B — narrow `transition-all` (101 sites, 64 files)

`transition-all` animates every animatable property, including `width`,
`height`, `padding` and `margin`. That is an M1 violation by default.

**Find them:** `grep -rn "transition-all" src --include=*.tsx`

**The transform, mechanically:**

| If the element's `className` … | Replace `transition-all` with |
|---|---|
| contains any `opacity-` class or variant (`opacity-0`, `group-hover:opacity-100`, …) | `transition-[color,background-color,border-color,opacity]` |
| does **not** | `transition-colors` |

Nothing else on the line changes. Keep any `duration-*` and `ease-*` classes
exactly as they are.

**Example:**

```diff
- className="transition-all duration-150 hover:bg-surface-container"
+ className="transition-colors duration-150 hover:bg-surface-container"
```

```diff
- className="opacity-0 group-hover:opacity-100 transition-all duration-150"
+ className="opacity-0 group-hover:opacity-100 transition-[color,background-color,border-color,opacity] duration-150"
```

**Do not** change `transition-colors`, `transition-opacity`, or
`transition-transform` that are already there. Only `transition-all`.

Work file by file. Run `npm run verify:fast` every ~10 files so a mistake is
cheap to find.

---

## TASK C — report only, change nothing

Write these into your final report. Do not edit them.

1. **The 9 `AnimatePresence mode="popLayout"` sites.** `popLayout` runs layout
   projection itself, so removing `layout` does not fully satisfy M1 — but
   switching to `mode="sync"` changes exit behaviour (an exiting item keeps its
   space instead of being popped out of flow), and that is a design call.
   There is a house precedent at `src/components/sidebar/SidebarRailShell.tsx:345`
   choosing `sync` over `popLayout` for this exact reason. **List every site and
   stop.** Find them: `grep -rn "popLayout" src --include=*.tsx`
2. **Any `layout="<string>"` you were unsure about** — the file, the line, the
   value, and the element tag.
3. **Any site where deleting the prop caused a test to fail**, with the failure.
4. **Any file where `transition-all` sat on an element that clearly wanted a size
   or position transition** (an accordion, a drawer, a width toggle). Do not fix
   it. Name it.

---

## Verification — required before you report done

```bash
npm run verify
```

That is lint + typecheck + unit, the whole gate set. It must be green.

If it is red **and the failure is in a file you touched**, fix it.
If it is red **in a file you did not touch**, that is another session's in-flight
work — say so in the report and do not fix it.

`npm run verify --fast` does not work (npm eats the flag). Use `npm run verify:fast`.

---

## DO NOT

- **Do not touch `docs/warehouse-os/prototype/**`.** That is the design surface
  and it is already clean. Nothing there is in scope.
- **Do not edit any `.md` file.** Your output is the report, not a doc change.
- **Do not create a branch.** Verify with `git branch --show-current`; it must be
  `claude/warehouse-os-refactor-8f2dc3`. If it is not, stop.
- **Do not `git add -A`, do not `git stash`, do not commit, do not push.**
  Concurrent sessions share this tree. Leave your changes unstaged.
- **Do not start, restart, or kill a dev server.** The operator owns `:3050`.
- **Do not delete `/01/**`, `/414/**`, `/l/**`, `/p/**`, `/s/**`, `/q/**`.** They
  are live GS1 Digital Link and short-URL resolvers printed on stickers already
  on boxes.
- **Do not add tests.** Especially not any test that `readFileSync`s a source
  file and regex-asserts its contents — that pattern is banned (LAWS.md X1).
- **Do not "improve" motion you find along the way.** Remove what is listed.
  Report what is not.

## If a file has changed under you

The worktree is shared with other sessions. If an edit fails because the content
moved, **re-read the file and re-apply** — do not force it and do not revert
someone else's work.

---

## Report format

```
## Task A — framer layout removal
Sites removed: N/16
Files touched: <list>
Unused variables also removed: <list, or none>
Skipped, with reason: <list, or none>

## Task B — transition-all
Sites changed: N/101   Files: N/64
  → transition-colors: N
  → transition-[…,opacity]: N
Skipped, with reason: <list, or none>

## Task C — report only
popLayout sites: <file:line list>
Ambiguous `layout=` props: <file:line, value, element tag>
Suspected intentional size/position transitions: <file:line>

## Verification
npm run verify: PASS | FAIL
  If FAIL: <output, and whether the file is one you touched>

## Anything surprising
<short>
```

Report the numbers honestly. A partial sweep reported accurately is useful; a
sweep reported as complete when it is not will be found by the next person and
cost more than it saved.
