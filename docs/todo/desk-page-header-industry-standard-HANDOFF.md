# HANDOFF — Desk page header: title · CTA · tabs · detached table

**Written:** 2026-08-30 · **Branch:** `main` · **Status:** ready to execute
**Composes (do not fork):** [`desk-page-chrome-fixed-width-PLAN.md`](./desk-page-chrome-fixed-width-PLAN.md) — stage measure + the desk/scan-station split
**Reference:** the Anthropic Console *API keys* page (operator-supplied screenshot, 2026-08-30)

---

## The one-line ask

The desk currently crams its tabs and its primary CTA into a single 28px ops
band, and the data table starts immediately under it. Split that into the
**industry-standard page header**: a page title top-left with a real CTA button
top-right, tabs on their own row underneath, and a clear gap before the table —
all inside the existing fixed-width stage.

```text
┌ stage: max-width DESK_STAGE_MAX_PX (1152), centred, gutters ────────────┐
│                                                                          │
│  To ship                                        [  Add order  ]          │  ← title · CTA
│                                                                          │
│  Orders   Amazon Prep                                                    │  ← tabs
│  ────────                                                                │     underline = active
│                                                                          │
│                             ↕ detachment gap                             │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ ⌕ Filter…                                    [filter] [fields]  ⤢  │  │  ← table's own header
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ Order    Item              Status      Amount                      │  │  ← column header
│  │ …                                                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Fullscreen is a different frame, not a wider one.** The page header and the
tab row are NOT rendered; the table card alone takes the whole content canvas:

```text
┌ content canvas — flush, no gutters, no page header, no tabs ─────────────┐
│ ⌕ Filter…                                       [filter] [fields]   ⤢    │  ← search LEFT, exit RIGHT
├──────────────────────────────────────────────────────────────────────────┤
│ Order    Item                     Status      Amount      …              │
│ …                                                                        │
│ …            the entire table, every row the viewport can hold           │
└──────────────────────────────────────────────────────────────────────────┘
```

**The detachment is the point.** Today the column header reads as a fourth
chrome row in one continuous slab, so an operator scanning down cannot tell
where the page furniture stops and the data starts. The table becomes its own
card on the page's ground, not the bottom of the header.

---

## Why this is not "just a design system change"

The DS chrome was flattened for the **scan stations** — flush corners, zero
inset, 28px edge-to-edge bands, because at a bench every pixel of chrome is a
pixel not spent on the scan. That is correct there and must not move.

Non-scan desks are the opposite case: the stage is deliberately narrower than
the canvas, the operator is triaging with a mouse, and the chrome needs to read
as a page. The split already exists in code and this handoff extends it:

| | Scan station | Non-scan desk |
|---|---|---|
| Band height | `PRIMARY_CHROME_ROW_FACE` (28px) | page header ~56px, tab row ~36px |
| Corners | flush | `DESK_CHROME_*` rounded |
| Inset | none (`STATION_WORKBENCH_BODY_PAD_X` = `''`) | stage gutters + header padding |
| Title | station identity bar | page title |

**Do not unify these.** They were one token once; unifying is how a scan-bench
measure ended up on a triage desk in the first place.

---

## Scope

**In:** `src/components/desk/DeskPageChrome.tsx`, `src/lib/desk/desk-stage.ts`,
`src/app/shipping/(desk)/layout.tsx`, `src/components/outbound/orders/OrdersDeskAddAction.tsx`,
and whatever supplies the page title.

**Out:** every scan station (`/unbox`, `/pack`, `/test`, `/triage`,
`/shipping/scan-out`); `DataTable`'s internal layout below its toolbar row; the
slot/column model; caged→released domain.

---

## Specification

### 1. Page header row — title left, CTA right

- One row, `justify-between`, vertically centred.
- **Title**: `text-role-title` (18px/600) — NOT `role-display`, which is the
  app's largest and belongs to empty states and splash. Text comes from the
  desk's own nav entry (`SIDEBAR_PAGE_NAV` label) so it cannot drift from the
  spine; pass it as a `title` prop rather than reading nav inside the chrome —
  the chrome takes data, it does not look things up.
- **Optional subtitle/count** under the title: `text-role-caption text-text-soft`.
  Omit entirely when there is nothing true to say — never print a placeholder.
- **CTA**: a real `Button` from `@/design-system/primitives`, `size="md"`
  (36px) or `size="lg"` (40px) — this is the one place on the desk where a
  full-size button is correct, because it is a page-level primary action rather
  than a chrome control. `variant="primary"`, `radius` per the reference (pill
  or `lg`). Label is a verb phrase: **Add order**, not **Add**.
- Row padding: `px-4 py-3` (or the closest existing spacing token). Header sits
  INSIDE the stage measure, so title and table left edges align exactly.

**The current 20px band-cell Add is retired by this change** — it exists only
because the 28px band could not hold a real button. Once the CTA has its own
row, that constraint is gone. Keep `DeskActionSlot` as the seam (the layout
still must not import one desk's intake); only the rendered node changes.

### 2. Tab row — its own line, underline selection

- Separate row beneath the header, left-aligned, starting at the same left edge
  as the title.
- Height ~36px; `gap-1` between tabs; each tab `px-3`.
- Active = **solid hairline underneath** (`bg-text-default`, `h-px`,
  `absolute inset-x-0 bottom-0`) plus `font-semibold text-text-default`.
  Inactive `text-text-muted`, hover to `text-text-default`. Colour only — a tab
  that grows or slides moves its neighbours, which ops chrome forbids
  (AGENTS.md).
- The row carries a full-width bottom hairline (`border-b border-border-soft`)
  so the underline reads as *selected segment of a rule*, not a floating dash.
- **No CTA on this row.** It moved up. The tab row holds tabs only.

### 3. Detachment — the gap that matters most

- Vertical gap between the tab row and the top of the table card: **16px**
  (`mt-4`). Not 8 — at 8 it still reads as one slab.
- The table becomes a card: `rounded-lg border border-border-soft
  bg-surface-card overflow-hidden`, on a page ground of `bg-surface-canvas`.
- The header + tabs sit on the CANVAS, not inside the card. That is what makes
  the card read as a separate object.
- In fullscreen the header and tabs are **not rendered** and the card goes
  flush and square — see §4, which is the authority on that state.

### 4. Fullscreen — the TABLE goes fullscreen, not the page

This is the part most likely to be built wrong, because the obvious reading of
"fullscreen" is *make the existing layout wider*. It is not. Fullscreen swaps
the frame:

| | Default | Fullscreen |
|---|---|---|
| Page header (title + CTA) | rendered | **not rendered** |
| Tab row | rendered | **not rendered** |
| Stage gutters | `DESK_STAGE_GUTTER_CLASS` | none — flush |
| Card measure | `DESK_STAGE_MAX_PX` (1152) | full content canvas |
| Card corners | rounded | square (a radius on a card that fills its canvas is a corner with nothing behind it) |
| Table's own toolbar row | search left · filter/fields · ⤢ right | **unchanged** — this row is the whole chrome now |

So in fullscreen the operator sees exactly two things: the table's own header
row, and the table. **Search sits at the top LEFT of that row; the fullscreen
toggle sits at the top RIGHT of the same row.** Both are already there in the
default state and neither moves — that is the point of having put the toggle on
the table's row rather than the page header. Nothing is re-parented on toggle;
the rows above simply stop rendering.

Why hide the tabs rather than keep them: the header and tabs are page
furniture, and fullscreen is the operator saying *this table is the whole job
right now*. Keeping a tab strip above a full-canvas grid would spend the two
rows fullscreen was pressed to reclaim.

**Consequences to build for, not around:**

- The toggle is the ONLY way back. It must stay visible and unambiguous — never
  scroll it out of view with the grid, never let a wide table push it off the
  right edge. The toolbar row is `shrink-0`; the ⤢ is `ml-auto` and pinned.
- Bind **Escape** to exit fullscreen as well. With the tabs gone the operator
  has lost their navigation, and a mode with one small exit and no keyboard way
  out is a trap.
- Swap the icon and the label together: `Maximize2` / "Expand table to
  fullscreen" → `Minimize2` / "Exit fullscreen", with `aria-pressed`.
- Class swap only. Nothing tweens `width`, `max-width`, `height` or a framer
  `layout` — AGENTS.md, and a stage that animates its own geometry delays the
  paint the operator clicked for.
- Interaction budget: 1 click in, 1 click (or Esc) out.

Ownership stays as built: `DeskPageChrome` owns the state and publishes it via
`DeskStageProvider`; `DataTableFullscreenToggle` reads `useDeskStageOptional()`
and renders nothing off a desk stage, so station embeds never get a dead
control. Do not move the toggle up to the page header — in fullscreen that
header does not exist.

### 5. The height chain — do not break it

Every box from the chrome root down carries **both** `min-h-0` and
`overflow-hidden`. They are different jobs: `min-h-0` lets a flex child shrink
below its content; `overflow-hidden` clips so the grid scrolls INSIDE the card
instead of painting past it. Adding two new fixed-height rows above the stage
means the card's flex-basis changes — verify the grid still self-scrolls and
the page itself never gains a scrollbar.

---

## Anti-goals

| Do not | Because |
|---|---|
| Put the CTA back on the tab row | The whole point is a page-level action at page-header altitude |
| Use `role-display` for the title | That is splash/empty-state size; a desk title is `role-title` |
| Give scan stations a title row | They have station identity chrome and a 720 floor; this is not for them |
| Animate the tab underline sliding between tabs | Layout tween on ops chrome — AGENTS.md forbids it. Show it or don't |
| Add a third measure token | `DESK_STAGE_MAX_PX` is the one desk width. Header, tabs and card all use it |
| Keep the tabs (or the title) visible in fullscreen | Fullscreen exists to reclaim exactly those rows; keeping them spends what it bought |
| Re-parent the search or the ⤢ on toggle | They are already on the table's own row in both states. Only the rows ABOVE stop rendering |
| Hardcode "To ship" in the chrome | Title is a prop; the chrome must stay desk-agnostic |

---

## Files

| File | Change |
|---|---|
| `src/components/desk/DeskPageChrome.tsx` | Add `title` + `cta` props; render header row, tab row, detached card |
| `src/lib/desk/desk-stage.ts` | Add header/tab-row/gap tokens beside `DESK_CHROME_*` |
| `src/app/shipping/(desk)/layout.tsx` | Pass the title from the active nav entry |
| `src/components/outbound/orders/OrdersDeskAddAction.tsx` | Band cell → real `Button`, label `Add order` |
| `src/components/tables/DataTable.tsx` | Only if the card border/radius needs to move here |

---

## Verify

1. `npm run verify` green.
2. On a Mac-width viewport: gutters visible; title, tabs and the card's left
   edge on one vertical line; a real gap between tabs and card.
3. Fullscreen: the title, the CTA and the tab row are all GONE; the table fills
   the canvas edge to edge; search is top-left and the ⤢ is top-right of the
   same row; the grid still scrolls inside the card and the page never scrolls.
   Exit by the toggle AND by Escape restores every row.
4. `/unbox`, `/pack`, `/test`, `/shipping/scan-out` pixel-unchanged — no title
   row, no card, still edge-to-edge.
5. `src/lib/desk-stage-surface.test.ts` still passes (rail-less contract).
6. The tab underline is the only selection mark — no filled face, no border box.

---

## Open question for the operator

The reference has **no tab row** — its page is title · CTA · search · table. Our
desk needs tabs (Orders · Amazon Prep). This handoff places them between the
header and the card. If the operator would rather the tabs sit on the CARD's top
edge (a segmented control inside the table's chrome, the Linear pattern), that is
a different and equally defensible layout — but it is a decision, not a detail,
and it changes where the detachment gap goes.
