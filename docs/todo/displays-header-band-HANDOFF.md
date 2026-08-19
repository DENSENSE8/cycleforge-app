# Displays header band — verification handoff

**Status:** shipped to `main` (`8a8a2c8b5` + `d785a8a8d` + this change).
**Scope shipped:** Unbox · Arrival · Testing. **Not** ported: to-ship / desk.

Paste the prompt at the bottom into a fresh session. Everything above it is the
context that prompt assumes.

---

## What changed

The station Displays push column went from **three chrome rows** to **one**:

```
BEFORE                                  AFTER
┌────────────────────────────────┐      ┌──────────────────────────────────────┐
│ [⛶]              [ring] [↑ ↓]  │      │ [<] Displays … [ring][⟳][🖨][✎][⋮][⤢][→|] │
├────────────────────────────────┤      ├──────────────────────────────────────┤
│ [< >]  Displays                │      │  index / leaf body                   │
├────────────────────────────────┤      ├──────────────────────────────────────┤
│  index / leaf body             │      │ [🔍 Filter displays…              ]  │
├────────────────────────────────┤      └──────────────────────────────────────┘
│ [🔍 Filter displays…      →|]  │
├────────────────────────────────┤
│ [⋯][⟳][🖨][✎][    Delete    ]  │
└────────────────────────────────┘
```

Decisions, each made explicitly by the operator (not inferred):

1. **Verbs moved from the bottom floor to the top-right band.** The retired host
   `StationDisplaysActionFloor` was **deleted**, not left beside the new one.
2. **`⋮` is the last verb cell on every station** — Testing wires neither Refresh
   nor Print, so a fixed trailing anchor is what keeps the reach identical.
3. **Delete + Resolve live inside `⋮`** (`tone="danger"`). `InspectorFlushDelete`
   is gone from this row; the `CARTON_DELETE_UNDO_MS` toast is the safety net.
4. **Refresh is the longest-surviving exposed peer** (operator's explicit pick).
5. **The nav row merged into the band** — `StationDisplayLeafHeader` is now an
   in-band cluster owning no height/seam/background/sticky.
6. **Close moved to the band's far right.** Glyph stays `→|`, not `X`: Displays
   pushes, so the panel parks rather than cancels. The footer keeps the filter
   only and is still the left context rail's twin.
7. **The `>` forward button is gone.** It sat disabled on nearly every frame.
   Forward the *capability* remains: `ArrowRight` still walks the future stack
   while the Right keyboard region owns.
8. **The carton `↑↓` cursor no longer mounts in the band.**

## The one accepted regression — verify this first

**With Displays open there is no carton prev/next.** The vertical `↑↓` on
`ScanStationUtilityRail` unmounts when the column opens, and its in-band
replacement was removed. Paging cartons now requires hiding Displays (`→|`).

This was a deliberate call, recorded in `source-of-truth.md` and in
`LineEditPanel`'s docblock. It is the change most likely to be felt on the floor
and the first thing to check with a real operator.

## Known-red, NOT caused by this work

Two assertions expect another session's in-flight refactor (moving the filter
field out of `StationDisplaysDismissFooter` and into `StationDisplaysPushStack`
under a prop named `onKeyDown`). They were red before this change and are red
now. They are **not** in `scripts/run-unit-tests.mjs`, so they do not gate a push.

- `station-displays-footer-stage.guard.test.ts` — 4 cases
- `station-display-index.guard.test.ts` — "character-select" case
- `unbox-displays-drilldown.guard.test.ts` / `unbox-right-edge-chrome.guard.test.ts`
  — expect `UnboxDockHost`, the `railOpen` peek gate, the Units drill

Do not "fix" these by editing the guards; they describe an architecture someone
is mid-way through building.

## Also fixed in passing (real bug)

`next.config.ts` set `exclude` as a **top-level** next-pwa option. That key lives
on `WorkboxOptions`, so it was silently ignored and the committed service worker
**was** precaching `_next/static` build output — the stuck-worker / stale-CSS
failure its own comment warns about. Moved into `workboxOptions`.

