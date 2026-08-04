# Unbox pane close button — wrong scope + wrong position HANDOFF

**Created 2026-08-02.** Product feedback on the pane utility row shipped the
same day (`docs/todo/unbox-right-edge-sot-updates-HANDOFF.md`, Ruling B). The
button's *behavior*, not its gating, is wrong.

---

## Paste this into a new session

> Read `docs/todo/unbox-carton-close-button-scope-HANDOFF.md`.
>
> The `→|` button in the Unbox pane utility row (top-right of the carton, beside
> the scan-progress ring) currently closes the WHOLE CARTON — it should only
> close the right panel (the Displays push column). It also needs to move to
> the leftmost position. Investigate the two open questions in §3 before
> touching code; they change what "leftmost" and "close the panel" actually mean
> once the button stops being carton-scoped. Verify in a browser on `:3050`
> (attach, never start/restart/kill) before calling it done.

---

## 1. What's wrong

Screenshot: the pane utility row shows `→| ^ v` then a hairline then the
scan-progress ring (highlighted/focused). The user's report, verbatim:

> "the back collapse button in the top right must not close the carton it must
> only close the right panel and the button must be moved to the most left
> side"

**Current behavior of `→|`** (`ArrowRightToLine`, tooltip "Close carton"):

```
LineEditPanel.tsx        onCloseCarton prop → tooltip "Close carton"
  ↓
UnboxLineWorkspace.tsx   <ReceivingLineWorkspace onClose={onCloseWorkspace} />
  ↓
ReceivingLineWorkspace   onCloseCarton={onClose}   (passes it straight through)
  ↓
onCloseWorkspace          closes the WHOLE carton — the operator lands back on
                           the Recent/Queue/History table.
```

This is **not a bug** — it is exactly what `source-of-truth.md` → Right-rail
modality and `LineEditPanel`'s own docblock currently say this button does:

> "Record cursor + dismiss for the CARTON, rendered in the pane-anchored
> utility row beside the progress ring."

