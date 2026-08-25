# TASK — an order search displays IN the composer unless a session is armed

**Status: QUEUED TASK, not built. Recorded 2026-08-25 from the operator's
dictated ruling of the same day.** Sibling to
[`HANDOFF-session-composer-ux.md`](HANDOFF-session-composer-ux.md) (whose
§1–§7 are LIVE) and to [`PLAN-composer-modes.md`](PLAN-composer-modes.md)
(this changes the same commit path that plan's mode row reads).

## The ruling, verbatim

> "Even searching for an order should not display in a different tile
> since that is like a main function — it should display in the composer
> itself. If in session — a current session — and the order number is
> searched, then open tile; if no session opened currently and order
> number is searched, then embed in [the composer] itself."

## Clarified into scope

Today, committing an order in the composer (`useShell.onComposerCommit`,
case `'order'`) ALWAYS opens the Orders queue tile plus the order's own
detail tile. The ruling splits that on the one fact the shell already
holds — whether a block is armed:

| State | An order # committed in the composer |
|---|---|
| **A session is armed** (`armedBlock` set) | As today: queue tile opens/refocuses, the order lands as its own detail tile (C8 retarget rules unchanged), write-target snaps. |
| **No session armed** | **NO tile opens.** The resolved order embeds in the composer surface itself — an order card in the chronology, directly above the field, where the search was typed. Search is a main function of the One Field, so its result belongs on the field's own surface. |

## Build notes (for whoever picks this up)

- The branch point is exactly one place: `onComposerCommit`'s `'order'`
  case in `useShell.ts` — gate the `openTile('orders', …)` /
  `openOrderDetailTile(…)` pair on `armedBlock`, and in the no-session
  branch append the resolved order into the feed instead.
- The embed wants a real shape, not a prose line: likely a new
  `FeedEntry` kind (`'order'`) carrying the resolved row, rendered as a
  compact card — `OrderIdChip` / `PlatformChip` / `TrackingChip`
  (`id-chip.tsx`, Q4 last-8 faces), product title, stock/ship-by facts.
- Law interaction: this AMENDS the C8 world's reach — C8 rules where a
  display lands **among tiles**; this ruling says with no session armed
  an order display does not go to the canvas at all. When built, record
  the amendment in LAWS.md explicitly (X3), not silently.
- `dispatchOpenShippedDetails` and the write-target snap in the current
  handler need a decision in the no-session branch (see open questions).

## Open questions for the operator (ask before building)

1. Does the embedded order card carry the FULL detail (activity, notes,
   verbs) or the identity card with an "open as tile" affordance for
   drill-in?
2. Does the composer's write-target still snap to the embedded order —
   i.e. is prose after a no-session search a note on that order?
3. In the armed case, is today's pair (queue tile + detail tile) right,
   or should only the detail tile open?
