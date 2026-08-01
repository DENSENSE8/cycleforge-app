# EXECUTION PROMPT — Lane E · Tab strip → right details panel

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`docs/todo/unbox-E-tabs-to-right-rail-PLAN.md`](./unbox-E-tabs-to-right-rail-PLAN.md) — the plan wins on conflict.
> **Sequencing:** run this **before** Lane B Phase 3. E and B both edit `LineEditPanel.tsx` — never run them at once.

---

# Cycle Forge — Lane E: empty the tab strip out of the workbench

You are Claude Code in the Cycle Forge monorepo. This is a **relocation**, not a redesign. Every moved tab keeps its current body and behavior.

## Mission

Delete the Unbox tab strip from the workbench body. `overview` becomes the whole center. The other eight tabs plus the PO-pairing pencil move into `ReceivingDetailsStack` — the **existing** `detail:receiving` right-rail occupant.

## Read first

1. `docs/todo/unbox-E-tabs-to-right-rail-PLAN.md` — SoT for this run.
2. `.claude/rules/source-of-truth.md` → **Right-rail modality** — the single-slot contract and the Ticket/Claim/details mutual exclusion.
3. `src/lib/right-rail/store.ts` — `getRightRailTop()` returns exactly one occupant.
4. `.claude/rules/display/station-workbench.md` — the slot contract you are emptying.

## Your files

- `src/components/receiving/workspace/LineEditPanel.tsx` (656 lines) — the strip mount + all tab state
- `src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx` — `buildUnboxTabs` / `UnboxSectionTabs`
- `src/components/receiving/workspace/line-edit/terminal/unbox-terminal.tsx` — `UNBOX_TAB_TERMINAL`
- `src/components/station/ReceivingDetailsStack.tsx` — the destination
- `src/components/receiving/workspace/line-edit/terminal/unbox-tab-bridges.ts`

**Do not touch:** `RightRailHost`, `src/lib/right-rail/store.ts`, `DetailStackRailRegistrar`, `SectionTabsSlider`, or any other station.

---

## Step 1 — cut the CTA coupling FIRST

Before moving any tab, break this: `UNBOX_TAB_TERMINAL` (`unbox-terminal.tsx:23-33`) maps tab id → terminal kind, consumed by `useStationTerminalAction({ tabId: activeUnboxView })` (`LineEditPanel.tsx:360-365`).

If tabs move right while this survives, **selecting a tab on the right silently changes the primary button at the bottom** — action-at-a-distance across regions, worse than today's layout.

- Make the dock CTA **carton-terminal and tab-independent**: always Print/Receive.
- Tab-specific actions (post reply, save PO note, check all) move into the right panel **with their tab**, as local controls.
- Report exactly what survives of `UNBOX_TAB_TERMINAL`.

Doing this first means the move is then a pure relocation.

## Step 2 — delete the bridges the coupling existed for

`checklistBridgeRef` / `unitsBridgeRef` / `supportBridgeRef` + their tick state (`LineEditPanel.tsx:215-252`) exist to feed the dock CTA. After Step 1 most are dead. **Delete them — do not re-thread them across regions.** Report any that a tab body genuinely still needs.

## Step 3 — move the tabs into `ReceivingDetailsStack`

`ReceivingDetailsStack` already registers `detail:receiving` (stable id, `elevated`, `modal={false}`, `closeOnOutsideClick`, `:187-194`) and already has a tab band `progress | items | journeys` (`:34`). The eight tabs join that band.

**Register no new right-rail occupant.** The right slot is single-occupancy and Unbox already contends it three ways (details / Ticket push / Claim push), which the rules require to stay mutually exclusive. A fourth contender is a contract violation.

Move: `listings · po-note (Zoho) · classify · checklist · support · tracking · timeline · units`, plus the `PairingTogglePill` pencil and its `pairingOpen` / `openPoPairing` state.

Keep each tab body **as-is**. If a body needs edits to work in the new host, report it rather than rewriting it.

## Step 4 — collapse the panel state

- Remove `unboxView` / `activeUnboxView` and its visibility gating (`LineEditPanel.tsx:167`, `:193-203`) from the panel. **Leave no vestigial state.**
- `classifyExpand` / `onClassifyPillOpen` (`:168-179`) currently routes the identity header's classify pills to the `classify` tab. It must now open the right panel on that tab. **This cross-links to Lane A** — if Lane A is in flight, coordinate before editing `LineCartonContextSection`.
- `overview` content stays mounted in the center with no strip above it.

## Hard rules

- **Relocation, not redesign.** A moved tab renders the same content with the same handlers.
- **No new right-rail occupant.** No change to the store, the host, or the single-slot model.
- **Do not delete `SectionTabsSlider`** — ~10 other consumers (`PackerReviewMode`, `SupportTicketFocus`, `SupportOrdersWorkspace`, `WorkspaceTimelineTab`, `CartonContextCard`, …). Unbox just stops using it.
- **Check `station-workbench-chrome.guard.test.ts` tolerates an empty `tabs` slot BEFORE writing code.** If it does not, fix the code or change the guard deliberately in its own commit — never raise a baseline.
- Ticket / Claim / `detail:receiving` mutual exclusion must still hold.
- Dev server on **`:3050`** — attach; never start, restart, or kill it.

## Done when

- No tab strip in the Unbox workbench; center is `overview` only.
- All eight tabs + the pencil work in the right panel.
- The bottom CTA does not change with right-panel selection.
- Triage / Testing / Shipping / Pack unaffected.
- `npm run verify` green, no baseline raised.
- `unbox-stn-ticket-context.spec.ts` and `receiving-param-isolation.spec.ts` extended, not orphaned.
- Verified against `:3050` with a screenshot of the emptied center and the populated right panel.

## Report back

1. What survives of `UNBOX_TAB_TERMINAL` after Step 1.
2. Which bridges you deleted and which a tab body still needs.
3. Whether `units` should have stayed in the center (its data is the capture stack's output — Plan §1 option 2).
4. Whether the guard tolerated the empty `tabs` slot.
5. Anything in the plan you believe is wrong.

Commit only when asked. Stage only files you changed.