The `→|` glyph itself (`ArrowRightToLine`, "pushed back to the edge it came
from, not cancelled") was chosen for a *record inspector* semantic
(`right-rail-inspector.md`), then reused here for carton dismiss. The user is
now saying that reuse is wrong for this surface: at a bench, closing the whole
carton from a corner icon next to a *panel* toggle reads as "close the panel,"
and the operator loses their carton instead.

**What "close the right panel" already means on this surface:** the ring
(`UnboxScanProgressControl` / `ScanStationProgressRing`) already opens/closes
the Displays column — click it while a display is open and it calls
`onCloseDisplays` → `closeDisplays()` → `setRequestedSideTab(null)`. So the
requested fix makes `→|` and the ring do the **same job** from two positions.
That is either the point (redundant affordance, same as many apps put a close
button at both a panel's corner and its trigger) or a sign the button should be
removed rather than retargeted — see §3.

---

## 2. Where the code lives

| Piece | File | Symbol |
|---|---|---|
| The row + gate | `src/components/receiving/workspace/LineEditPanel.tsx` | `paneUtilityRow`, `showCartonCursor`, `railOpen` (~L519–618) |
| The `→|` control | same file | `onCloseCarton` button, `data-testid="unbox-carton-close"` |
| Carton-close plumbing | `src/components/receiving/unbox/UnboxLineWorkspace.tsx` | `onClose={onCloseWorkspace}` on `<ReceivingLineWorkspace>` |
| Panel-close plumbing (what the fix should call instead) | `LineEditPanel.tsx` | `closeDisplays` (~L226), already wired to the ring's `onCloseDisplays` |
| Prev/next carton (unaffected) | `UnboxLineWorkspace.tsx` | `onPrev` / `onNext` → `receiving-navigate-table` events |
| Guard covering this row (do not let it go stale) | `src/components/receiving/workspace/unbox-right-edge-chrome.guard.test.ts` | *"the cursor trio mounts only while a push column is open"* etc. |
| Prior ruling this corrects | `.claude/rules/source-of-truth.md` → Right-rail modality; `LineEditPanel.tsx` docblock above `showCartonCursor` | "Close leads… dismiss is the control an operator reaches for without looking" |

---

## 3. Open questions to resolve BEFORE implementing

**A. What does "moved to the most left side" mean?**

The button is *already* leftmost of the `close · up · down` trio
(`close · up · down | ring`, left to right). Two readings:

1. It stays inside the trio, which is already correct — nothing to move.
2. It should leave the carton-cursor trio entirely (it is no longer
   carton-scoped once it only closes the panel) and sit at the far LEFT of the
   whole pane utility row / pane-anchored cluster — i.e. before `up`/`down`,
   separated by its own hairline, so the row reads
   `[panel-close] | up · down | ring` instead of the current
   `close · up · down | ring`.

Reading 2 is the one that makes sense of the request — the user is asking for
a reposition *and* a re-scope in the same sentence, and a control that no
longer belongs to "close the carton" no longer belongs grouped with
prev/next-carton either. Confirm this reading against the screenshot (the `N`
cursor annotation in the shared image was pointing near the ring, not `→|` —
worth double-checking which control the report is actually about before
touching either).

**B. Does `→|` survive as a SECOND door onto `closeDisplays`, or does it retire?**

If `→|` and the ring's own click-to-close do the identical job, decide:

- **Keep both** — a corner-of-the-column close mirrors the ring's toggle, same
  redundancy pattern as `RightRailHost` record inspectors (`close · up · down`
  in `right-rail-inspector.md`, which is a genuinely different surface but the
  nearest sibling pattern in this codebase).
- **Delete `→|` and its trio entirely, leaving only the ring** — if the trio's
  whole reason for existing was carton dismiss/step, and that job is leaving,
  `up`/`down` (prev/next CARTON) still need a home; they do not become
  panel-scoped just because `→|` did. Losing carton-close from this row may
  also mean the operator needs a *different* explicit "close carton" control
  elsewhere (identity bar exit chip? — the docblock notes Unbox "had no visible
  prev/next at all, and its only close was the identity bar's exit chip" before
  this trio existed; check whether that chip is still present and sufficient).

**C. Ripple: does `showCartonCursor` gating still make sense?**

Today `showCartonCursor = railOpen && Boolean(onCloseCarton || onPrevCarton ||
onNextCarton)` — i.e. the whole trio (including prev/next-CARTON) is hidden
unless a push column is open. That gate was written for carton-dismiss
semantics ("with nothing open there is no column to park … chrome for a region
that is not on screen" — `source-of-truth.md`). If `→|` becomes panel-close and
moves out of the trio, re-derive whether `up`/`down` (still carton-scoped)
should keep being `railOpen`-gated, or whether they were only gated *because*
they shared a component with `→|`. Update
`unbox-right-edge-chrome.guard.test.ts` and
`tests/e2e/unbox-displays-column.spec.ts` → *"the cursor trio is rail-scoped"*
to match whatever the new split turns out to be — both currently assert the
three controls as one gated unit and will need splitting.

---

## 4. Do not re-litigate

- **Triage's own carton cursor (`TriageLineWorkspace.tsx`) is out of scope**
  unless the user says otherwise — it shares `ReceivingLineWorkspace`'s
  `onPrevCarton`/`onNextCarton`/`onCloseCarton` props, but the report is about
  the Unbox pane specifically (per the screenshot's context bar / carton
  chrome). Confirm before touching Triage.
- **The ring's own behavior is correct and unchanged** — it already opens and
  closes the Displays column; this handoff is about `→|` catching up to it, not
  about changing the ring.
- **`railOpen` derivation itself (single source, ring + trio) is a separate,
  already-shipped ruling** (`unbox-right-edge-sot-updates-HANDOFF.md`) — don't
  undo it while resolving §3C; extend or split it, don't re-derive it from
  scratch.

---

## 5. Verify

1. Open a carton in `/unbox`.
2. With no display open: confirm current row contents match whatever §3A
   resolves to.
3. Open a display (e.g. Classify): click the repositioned/retargeted button —
   the Displays column must close, **the carton must stay open** (still on the
   same carton, not back at the table).
4. Prev/next (`up`/`down`) must still step carton records, wherever they end up
   positioned.
5. Confirm the operator still has *some* explicit way to close the whole
   carton (§3B) — do not silently remove the only carton-dismiss control.

```bash
npx tsx --test src/components/receiving/workspace/unbox-right-edge-chrome.guard.test.ts
npx playwright test tests/e2e/unbox-displays-column.spec.ts --project=qa-desktop --workers=1
npm run verify
```
