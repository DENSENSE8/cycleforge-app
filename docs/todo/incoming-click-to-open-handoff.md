# Handoff: Incoming details panel still opens on page load

**For:** next coding agent  
**Lane:** `main` (WS-DOGFOOD)  
**Status:** **RESOLVED (2026-07-21)** — root cause was the Unbox focused-carton
restore, not an auto-select. Desired UX (**table-only until row click**) now holds.  
**Do not re-enable** browse-first auto-detail.

---

## Resolution (2026-07-21)

**Root cause — the second, still-live open path.** `?openReceivingId=` is the
**Unbox** surface's focused-carton URL SoT (written only on `/unbox` by
`syncUnboxOpenUrl`, which is gated `if (!isUnboxSurface) return`). The **read**
side — the deep-link restore effect in `useReceivingWorkspacePane` — was **not**
surface-gated. A stale `openReceivingId` that rode a mode switch onto `/incoming`
(it is not in `MODE_SCOPED_PARAMS` and `stripCrossSurfaceParams` leaves it) made
the restore fetch the carton and fire `dispatchSelectLine(pick)`. On Incoming,
`useReceivingDetailOverlays`' `receiving-select-line` listener turned that into
`setIncomingDetails(...)` → `IncomingDetailsPanel` (`RightRailHost` `role=dialog`)
opened on load. `useIncomingAutoSelect` really was gone; this was a separate path.

**Fix — make the read symmetric with the write.** New pure SoT predicate
`shouldRestoreOpenReceiving(isUnboxSurface, openReceivingId)` in
`src/lib/receiving/unbox-selection-url.ts`; `useReceivingWorkspacePane` gates both
the `restorePending` seed and the restore effect on it (added `isUnboxSurface` to
the effect deps). No other surface restores from a param it never wrote. No
symptom-patch in the overlays listener; no URL-semantics change on Unbox.

**Tests.** Unit: `shouldRestoreOpenReceiving` cases in
`src/lib/receiving/unbox-selection-url.test.ts` (the off-Unbox case IS the
regression). E2E: `tests/e2e/incoming-click-to-open.spec.ts` — fresh `/incoming`
and a leaked `?openReceivingId=` both assert `role="dialog"` count 0 on load;
row-click opens then close-stays-closed (skips when dogfood has no rows).
`npm run verify` green (tenancy-isolation warnings are pre-existing/advisory).

---

## Prompt (paste into a new agent session)

```text
You are continuing Cycle Forge Incoming workbench work on lane `main`.

## Mission

Fix: `/incoming` (POS view, `?incview` absent or `pos`) must show the **table only** on load. The Incoming details stack (`IncomingDetailsPanel` → `DetailStackRailRegistrar` → `RightRailHost`) must open **only after an explicit row click** (or keyboard prev/next after a selection exists). Closing the panel must leave the table with no details dialog.

This was requested after a mistaken browse-first auto-select pass. That hook was deleted, but the panel **still opens on page open** for the operator. Find the remaining trigger and kill it.

## Desired contract

| Action | Expected |
|---|---|
| Navigate to `/incoming` (fresh or soft-nav from another receiving surface) | Table + KPI + chrome; **no** `role="dialog"` detail stack |
| Click a PO / shipment / eBay row | Details stack opens for that row |
| Backdrop / Esc close | Panel gone; row highlight cleared (`receiving-clear-line`); **no** immediate re-open |
| `?incview=email` | Email Triage only; no PO details panel |
| `?recvId=` deep link | May select that carton (deep-link hook) — Incoming rarely uses this; do not treat as “open first row” |

## Already done (do not redo)

1. **Removed** `src/components/station/useIncomingAutoSelect.ts` (+ unit test + `tests/e2e/incoming-auto-detail.spec.ts`).
2. **Removed** call site from `ReceivingLinesTable` and `INCOMING_DETAILS_DISMISSED_EVENT` from `ReceivingDashboard`.
3. **Kept** PaneHeader chrome on `IncomingDetailsPanel` / `IncomingDetailsHeader` (display polish is fine).
4. **Kept** clear-on-email in `useReceivingDetailOverlays(isIncomingMode, incomingView)`.
5. Worklog: `Incoming: click-to-open only (no auto-detail on load)`.

Confirm on disk: `useIncomingAutoSelect` must **not** exist. Grep the tree for it.

## How the panel opens today (only path)

```
receiving-select-line (CustomEvent, row payload)
  → useReceivingDetailOverlays (when isIncomingMode)
       → setIncomingDetails({ poId | shipmentId | inbound… })
  → ReceivingRightPane mounts IncomingDetailsPanel
       → DetailStackRailRegistrar → RightRailHost (role=dialog)