## Not done

`OrderUpdateDock` (to-ship `detail:order`) and the other 8 `InspectorActionFloor`
panels are untouched. The agreed shape when it happens: **only `⋮` + Delete**
move to `DeskRailChromeRow`'s trailing cluster. The five edit verbs
(Assign/Urgent/Notes/OOS/Ship) stay on the bottom dock because they toggle an
*expanding editor* (`above` → `OrderAssignDisplayHost` + `ShippedPanelEditorDock`),
and the desk header corner already holds the queue `↑↓`, which is the core loop
on that surface.

---

## Handoff prompt

> Verify the Displays header-band change on `main` (see
> `docs/todo/displays-header-band-HANDOFF.md`). Do **not** re-litigate the
> design decisions listed there — they were made explicitly by the operator.
>
> 1. Attach to the running dev server on `http://localhost:3050` (never start
>    one). Open `/unbox`, select a carton, open Displays.
> 2. Confirm the single header band reads left→right:
>    `[<] <title> ……… [ring?] [Refresh?] [Print?] [Edit] [⋮] [⤢] [→|]`, that
>    `⋮` is the last VERB cell (fullscreen and close sit right of it and never
>    collapse), and that there is no `>` forward button.
> 3. Open `⋮`. Confirm Delete is present, styled destructive, and last; confirm
>    Resolve appears only on an unfound carton; confirm the trigger is never
>    disabled.
> 4. Delete a test carton and confirm the undo toast still restores it — that
>    toast is now the only safety layer, since the two-click armed peer is gone.
> 5. Repeat 2–4 on `/receiving` Arrival (no Print) and `/test` Testing (no
>    Refresh, no Print — 2 verb cells + `⋮`).
> 6. Confirm the resize sash on the column's leading edge is still grabbable
>    along its full height, including behind the `[<]` Back control. That was a
>    real past bug (the nav cluster blanketing the sash) and the merge touched
>    exactly that code.
> 7. Confirm `ArrowRight` still walks Displays history forward when the Right
>    keyboard region owns, even though no `>` button exists.
> 8. Report on the accepted regression: with Displays open there is no carton
>    prev/next. Say whether that is tolerable at the bench or should be revisited.
>
> Then run `npm run verify` and report. Expect PASS. If the station guards
> listed under "Known-red" fail, report them as pre-existing rather than fixing
> them — they describe another session's in-flight refactor.

---

## Verification result (2026-08-18)

`npm run verify` → **PASSED** (lint · typecheck · unit+guards · knip · route-auth ·
schema · jscpd · depcruise · doc catalog). Tenancy-isolation static is advisory,
non-blocking, and unchanged.

Runtime evidence comes from a new spec — `tests/e2e/unbox-displays-header-band.spec.ts`
(QA org, `qa-desktop`, provisions its own carton). Measured in the real runner
per `.claude/rules/verify.md`, not an embedded preview pane.

**Unbox — 5/5 pass.** Band as painted, left→right:

```
[< Back to Displays][ title ] … [Refresh][Print][Edit][⋮] [⤢][→|]
       1093            1117        1253    1287  1321  1355 1389 1404
```

- `⋮` is the last VERB; `⤢` and `→|` sit right of it and never collapse.
- No `>` forward button anywhere in the column (asserted by absence).
- `⋮` is never disabled; menu is `Resolve` → `Delete <carton>` with Delete last
  and painted destructive (red computed color). The found case — Resolve absent —
  is the pure `stationDisplaysFloorMoreItems` unit test.
- Delete → undo toast → carton still readable from `/api/receiving-logs` (200).
- **Sash:** 12px wide, 860px tall against an 860px column, and
  `elementFromPoint` at its centre-x resolves to `unbox-displays-push-resize` at
  the top (behind `[<] Back`), middle and bottom. The past blanketing bug has
  not returned.
