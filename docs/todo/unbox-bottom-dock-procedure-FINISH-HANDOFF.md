# Handoff — Finish Unbox bottom dock procedure (items + full capture walk)

**For:** next coding agent (paste § Prompt)  
**Date:** 2026-08-07 · **Lane:** current checkout (`main` / dogfood) — stay on branch; attach to `:3050` (never start/restart). User owns commits.  
**Status:** Shell + locus + order **landed**. Finish = make every capture step’s dock action honest for the **items / carton walk**, prove the full Serial→Condition→Photos loop (and carton shots before it), polish empty-leading gaps, keep status-bar density.  
**Supersedes / continues:** [`unbox-dock-step-context-photo-pairing-HANDOFF.md`](./unbox-dock-step-context-photo-pairing-HANDOFF.md) (registry shipped; host was parked, now remounted) · input-locus brief [`unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md`](./unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md).  
**Out of scope:** Archive | Reticle | Queue conveyor (Phase 4) · Generate Asset Tag / Electron print · remounting centre `ProcedureDeck` · Arrival / Testing / Pack docks.

**Binding rules:**  
[`AGENTS.md`](../../AGENTS.md) · [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → *Unbox centre (main)* · [`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) → dock LEADING / terminal TRAILING · [`pattern-evolution.md`](../../.claude/rules/pattern-evolution.md).

---

## Prompt (paste into a new agent session)

```text
Finish the Unbox bottom Action Dock procedure — items + full capture walk.
Do not redesign the shell; close the remaining step honesty + item-loop gaps.

## Mission

Unbox on main already mounts `UnboxDockHost` with:
- step CTA leading · FileText notes · Print · Receive trailing
- under-dock status bar: active step context (bottom-left) · compact progress ring (bottom-right)
- safe-area-only floor pad (no decorative pb)
- PO meta as ledger (click → focus dock step); no under-row ActiveLineConditionSerial
- FOUND_CAPTURE / RETURN_CAPTURE item trio = Serial → Condition → Photos

Your job: make the **entire procedure walk** work end-to-end from the dock for a real carton — carton photo steps, contents ack, then the per-item trio, then label — so the operator never needs the middle as an editor. Prove it on `:3050`. Leave guards green.

Attach to the user’s already-running app on `:3050`. Do not start/restart/kill the dev server. Stay on the current branch. User owns commits — do not commit unless asked. Prefer `npm run verify -- --fast` while iterating; full `npm run verify` before claiming done. If full verify fails on unrelated dirty-tree files (My Day / NonlinearTableHost / IDOR env / ContextPanelLayout), fix only Unbox-dock-touched regressions.

## Locked product intent (do not renegotiate)

1. **Command vs state**
   - Bottom dock = command (only primary capture locus for the active step).
   - Middle = ledger (PO lines meta + label preview). Click meta condition/serial → `focusStep` into dock.
   - Centre `ProcedureDeck` / `UnboxItemsPanel` stay PARKED — do not remount.

2. **Capture order (SoT)**
   - Carton prefix: arrival_check → shipping_label_photo → box_photo → packing_material → contents
   - Item trio: **serial → condition → item_photos** (FOUND and RETURN)
   - Then label → Print · Receive (terminal, never re-labels with Displays)

3. **Under-dock chrome (status-bar density — Cursor-tight)**
   - Left: current step label + positional ‹ › (`UnboxProcedurePager` as `stepContext`)
   - Right: compact ring (`UnboxScanProgressControl` variant="default", not h-10 strip)
   - Float: `data-unbox-dock-float` with `pb-[env(safe-area-inset-bottom,0px)]` only
   - Do NOT put step chrome above the Panel or on Displays `rightSlot`

4. **Honest absence**
   - `arrival_check` / `classify` have NO dock CTA (registry `UNBOX_STEPS_WITHOUT_DOCK_ACTION`). Empty leading is OK — step context still names the step; operator advances via evidence / ←→ / checklist.
   - Do not invent a fake “Skip” that lies about arrival evidence.

5. **Scan focus**
   - Only the dock serial surface owns `serialRef` / wedge focus when serial is active.
   - Closing notes returns focus via `receiving-focus-scan`.

## Already landed (start here — do not reimplement)

| Piece | Path | Notes |
|---|---|---|
| Host | `line-edit/UnboxDockHost.tsx` | Panel + under-dock stepContext \| progress |
| Notes | `line-edit/UnboxDockNotesEntry.tsx` | Fixed h-11; `receiving_line.notes` only |
| Step CTA | `line-edit/UnboxStepDock.tsx` + `steps/dock/*` | Registry `UNBOX_STEP_DOCK_CONTROLS` |
| Builder | `line-edit/terminal/unbox-tabs.tsx` → `buildUnboxStepDock` / `buildUnboxOverview` | `dockOwnsCapture` on POUnboxingSection |
| Pager | `line-edit/UnboxProcedurePager.tsx` | Active step under Panel (not above) |
| Arrows | `line-edit/useUnboxProcedureArrowKeys.ts` | ← / → positional |
| Mount | `LineEditPanel.tsx` | `data-unbox-dock-float`, Host wiring |
| Order | `src/lib/stations/procedure.ts` `FOUND_CAPTURE` | serial → condition → item_photos |
| Ledger | `PoLineRow` + `LinePoItemsSection` | meta click → dock; RETURN match band only when lookup resolves |
| Guards | `unbox-dock-one-shell.guard.test.ts`, `unbox-right-edge-chrome.guard.test.ts` | Host + under-dock ring |
| Ring | `UnboxScanProgressControl.tsx` | under-dock, `variant="default"` |

## Finish streams (do in order)

### A — Carton photo steps honest in the dock
For `shipping_label_photo` · `box_photo` · `packing_material`:
- Confirm `CartonPhotoDockControl` shoots + links with the step’s aspect.
- Evidence advance: capturing/linking the right aspect must settle the step and move the pointer (same derivation as checklist % — `useUnboxProcedureSteps` / `derive-capture-step-states`).
- Under-dock label must match the active step (e.g. ARRIVAL PHOTOS / SHIPPING LABEL).
- Manual: open a carton with missing shipping-label shot → dock leading shows camera/link → shoot → step advances.

### B — Contents + label ack
- `ContentsDockControl` / `LabelDockControl` acknowledge CTAs work from the dock.
- Contents step must not reopen a centre editor; PO lines stay ledger.
- Label step → face-is-right ack; Print stays on terminal.

### C — Item loop (Serial → Condition → Photos)
Per physical unit / active line:
1. Dock serial (`UnboxSerialStepSurface`) — wedge into dock field only.
2. Condition pills in dock (`ConditionDockControl`).
3. Item photos in dock (`ItemPhotoDockControl` + `ReceivingPhotoButton` unbox_item).
4. When multi-qty: after one unit’s trio completes, pointer / active line must make the next unit’s serial the next dock ask (or document the intentional “same line until qty filled” behaviour and make the dock cue match).
5. Middle PO meta updates as facts land; click meta to re-enter a prior step.

### D — Empty-leading UX for actionless steps
When activeKey is `arrival_check` (or classify on unfound):
- Leading stays empty (honest).
- Step context still readable bottom-left.
- Offer a clear advance path: positional › / → / checklist — not a fake camera.
- Optional micro-copy in leading is OK only if it is not a second SoT (“Review arrival evidence”) — prefer no prose if the under-dock label already names the step.

### E — Density + clearance ratchet
- Keep status-bar under-dock (no regression to above-panel pager or Displays rightSlot ring).
- `reserveScrollClearance` on StationWorkbench must still clear the taller Host+under-row so PO lines / label don’t sit under the float. Measure; bump clearance only if content is clipped — prefer the existing pager clearance token if needed.
- Guards must keep asserting: Host · stepContext under Panel · progress under-dock · no `rightSlot={scanProgressControl}` · safe-area float.

### F — Verify
- Targeted: `unbox-dock-one-shell`, `unbox-right-edge-chrome`, `procedure-step-dock`, `unbox-procedure-flows`, `derive-capture-step-states`, `po-line-flat-chrome`.
- `npm run verify -- --fast` then full `npm run verify`.
- Manual dogfood on `:3050`: carton open → carton shots → contents → Serial → Condition → Photos → Label → Print · Receive; under-dock label tracks every step; ring % advances; meta click edits via dock.

## Do not

- Remount `UnboxProcedureDeck` / `UnboxItemsPanel` on main.
- Put the ring back on Displays `rightSlot` or revive above-Panel pager.
- Raise DS / knip baselines.
- Start Phase 4 Archive|Reticle|Queue or Electron asset-tag.
- Dual live serial inputs (centre + dock).
- Hardcode vendor product names in operator copy.

## Done when

- [ ] Carton photo steps advance from dock evidence alone
- [ ] Contents + label ack work from dock
- [ ] Item trio Serial→Condition→Photos works from dock; meta is ledger-only
- [ ] Actionless steps: empty leading + clear advance path; no fake CTA
- [ ] Under-dock stays status-bar tight; no Displays ring
- [ ] Guards + `npm run verify` green (or only pre-existing unrelated failures documented)
- [ ] Manual `:3050` walk recorded in the reply (what you ran / what you saw)
```

---

## 1. Current tree (2026-08-07)

```
LineEditPanel dock=
└── data-unbox-dock-float   absolute · safe-area pb only
    └── STATION_WORKBENCH_COLUMN
        ├── disabledReason? / ReceiveFeedbackRegion?
        └── UnboxDockHost
            ├── Panel h-11
            │   ├── leading: UnboxStepDock → UNBOX_STEP_DOCK_CONTROLS[activeKey]
            │   ├── FileText notes toggle
            │   └── StationTerminalDock (Print · Receive)
            └── under-dock (data-unbox-dock-progress)
                ├── stepContext: UnboxProcedurePager  (active label · ‹ ›)
                └── progress: UnboxScanProgressControl (compact)
```

Centre: `buildUnboxOverview` → `POUnboxingSection` (`dockOwnsCapture`) + `UnboxLabelPreview`.

---

## 2. Known gaps the finish agent will hit

| Gap | Why it matters |
|---|---|
| **Empty leading on `arrival_check`** | Operator sees blank dock band while under-dock says ARRIVAL PHOTOS — looks broken unless advance path is obvious |
| **Carton photo settle** | Camera may write evidence but pointer may not advance if aspect / stage stamp is wrong — verify `CartonPhotoDockControl` + derivation |
| **Multi-qty item loop** | Serial→Condition→Photos may complete one unit while qty>1; cue must not strand the operator |
| **Scroll clearance** | Host+under-row taller than old notes-only dock; label preview can tuck under float |
| **Dirty-tree verify noise** | Unrelated My Day / grid / IDOR / ContextPanelLayout failures may appear — do not “fix” those unless you touch them |

---

## 3. Key files

| Concern | Path |
|---|---|
| Mount | `src/components/receiving/workspace/LineEditPanel.tsx` |
| Host / pager / notes / step dock | `src/components/receiving/workspace/line-edit/UnboxDockHost.tsx` · `UnboxProcedurePager.tsx` · `UnboxDockNotesEntry.tsx` · `UnboxStepDock.tsx` |
| Registry | `…/line-edit/steps/dock/index.ts` + `CartonPhotoDockControl` · `SlotDockControls` · `AcknowledgeDockControl` |
| Serial surface | `…/line-edit/steps/UnboxSerialStepSurface.tsx` |
| Overview / step builder | `…/line-edit/terminal/unbox-tabs.tsx` |
| Order | `src/lib/stations/procedure.ts` |
| Derivation | `…/derive-capture-step-states.ts` · `useUnboxProcedureSteps.ts` |
| Guards | `unbox-dock-one-shell.guard.test.ts` · `unbox-right-edge-chrome.guard.test.ts` · `steps/dock/procedure-step-dock.guard.test.ts` |

---

## 4. Related docs (read, don’t reopen parked work)

- [`unbox-dock-step-context-photo-pairing-HANDOFF.md`](./unbox-dock-step-context-photo-pairing-HANDOFF.md) — registry + “card reads / dock acts”
- [`unbox-procedure-flows-HANDOFF.md`](./unbox-procedure-flows-HANDOFF.md) — found / unfound / return
- [`scan-station-procedure/LANE-G-dock.md`](./scan-station-procedure/LANE-G-dock.md) — declared dock region (aspirational StationDock)
- [`unbox-items-under-procedure-z-HANDOFF.md`](./unbox-items-under-procedure-z-HANDOFF.md) — **obsolete for main** while ProcedureDeck is parked; do not revive Items-under-deck stacking work unless the deck returns

---

## 5. Verification bar

```bash
node --require ./scripts/register-server-only-shim.cjs --import tsx --test \
  src/components/receiving/workspace/line-edit/unbox-dock-one-shell.guard.test.ts \
  src/components/receiving/workspace/unbox-right-edge-chrome.guard.test.ts \
  src/components/receiving/workspace/line-edit/steps/dock/procedure-step-dock.guard.test.ts \
  src/lib/stations/unbox-procedure-flows.test.ts \
  src/components/receiving/workspace/derive-capture-step-states.test.ts

npm run verify -- --fast
npm run verify   # before “done”
```

Manual: `/unbox` carton → walk every capture step from the dock only → Print · Receive.
