# Handoff — MasterNav spine: monochrome, instant, and the empty-column fix

**For:** the next implementing agent (Claude Code / Codex / Cursor / Grok)
**From:** this session
**Date:** 2026-08-08
**Status:** **Code complete for everything below. Typecheck + lint clean on every
file this session touched; 91/91 owned guard tests green; spine E2E 12/12 green.**
`npm run verify` is currently RED for reasons that are **not this change** — see §7,
which is the one thing you must read before assuming you broke something.
**Lane:** `main` checkout, no ad-hoc branch. Attach to `:3050` — **never start,
restart or kill the dev server.** **User owns commits — nothing below is committed.**

**Paste for a new session:**

```
Read docs/todo/masternav-monochrome-and-instant-HANDOFF.md.

§1–§5 are DONE and UNCOMMITTED — a record of what shipped, not a to-do list.
Do not re-litigate the monochrome ruling, the type/density ladder, the
motion removal, or the prefetch/pre-mount work.

Execute §6 (open items) only. Read §7 FIRST: `npm run verify` is red from a
CONCURRENT SESSION's in-flight edits, not from this work — confirm ownership
before you fix anything.
```

---

## 0. What the user asked for, in order

Each of these was a separate instruction; the sequence matters because later ones
reversed earlier ones and the reversals are the interesting part.