```

So **something is still dispatching `receiving-select-line` with a non-null row on Incoming load** (or `incomingDetails` is seeded another way). `setIncomingDetails` is only called from that listener (+ clears). There is no URL param that seeds Incoming details.

Dispatchers of `dispatchSelectLine` / `receiving-select-line` to audit (not all fire on Incoming):

- `useReceivingRowSelection.handleSelectRow` — **click / toggle** (expected)
- `useReceivingDeepLink` — only if `?recvId=` present
- `useReceivingTableNavigation` — prev/next; requires existing `selectedId`
- Sidebar rails / scan / PoLineRow / Testing — wrong surface if they fire while `/incoming` is active
- Any leftover auto-select / restore effect

## Investigation checklist (do in order)

1. **Hard-reload sanity**  
   - Confirm HMR/dev server isn’t serving a stale bundle that still had `useIncomingAutoSelect`.  
   - `rg useIncomingAutoSelect src` → zero hits.  
   - Fresh `/incoming` with clean query string (no `recvId`, `incview`, `openReceivingId`).

2. **Instrument the event (temporary)**  
   In `dispatchSelectLine` (`receiving-lines-table-helpers.ts`) or the overlays listener, log `console.trace('receiving-select-line', row?.id)` once. Reproduce open-on-load; capture the stack. That is the smoking gun.

3. **Shared table mount across History ↔ Incoming**  
   `ReceivingRightPane` keeps the History/Incoming table mounted with `display: none` across mode flips. Soft-nav from `/receiving/history` (or Unbox/Triage → Incoming) may leave `selectedId` and re-fire select when `isIncomingMode` becomes true. Check:
   - Does mode switch always fire `receiving-clear-line`? (`useReceivingMode.updateMode`)
   - Does path-first nav via `<Link href="/incoming">` skip `updateMode` and skip clear?
   - On Incoming mount, if `selectedId != null`, does anything re-`dispatchSelectLine` the current row?

4. **Deep link / sticky URL**  
   Check the address bar for `recvId`, `lineId`, `openReceivingId`. `useReceivingDeepLink` will select + dispatch when `recvId` matches a loaded row.

5. **Wrong panel**  
   Confirm the dialog is `IncomingDetailsPanel` (PO / Purchase order eyebrow), not `ReceivingDetailsStack`, assistant dock, or `GlobalDetailStackHost`. Wrong occupant → different bug.

6. **Right-rail occupant leak**  
   `RightRailHost` is global. A prior detail claim that didn’t unregister could flash. Incoming path should only register when `incomingDetails != null`.

## Likely fixes (pick based on stack trace)

- **Path-nav without clear:** on `isIncomingMode` rising edge, force `setIncomingDetails(null)` + `receiving-clear-line` + clear table `selectedId` (don’t wait for `updateMode`).
- **Re-dispatch of stale selection:** gate overlays so Incoming ignores select events that aren’t from a user gesture / explicit click (or ignore until first user interaction). Prefer clearing selection on enter Incoming over gesture hacks.
- **Deep link:** ignore `recvId` on Incoming POS, or strip it when landing on `/incoming` unless product wants carton deep-links there.
- **Do not** reintroduce first-row auto-select.

## Files to read first

- `src/components/receiving/useReceivingDetailOverlays.ts` — sole `setIncomingDetails` writer
- `src/components/receiving/ReceivingRightPane.tsx` — mount gate + display:none table
- `src/components/station/useReceivingRowSelection.ts` — click → dispatch
- `src/components/station/useReceivingDeepLink.ts` — `?recvId=` path
- `src/components/station/receiving-lines-table-helpers.ts` — `dispatchSelectLine`
- `src/components/sidebar/receiving/useReceivingMode.ts` — mode switch + `receiving-clear-line`
- `src/components/ReceivingDashboard.tsx` — close wiring
- `src/components/right-rail/RightRailHost.tsx` — dialog host

## Tests to add (required)

**Unit / event:** entering Incoming with a stale `selectedId` must **not** open details without a new `receiving-select-line`.

**E2E** (`tests/e2e/incoming-click-to-open.spec.ts` or restore/rename the deleted auto-detail spec):

1. `goto('/incoming')` → wait for list API → assert `getByRole('dialog')` count **0**.
2. Click first `[data-line-row-id]` → dialog visible.
3. Backdrop close → dialog gone; wait ~500ms → still gone (no re-open).

Mock `/api/receiving-lines?view=incoming` + `/api/receiving-lines/incoming/details` if dogfood is empty (see prior deleted `incoming-auto-detail.spec.ts` pattern — invert assertions).

## Constraints

- Stay on current branch/worktree; user owns commits; never stash.
- `npm run verify` green before done; `pnpm worklog "Incoming: no details on load (click-to-open)" --result ok`.
- Compose SoT; don’t fork a second right-rail host.
- Leave PaneHeader Incoming chrome unless it blocks the fix.

## Done when

- [ ] Fresh `/incoming` load never mounts `IncomingDetailsPanel` / no detail `role="dialog"`.
- [ ] Row click still opens details; close stays closed.
- [ ] Root cause named in worklog (which dispatcher / effect).
- [ ] E2E covers load + click + close.
- [ ] `npm run verify` green.
```

---

## Context for the human

| Item | Detail |
|---|---|
| Bug | Details stack still opens when opening Incoming |
| Wanted | Table-only until click |
| Removed already | `useIncomingAutoSelect` (browse-first) |
| Open path | Only `receiving-select-line` → `useReceivingDetailOverlays` → panel |
| Suspects | Stale selection across shared History/Incoming table mount; path nav without `receiving-clear-line`; `?recvId=` deep link; stale HMR bundle |

## Quick local repro

1. Hard refresh `/incoming` (no query params).
2. If dialog appears before any click → bug confirmed.
3. Optional: temporary `console.trace` in `dispatchSelectLine` to capture the stack for the handoff agent.
