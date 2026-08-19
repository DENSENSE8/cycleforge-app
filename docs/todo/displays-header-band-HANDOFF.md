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