1. Make the spine look like a boxed-icon chip surface (a screenshot of the carton
   identity bar's classify pills was supplied as the reference).
2. *"This is completely wrong… should be a very detailed and premium look, think
   premium Linear software, seems like it might be best to not manage colors for
   this?"* — plus an explicit instruction to **interview them one-on-one** rather
   than guess.
3. Drop the ancestor fill; make the nest a plain expand, not a stagger.
4. *"It must display extremely fast, no animation… it must display instantly."*
5. Remove the chevron rotation and the Scan-Stations↔display swap animation too.
6. Diagnose a flash: *"a hardcoded CSS width displays first, then the sidebar."*
7. Fix it, and make the width instant.
8. De-stagger the recent rail onto the same instant framework.

**Step 1 was implemented and then thrown away in step 2.** Do not resurrect it.
The boxed/tinted-row look is recorded in git history and in §1's table as the
thing that failed, not as an option.

---

## 1. The interview (16 decisions, 4 rounds)

The user asked to be interviewed. Four rounds of `AskUserQuestion` produced the
decisions below. **These are settled — treat them as constraints, not options.**

| # | Decision | Chosen |
|---|---|---|
| 1 | Colour in the spine | **None — monochrome.** Delete the hue map |
| 2 | Premium reference | **Linear** (near-monochrome, tight rhythm, type does the work) |
| 3 | "You are here" | Subtle fill + label to full contrast |
| 4 | "Detailed" means | **Craft** — spacing, hairlines, type. Not more data per row |
| 5 | ⌘K palette | Follows the spine; delete the 9-hue map entirely |
| 6 | Section/subgroup header | Same row chrome as everything else |
| 7 | Type | **One size, 13px, new `role-nav`** |
| 8 | Density | **Uniform 28px** rows |
| 9 | Repair's orange icon | **No** — monochrome means monochrome |
| 10 | Hover vs active | Three steps: idle → fainter hover → active |
| 11 | Icons | 16px, **exactly the same ink as the label** |
| 12 | Motion | *(later superseded — see §3)* |
| 13 | Section breaks | **One hairline** per boundary (a gap was rejected on measured geometry) |
| 14 | Expanded vs current | Expanded gets nothing; only the current page fills |
| 15 | Spine plane | **One step below** the work surface |
| 16 | Scope | Spine + spine chrome + ⌘K (**not** the left context rail) |

Two rulings deserve their reasoning carried forward, because both reverse
something that was ratified the day before:

- **Per-section hue is dead for good.** Born 2026-08-01, deleted 08-02, restored
  08-07, extended to idle rows hours later, deleted again 08-08. What settled it:
  with a section drilled open, *every* row in it carried the section tint, so the
  tint marked nothing — and the one genuinely selected row became a slightly
  different shade of the same colour as its four siblings. The change made
  "where am I" **harder** to answer, which was the only question the colour
  existed to help with.
- **`REPAIR_ICON_TINT` is gone from nav**, 12 hours after being ratified as "the
  one earned exception". The cross-registry conflict it fixed is still fixed
  where it mattered (`receiving-type-meta.ts`, `TicketChip`, the functional-hue
  table all agree repair is orange). Those paint a **record**. A nav row is a
  **doorway**, and doorways are now uniformly quiet.

---

## 2. What shipped — file by file

| File | Change |
|---|---|
| `src/lib/nav/spine-section-accent.ts` | **Rewritten**, ~380 → ~140 lines. `SPINE_SECTION_ACCENTS` (9 hues), `SPINE_NEUTRAL_ACCENT`, `REPAIR_ICON_TINT`, and the `sectionActive*`/`sectionIdle*` half of the type are **deleted**. One exported `SPINE_ACCENT`; `spineAccentFor()` survives as the single resolution point |
| `src/components/sidebar/master-nav/SidebarNavList.tsx` | Monochrome; uniform `h-7`; `role-nav` everywhere; 16px icons sharing label ink; section hairlines; ancestor fill dropped; **all motion removed** (no motion import at all) |
| `src/components/sidebar/SidebarNavColumn.tsx` | Plane → `appCanvasClass`; **width tween deleted** (`motion.div` → plain `div` + inline width); **idle pre-mount** added |
| `src/components/sidebar/preload-spine.ts` | **NEW** — the one import site for the spine chunk + `warmSpineChunk()` |
| `src/components/layout/ResponsiveLayout.tsx` | Uses `importSpineChunk()` for the dynamic; idle-scheduled `warmSpineChunk()` backstop |
| `src/components/layout/SidebarCollapseControl.tsx` | Warms the chunk on `pointerEnter` / `focus` |
| `src/components/sidebar/rail-shell/SidebarRecentRailBase.tsx` | `staggerReveal` default `true` → **`false`** |
| `src/components/sidebar/master-nav/StaffAccountFooter.tsx` | Name row joins the `role-nav` / 500 ladder (kept `h-9` — two-line identity) |
| `src/components/CommandBar.tsx` | Band heading glyph → `idlePageIcon` (was `sectionActiveIcon`) |
| `tailwind.config.ts` | **New `role-nav` type role** (13px, no baked weight) + safelist |
| `src/utils/_cn.ts` | `role-nav` registered in the twMerge `font-size` group |
| `src/design-system/foundations/motion-framer.ts` | `spineActiveWash` + `spineBodySwap` **deleted** (duration, transition, presence) |
| Guards | `main-nav-groups`, `station-nav-groups`, `header-mode`, `typography-tokens` rewritten to pin the new contracts |
| Rules | `source-of-truth.md`, `display/motion-crossfade.md`, `display/workbench-master-detail.md` rewritten |

### The ink ladder (all existing tokens — no new colour introduced)

| State | Ink | Plane |
|---|---|---|
| child idle | `text-text-soft` `#64748b` | — |
| parent idle | `text-text-muted` `#475569` | — |
| hover | one step up | `bg-surface-hover` `#f8fafc` |
| **current page** | `text-text-default` `#0f172a` | `bg-surface-card` `#ffffff` |

**The fill ASCENDS toward white, and that is deliberate.** The spine sits one
plane below the work surface (`bg-surface-canvas` `#eef2f7`), so the current row
rises to meet the surface it opens. Darkening instead would need
`surface-strong`, which at 28px reads as a pressed button. Same direction Linear
uses (its dark sidebar selects lighter); inverted only because this theme is
light. The user's spec assumed a white spine and a 6% *black* fill — the
direction flipped as a derived consequence of decision 15, and this was flagged
to them.

---

## 3. Motion: the spine is now motion-free, end to end

`SidebarNavList` imports **no motion barrel**. `SidebarNavColumn` imports none
either. Four treatments were tried across this session and every one lost to the
same argument — this is a navigator whose rows the operator reaches for by muscle
memory, so any duration sits between the reach and the target.

| Treatment | Why it went |
|---|---|
| `spineActiveWash` — 150ms selection settle | Imperceptible once the fill became a few-percent plane step |
| `spineRowStagger*` — 15ms × index nest cascade | A five-row nest reads as a wave travelling down-and-right |
| `collapseHeight` — one-block nest height expand | No sweep, same delay |
| `spineBodySwap` — 120ms body crossfade | `mode="wait"` → ~240ms round trip with an **empty column** between two lists |
| chevron `motion-safe:transition-transform` | 150ms on the control the operator just committed to |
| `motionRole.push.rail` — 240ms column width tween | The app's most-repeated navigation |

**`framerVariants.spineRowStagger*` is NOT deleted** — `CommandBar` still consumes
it, and a palette revealing ranked results is a genuinely different job.
`spineActiveWash` and `spineBodySwap` **are** deleted, presets and all: one
consumer each, and an orphan preset is a knip finding plus an invitation to
re-wire it.

Measured live: probed every element in the column → `transitionsInSpine: {}`,
`chevronTransition: null`. Scan Stations enter = **7ms**, click → painted,
measured in-page across `requestAnimationFrame`.

---

## 4. The empty-column flash — and a diagnosis that was WRONG the first time

The user reported a flash: a fixed-width panel appears, *then* the sidebar fills
it. This section is worth reading in full because the obvious answer was wrong
and the measurements are what caught it.

**First diagnosis (wrong): "it's the lazy chunk."** `DashboardSidebar` is
`dynamic(…, { ssr:false })` with a deliberately invisible `loading` placeholder,
so the reasoning was that the panel paints its chrome while the chunk downloads.
A prefetch was built on that basis (`preload-spine.ts`, two tiers: hover/focus on
the toggle + a `requestIdleCallback` backstop).

**It did not close the gap.** With the chunk verified present before the click
(`chunkFetched: true`, warm call fired once), rows still appeared at 321ms.

**Actual cause, from a `MutationObserver` on the column:**

```
    8ms   <aside> inserts — shell, plane, hardcoded w-[240px], EMPTY
  317ms   the content div finally inserts
  (ZERO network requests in that window)
```

So the ~310ms is the **React mount of the nav subtree**, not a fetch. The column's
geometry and background are constants available on frame 1; its contents are not.

**The fix that worked: mount the subtree during idle** (`everOpened` now also
flips on `requestIdleCallback`, not only on first open). The column stays
`width: 0` + `inert`, so nothing is visible, focusable, or in the tab order until
the operator opens it — React has simply already done the render.

### Measured

| | before | after |
|---|---|---|
| width appears | 10ms | 14ms |
| **full 240px** | **248ms** | **14ms** |
| **rows appear** | **320ms** | **14ms** |
| **empty window** | **306ms** | **0ms** |

Rows are in the DOM (16 of them) before the click. First open now equals second
open.

### Why the user only noticed it now

**This session unmasked it.** The aside used to be `appChromeClass` = `#ffffff`,
the same white as the content column beside it, so an empty 240px panel was
invisible against the page. The plane change to `appCanvasClass` (`#eef2f7`)
turned that same empty panel into a visible gray slab. **The 306ms gap was
pre-existing and unchanged — what changed is that it got a colour.** Say this
plainly if it comes up again; it is not a regression this session introduced.

### The trade, stated honestly

The idle pre-mount walks back part of the bundle-altitude reasoning that
justified the lazy mount (`SidebarNavColumn`'s own docblock). The nav graph now
renders on every desktop page load, and the spine's mount effects run with it —
**measured: 4 nav/prefs requests on page load that previously fired only on first
open.** Three things make it acceptable: it is idle-scheduled so it cannot
compete with paint or TTI; the column is `width: 0` + `inert`; and the chunk was
already being warmed on the same schedule, so the marginal cost is the render.

If this ever needs to go back to lazy, the honest replacement is a skeleton at
the real row geometry — **not** a return to painting a finished, empty panel for
a third of a second.

---

## 5. Recent rails de-staggered (the last instruction)

`SidebarRecentRailBase`'s `staggerReveal` default flipped `true` → `false`. Every
recent-activity rail (Unbox · Triage · Testing · Shipping · Pack · Pickup ·
Labels · Support) now paints its rows instantly instead of cascading them in at
50ms apiece — a ten-row dock was taking ~500ms to finish arriving.

**This turns off the first-load CASCADE, not per-row CRUD motion.** With no
stagger variants, `RailRow` falls back to `framerPresence.sidebarRailRow` — the
scan-in / dismiss-out presence for a row that genuinely arrives or leaves
mid-session. That is feedback about a change the operator *caused*, which is the
opposite case from a list appearing because it loaded. Rails that still want the
cascade pass `staggerReveal` explicitly.

---

## 6. ⚠️ OPEN ITEMS — do these

1. ~~**Visual confirmation of the rail de-stagger.**~~ **DONE 2026-08-08 — measured,
   with an A/B.** Probe: a `page.addInitScript` rAF sampler recording every rail
   `li`'s computed opacity + transform per frame, on `/triage` (`qa-desktop`; the
   QA org's Unbox rail is empty — `UNBOXED · 0` — so Arrival is the station with
   rows). Frame logs, deduped:

   | | frames with motion | first frame rows exist |
   |---|---|---|
   | `staggerReveal = false` (shipped) | **0** | `opacity [1, 1]`, `transform: none` |
   | `staggerReveal = true` (temporary A/B, reverted) | **33** over ~310ms | `opacity [0, 0]` + transform, row 2 lagging row 1 by ~85ms |

   So the de-stagger is real and the probe is not blind — the same sampler on the
   same elements catches a cascade when one exists.

   **Scan-in survives.** Dispatching `receiving-lines-prepended` (the event
   `scan-apply` fires) with a row cloned from `/api/receiving-lines` and a fresh
   id: the arriving row ramps `0 → 1` over ~148ms with a transform, while every
   already-settled row holds `1` and never re-flashes. That is the
   `framerPresence.sidebarRailRow` CRUD path §5 says must survive, and it does —
   `AnimatePresence initial={false}` suppresses only the children present at the
   host's own mount.

   Probe spec was temporary and is deleted; screenshot at
   `test-results/rail-destagger-load.png` (gitignored).
2. **Production timing.** Every number in this doc is from the **dev** server.
   Dev overstates React mount cost (no minification, dev-mode instrumentation,
   Turbopack HMR runtime) — and during this session a first `import()` also
   triggered on-demand compilation, which contaminated one early measurement and
   was only caught by re-running. The 306ms → 0ms result is real and directional,
   but confirm against a production build before quoting the number anywhere.
3. **Reconsider the idle pre-mount's request cost** (§4, "the trade"). 4 extra
   requests per desktop page load is small but real. If it matters, the
   `/api/nav` query already has a 5-minute `staleTime`; the others were not
   audited.
4. **`desktop` Playwright project is still hard-down** — `account signin failed
   (401): INVALID_CREDENTIALS`, unchanged from the previous handoff and unrelated
   to any of this. Everything here was run on `--project=qa-desktop`, which the
   global-setup message explicitly says is unaffected. Do not try to fix the
   credentials or sign in manually; report it if still live.

---

## 7. ⚠️ READ BEFORE YOU "FIX" A RED GATE

`npm run verify` passed twice cleanly mid-session and is red now. **A concurrent
session is actively editing this tree**, and every red gate traced to its files,
not to this work. Evidence, so you do not re-derive it:

- A typecheck error appeared in `SupportOrdersFocusHost.tsx`, then **cleared on
  its own** while untouched.
- A later error in `receiving-modes.ts` likewise appeared and cleared.
- `UnboxWorkspaceHeader.tsx` errors (`pinnedExtras` undefined) appeared late.
- The knip finding list **changed between two consecutive runs** (14 → 12, with
  `testing-procedure.ts` newly appearing as an untracked file).
- One E2E probe returned all `-1` values because the dev server was mid-broken-compile.

None of those files were touched by this session. `workflow-safety.md` is
explicit: *run the failing gate on your files before assuming the red is yours,
and report which failures are pre-existing rather than silently fixing them.*

**Files this session owns** (run gates against these): `spine-section-accent.ts`,
`SidebarNavList.tsx`, `SidebarNavColumn.tsx`, `preload-spine.ts`,
`ResponsiveLayout.tsx`, `SidebarCollapseControl.tsx`, `SidebarRecentRailBase.tsx`,
`StaffAccountFooter.tsx`, `CommandBar.tsx`, `tailwind.config.ts`, `_cn.ts`,
`motion-framer.ts`, and the four guard tests + three rules files listed in §2.

Last clean state for those: **tsc clean, eslint clean, 91/91 owned guards, 12/12
spine E2E.**

---

## 8. Out of scope — say no to these

- Re-opening whether the spine should be coloured. Three rounds, three deletions;
  the bar for overturning is new evidence, not a new preference.
- Giving any bench its own hue (Repair included — §1, decision 9).
- Re-adding **any** motion to the spine or its host. Not a crossfade, not a
  settle, not a rotate transition. `main-nav-groups.guard.test.ts` fails on the
  motion import itself.
- Restoring the two-tier 14px/12px type ladder or the 36px/24px height jump.
- The **left context rail** (recent rails' own row anatomy, scan bands, filter
  footers) beyond the §5 stagger default — the user scoped it out in decision 16,
  and its status dots are load-bearing.
- Touching `receiving-type-meta.ts`'s repair orange or `workflowStageDot` — those
  paint records, not doorways.