- **`ArrowRight`** walks the forward stack with no button:
  `Ticket → (Back) Displays → (ArrowRight) Ticket`. The handler is the window
  capture listener in `StationDisplaysPushStack`, gated on
  `isKeyboardRegionOwner('right')`.

**Observed, expected, worth knowing:** on an unmatched (unfound) carton Refresh
paints **disabled** — `canInventorySync` is false with no PO to pull. The cell
still holds its position, so `⋮` does not move.

**Arrival / Testing — verified, exactly as claimed.** The runs were blocked for
a while by another session's in-flight `scripts/postcss/legacy-color-fallback.*`
change (a Turbopack `Cannot find module` build error on every route that pulls
`OutboundSidebarPanel` → `react-day-picker/src/style.css`, which is why `/unbox`
kept working while `/triage` and `/test` did not). Attach-never-start meant
waiting it out rather than clearing `.next`. Measured once it recompiled:

```
ARRIVAL  [inventory-sync][edit][⋮]        3 cells
TESTING  [edit][⋮]                        2 cells
```

`⋮` is last on both. Matches `cartonFloorPeerOrder` and its unit test (10/10).

**Known-red, confirmed pre-existing and untouched.**
`station-displays-footer-stage.guard.test.ts` fails asserting `/Filter displays…/`
inside `StationDisplaysPushStack` — i.e. it expects the filter field to have
already moved out of `StationDisplaysDismissFooter`. That is the other session's
in-flight refactor, exactly as documented. Not fixed, not edited.

**On the accepted regression (no carton prev/next while Displays is open):**
tolerable, and probably right. Reference reading and carton paging are different
beats — an operator reading a Ticket or a manual is not simultaneously hopping
cartons — and `→|` / `⌘]` is one keystroke away. Revisit only if the bench
reports paging *with reference open*; the cheap fix then is the chord, not a
control back in the band, since the band's whole gain was becoming one row.

---

## Follow-on: the filter moved to row 2 (2026-08-19)

Operator direction after the band landed — **the bottom bar is gone**:

```
Row 1  [< Back] title ……… [Refresh?][Print?][Edit][⋮] [⤢][→|]
Row 2  [🔍 Filter displays…                              ]   ← Root Index only
Body   VERIFICATION · index rows / leaf body
```

`Filter displays…` is now a `subHeader` slot on `StationDisplaysPushColumn`,
mounting the **same find face as the Unbox sheet's Band 3**
(`TechRailSearchBar variant="chrome"` + `min-w-0 flex-1`), so one component and
one rhythm covers both surfaces. The `footer` slot is **removed**, not emptied.

The left-context-rail-twin argument that kept the filter at the bottom was
really about it sharing a band with `→|`; once the dismiss moved up on
2026-08-18 the pairing was already broken, and what remained was a find field
sitting *below* the list it filters.

**Deleted with the band** (retirement, not parking): `StationDisplaysDismissFooter`,
`StationDisplaysCommandFooter`, `displays-footer-command.ts`, and the
`setLeafCommands` leaf-chrome API. The `/` command footer was an opt-in stage
with **zero** leaves opting in — both call sites passed `null` — so it was a
stage nothing could paint.

**Guard:** `station-displays-footer-stage.guard.test.ts` → rewritten as
`station-displays-chrome-rows.guard.test.ts` (8/8). It keeps every invariant the
old one held (index-only filter · no leaf eject-by-typing · Esc clears the
filter first · no page-local twin) and adds that the deleted files stay deleted.
That guard was in the "Known-red" list above; it is green now because the
architecture it described finally exists.

**Measured @1440 on a 360px column:**

```
band       y  40  h 28
filter row y  68  h 33   w 359 (column 360)   1 input
index      y 101              ← first group eyebrow
footer     none
```

Typing narrows the index; a leaf paints no filter row at all.

**Gate:** `npm run verify` — every gate green except knip, which reports one
unused export (`nasArchivePendingQueryKey`) in another session's untracked
`src/hooks/useNasArchivePending.ts`. Not from this work; baseline not refreshed.
