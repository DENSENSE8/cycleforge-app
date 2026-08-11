# Scan-station cockpit — the DO / KNOW split

> **Ratified 2026-08-09. Unbox Phase 1 is LIVE** (`LineEditPanel` drives
> `openDisplays(railLeaf)` from `useUnboxProcedureSteps`; guards:
> `scan-cockpit.guard.test.ts`). RFC:
> [`../../../docs/todo/scan-station-cockpit-do-know-split-RFC.md`](../../../docs/todo/scan-station-cockpit-do-know-split-RFC.md).
> Exact Unbox step→leaf table: [`unbox-station.md`](unbox-station.md). Sibling
> ports: [`station-port-from-unbox.md`](station-port-from-unbox.md). Do not port a
> station to the cockpit before Unbox is bench-verified and that station's flush
> dock + centre ops-flow are already Unbox-shaped (pattern-evolution).

**Applies to:** derived-procedure scan benches (Unbox golden; Testing · Shipping ·
Pack · Arrival port targets). **Not** Labels or any non-procedure centre-tab bench.

Inherits: [`instrument-panel.md`](instrument-panel.md) (P2 *procedure is the
product*, P5 *one commit per beat*, P7 *calm instrument*), [`station.md`](station.md)
(Station contract), [`station-workbench.md`](station-workbench.md) (column shell).

---

## The split

| | Holds | Region |
|---|---|---|
| **DO** — hands | The **one armed action** for this beat (scan-to-print · capture serial · pick grade) | Work plane = **centre + dock** |
| **KNOW** — eyes | The **current step's reference** — manual · spec · position · one de-risking fact | **Cockpit rail** = default-open `StationDisplaysPushColumn` |

> The centre serves the scan (Station contract). The rail serves the eyes. One
> derivation drives both; the rail follows the step.

**"Everything" is not the rule.** Move the **reference** to the rail; keep the
**action** in the centre. An everything-important-in-the-rail panel is a
noticeboard and is banned — it stops being glanceable, which is the entire job.

---

## The one-derivation contract

- **One pointer, one vocabulary.** `resolveActiveStep` over `deriveProcedureSteps`
  (Unbox: `useUnboxProcedureSteps`) yields, per step, both:
  - `action` — the dock control (`UNBOX_STEP_DOCK_CONTROLS`), the armed centre CTA.
  - `railLeaf` — the Display leaf the rail auto-shows as this step's reference.
- **Either-or, both maps.** A step declares an `action` **or** is listed in
  `UNBOX_STEPS_WITHOUT_DOCK_ACTION` with a reason; likewise it declares a
  `railLeaf` **or** is listed as reference-less with a reason. Neither map, or
  both, fails CI (mirror of the dock's either-or, `procedure-step-dock.guard`).
- **No second store.** The rail leaf and the centre action come from the *same*
  resolved step. Two derivations drifting is the exact hazard the two-view model
  exists to prevent — never a page-local cockpit store.
- **Per-station maps.** step→`railLeaf` is per-station (like the dock map), never
  one global table.

---

## Cockpit behaviour

- **Default-open, step-driven.** On carton open and on `activeKey` change, the
  column opens (or swaps) to `step.railLeaf`. It is the picker's **own** edge
  showing the picker's **current step's** reference.
- **Auto-follow yields to explicit close.** An operator `→|` / ⌘] close stays
  closed until the **next carton** — auto-follow never fights a manual close
  (same precedence as "do not fight a manual Displays close", today).
- **Auto-follow yields to Displays browse.** Back / Esc to the topic index, **or
  any leaf the operator picked that is not this beat's `railLeaf`** (e.g. Photos
  while the beat is Units), stays put — auto-follow must not immediately re-open
  `railLeaf`. A **step advance** (`activeKey` change) **or a new carton** resumes
  auto-follow and swaps the beat's reference (same first step on a new carton
  must still land on `railLeaf`, not stick on the prior carton's leaf).
- **Single-purpose + auto-swap.** The rail shows *only* what THIS step needs and
  changes as the step changes. Never a static wall of everything.
- **Position folds in.** The procedure **checklist** ("where am I") is a compact
  position header on the cockpit; the scan-progress **ring** stays the indicator
  and the manual re-open control.
- **Wedge focus is never stolen** when the rail opens/swaps (Station §3).

---

## Hard bans

- **No new region, no new grammar.** The cockpit **is** `StationDisplaysPushColumn`
  — one of exactly two right-edge grammars. Never a third region, never an
  ambient panel pinned beside the picker (that was built and retired 2026-08-01;
  `source-of-truth.md` → Right-rail modality).
- **No competing primaries in the centre** (P5). The work plane carries the one
  armed action; a reference wall or a second CTA in the centre is banned.
- **No everything-rail.** Reference for the *current* step only.
- **Carton Macro on the rail is allowed** (`StationDisplaysActionFloor` —
  above close chrome: Edit · Print/Resolve · Delete far-right). That is record
  gravity on the KNOW column, not a second DO primary in the centre. Never desk
  `InspectorActionFloor`.
- **Paint order intact.** Rail strip chrome is P3; leaf **bodies** stay
  `dynamic()` — the manual / timeline never enter first paint
  (`source-of-truth.md` → Paint content order).
- **Frame budget intact.** Center locks `STATION_PUSH_CENTER_FLOOR_PX` (720);
  Displays is a sized sibling and the elastic center absorbs (the cascade already handles both-open).
  Default-open changes *when* the rail is open, never the width math.

---

## Guards

- `steps/rail/scan-cockpit.guard.test.ts` — the step→`railLeaf` either-or over
  capture steps (mirror of the dock either-or); rail values are real
  `UnboxSideTab` leaves; no entry for a non-capture step; reasons are real; and
  `LineEditPanel` wires the cockpit (drives the rail from `railLeaf`, yields to
  an explicit close via the closed-for-row ref, mounts `StationDisplaysPushStack`
  — no new region). *(The rail either-or lives in its OWN guard, not folded into
  `procedure-step-dock.guard`: action and reference are separate concerns, and
  coupling them would make one guard fail for the other's reason.)*
- `procedure-step-dock.guard.test.ts` — unchanged; still owns the step→action
  either-or.
- `station-displays-reachability.guard.test.ts` — unchanged; rail leaves are
  declared Displays, so reachability holds.

---

## Do / Don't

| Do | Don't |
|---|---|
| Keep the one armed action in the centre + dock | Move the action to the rail |
| Show only the current step's reference in the rail | Fill the rail with "everything important" |
| Drive rail leaf + centre action from one resolved step | Add a page-local cockpit store |
| Default-open the existing Displays column, step-driven | Build a new always-on region beside the picker |
| Let an explicit close stay closed until next carton | Re-open the rail over the operator on every step |
| Keep leaf bodies `dynamic()` (P3) | Put the manual / timeline in the P1 paint path |
| Port Unbox first (done), then siblings behind the guard — one at a time | Port N stations in one pass |

---

Indexed by [`../contextual-display.md`](../contextual-display.md)
