# Band 3 find-only + Show inspector — SoT finish HANDOFF

> **CLOSED 2026-08-08.** All 20 band mounts match the golden or document honest
> absence, with a stated reason each. The P0 (Testing Returns) resolved as a
> **documented rejection of option A** — the sanctioned outcome in *DONE WHEN*
> below. See **Status** at the foot of this file for the from→to.

**Status:** closed · **Lane:** main (dogfood) · **Opened / deadline:** 2026-08-08 (today)
**Kind:** cloud-agent **goal prompt** (not a Cursor Automation). Keep integrating
until every desk `WorkbenchTriageBand` above a data table matches the golden —
or documents honest absence.

**Lane rules:** attach to `:3050`; never start/restart/kill the dev server.
User owns commits.

**Coordinates with (do not conflate):**

| Doc | Use |
|---|---|
| [`displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md`](./displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md) | Nouns only (Open displays ≠ Show inspector) |
| SoT → Find-only Band 3 · Displays vs inspector | [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) |
| Recipe | [`.claude/rules/display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md) |
| Disk walk guard | [`src/components/dashboard/band3-find-only.guard.test.ts`](../../src/components/dashboard/band3-find-only.guard.test.ts) |

---

## Goal (standing until finished)

**Every desk / ops-queue workbench that mounts `WorkbenchTriageBand` above a
LedgerGrid (or sheet twin) uses the Unbox History / To-ship recipe:**

1. Dominant find — `TechRailSearchBar` `variant="chrome"` with
   `className="min-w-0 flex-1"` (never compact `w-52 shrink-0 lg:w-64`).
   The band search wrapper is full-width `flex min-w-0 flex-1` — do **not**
   re-introduce a shared `max-w-md` cap on `WorkbenchTriageBand`.
2. Refine lives **in-field** (`trailingSuffix` density=`field`) **or** on the
   pushing right inspector **View** topic cluster — never a Band 3 `right`
   icon/filter row of Staff / Staging / week pills as primary chrome.
3. Far-right `WorkbenchTriageBand.trailing` = **`WorkbenchInspectorToggle`**
   (Show / Hide inspector) when that surface opens a desk `RightRailHost`
   peek. Honest absence everywhere else — never mount the toggle for symmetry.
4. Operator copy: inspector nouns on Band 3 — never Station **Open displays**.
5. Compose `WorkbenchTriageBand` + `WorkbenchInspectorToggle` only — no
   page-local Band 3 twin, no third hand-rolled inspector toggle.
6. Grow `band3-find-only.guard.test.ts` (allowlists are **shrink-only**) and/or
   surface `*-sheet.guard.test.ts` so the surface cannot regress.

**Stop when:** inventory empty + goldens unchanged + `npm run verify` green.

---

## Goldens (do not “improve”)

| Surface | File | Locked pattern |
|---|---|---|
| **Unbox History** | `src/components/receiving/unbox/UnboxWorkspaceHeader.tsx` | `min-w-0 flex-1` find + in-field Refine + `WorkbenchInspectorToggle` |
| **To-ship** | `src/components/dashboard/OutboundWorkspaceHeader.tsx` → `OutboundTriageBand` | Same find-only + `WorkbenchInspectorToggle`; View topics on rail |
| **Standalone History** | `src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx` | Reference wiring for the shared toggle |

**Toggle SoT:** `src/components/dashboard/workbench-inspector-toggle.tsx`  
Hotkeys: **⌘\\** + bare **]** (stands down in editable targets). Never ⌘] —
Station Displays owns that chord.

Guards that pin goldens / walk the disk:

- `src/components/dashboard/band3-find-only.guard.test.ts` (**primary**)
- `src/components/station/receiving-grid/receiving-grid-sheet.guard.test.ts`
- `src/components/dashboard/dashboard-orders-sheet.guard.test.ts`
- `src/components/receiving/history/history-carton-triage.guard.test.ts`

---

## Immediate P0 — Testing **Returns** queue Show inspector — **RESOLVED: option A rejected**

**Verdict (2026-08-08): honest absence stands. Testing ships no `trailing`, on
any tab including Returns.** The empty right edge is the correct render; the
toggle is not withheld for tidiness, it is withheld because there is nothing
behind it. Three findings, each checked against the code:

1. **Rows claim the bench, they do not peek.** `TestingHistoryList` opens a line
   via `dispatchSelectLine` → `TestingPanel`, and `TestingLineWorkspace` hides
   the whole browse behind that panel (`visibility: hidden` + `inert`). Band 3
   is off screen the instant a row opens, so a toggle there would have nothing
   to park for the record just picked.
2. **The one reusable desk peek is welded to Unbox History.**
   `HistoryCartonTriagePanel` (`detail:history`) mounts `HistoryViewChromeBridge`
   \+ `HistoryViewTopicsCluster` — paint · Drill|List · compare · zoom · ▦ · KPI.
   Mounting it on Testing would ship sheet-layout chrome for a sheet Testing does
   not have (chrome inventing a second story — Kinetic Ledger law 1).
3. **So option A is a new product surface, not a wiring line** — a new occupant
   id + panel + topic map, *and* a changed selection semantic on a live floor
   queue (today a click claims the return; a peek would need click-to-select /
   double-click-to-claim, or a 1-check opener). That is a floor-workflow change.

Also confirmed: Testing registers **no** `RightRailHost` occupant for a queue row
(`rg useRegisterRightPanel|DetailStackRailRegistrar src/components/tech` → only
`TestingPanelModals`' in-panel tools). The same sweep confirmed the other ten
honest-absence surfaces still have none.

**If it is ever built** (the ask is legitimate — "read this return without
claiming it"): add the occupant to `RECEIVING_RAIL_OCCUPANT_ID` + its occupancy
test, build the panel, pass `trailing={<WorkbenchInspectorToggle …/>}` in
`TestingTriageBand`, and move the file from `NO_DESK_PEEK_SURFACES` to
`INSPECTOR_TOGGLE_SURFACES`. The cheapest additive gesture is Incoming's
**1-check opens the inspector** (2+ yields to bulk) — it leaves click-to-claim
untouched. Never mount the toggle first.

The reasoning now lives in code, not only here: `TestingWorkspaceHeader.tsx`
docblock + the per-surface reason in `band3-find-only.guard.test.ts`.

---

### Original brief (superseded by the verdict above)

Product goal for this carve-out: the return-queue Band 3 shows **full-width**
filter search with **Show inspector** pinned far-right (`trailing`).

```
TestingWorkspaceView            src/components/tech/testing/TestingWorkspaceView.tsx
  └─ TestingWorkspaceHeader     src/components/tech/testing/TestingWorkspaceHeader.tsx
       └─ TestingTriageBand  (Band 3)  ← ADD trailing once a real peek exists
            └─ WorkbenchTriageBand
```

**Already done — do not redo:** full-width search on Testing (`min-w-0 flex-1`
+ in-field Refine). A shared `max-w-md` cap on `WorkbenchTriageBand` was briefly
added and **reverted** — leave the search slot full-width.

**Missing piece:** `TestingTriageBand` passes `search` / `kpiToggle` / `right` /
`controlsSlotRef` but **no `trailing`**, so no Show inspector button renders
(empty white space on the right).

### Blocking prerequisite — there is NO inspector to toggle yet

`WorkbenchInspectorToggle` parks/reopens a desk **`RightRailHost` peek**. SoT
is strict about honest absence (toggle module docblock + Displays vs inspector):

> A surface with no desk peek passes no `trailing` at all. Do not mount this to
> make a band look symmetrical.

**Findings (verify, then act):**

- `RECEIVING_RAIL_OCCUPANT_ID` (`src/lib/right-rail/receiving-selection-occupancy.ts`)
  defines receiving / History peeks — **no Testing / return-queue inspector
  occupant** today.
- `TestingWorkspaceView` does not open a `RightRailHost` peek on row select —
  Testing is a scan station whose rows open the station centre panel, not a
  desk inspector.
- `TestingWorkspaceHeader.tsx` is on the **`NO_DESK_PEEK_SURFACES`** allowlist
  in `band3-find-only.guard.test.ts` — that is intentional until a peek exists.

**Step 1 is a product/architecture decision, not a wiring line:** *what is the
return-queue "inspector"?*

| Option | Meaning | Verdict |
|---|---|---|
| **(A)** Real desk `RightRailHost` peek for a return-queue row (`detail:testing-return` or agreed name), registered via `useRegisterRightPanel` / `DetailStackRailRegistrar`, opened on row click, `modal={false}`; toggle parks/reopens it | Matches **Show inspector** copy | **Recommended** |
| **(B)** Product actually means open station panel / Displays | Control is **not** `WorkbenchInspectorToggle`; copy must not say “inspector” | Kick back to product — do not mislabel |

Do **not** mount `WorkbenchInspectorToggle` pointed at a non-existent occupant —
an inert toggle that opens nothing is worse than the current empty space.

### Wiring (copy-ready once the occupant exists)

Reference: `HistoryWorkspaceHeader.tsx`.

```tsx
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import { useRightRailOccupantOpen } from '@/components/right-rail/useRightRailOccupant';

// inside TestingTriageBand:
const returnInspectorOpen = useRightRailOccupantOpen(
  /* NEW id from RECEIVING_RAIL_OCCUPANT_ID (or Testing-scoped twin) */,
);

<WorkbenchTriageBand
  …
  trailing={
    <WorkbenchInspectorToggle
      open={returnInspectorOpen}
      testId="testing-return-inspector-toggle"
      // onOpenEmpty={…}  // only if View-only shell exists with no row selected
    />
  }
/>
```

- Add the occupant id **and** update its occupancy guard test (ids are pinned).
- **Scope:** screenshot is **Returns** tab — decide toggle on **only**
  `tab === 'returns'` vs every Testing queue tab that grows a peek. Honest
  absence: a tab with no peek gets no `trailing`. Record the choice.
- Move the surface from `NO_DESK_PEEK_SURFACES` → `INSPECTOR_TOGGLE_SURFACES`
  in `band3-find-only.guard.test.ts` (shrink-only allowlists).
- Full-width search stays; inspector is far-right. Confirm with product whether
  Returns drops Band 3 `right` / `kpiToggle` for a find-only + toggle row.

### Testing Returns — definition of done

- [ ] Return-queue row opens a real `RightRailHost` inspector peek (occupant id + guard).
- [ ] `TestingTriageBand` passes `trailing={<WorkbenchInspectorToggle …/>}` on the agreed scope.
- [ ] Search stays full-width `flex-1`; inspector pinned far-right; no dead gap.
- [ ] `⌘\` / `]` toggle works; `]` stands down while typing in the find field.
- [ ] `band3-find-only.guard.test.ts` lists Testing on the owns-the-toggle allowlist (not honest-absence).
- [ ] `npm run verify` green; visual check on `:3050`.

---

## Seeded inventory (re-measure every session)

Authoritative lists live in `band3-find-only.guard.test.ts` — this table is a
seed for prioritization.

### Already owns `WorkbenchInspectorToggle` (reference / done)

Outbound · Unbox · History standalone · Incoming · Repair · FBA · Locations ·
My Day · Review catalog-link — see `INSPECTOR_TOGGLE_SURFACES`.

### Honest absence today (`NO_DESK_PEEK_SURFACES`)

| Priority | Surface | Notes |
|---|---|---|
| **P0** | Testing (`TestingWorkspaceHeader`) | Returns queue product ask — needs real peek first (section above) |
| P1 | Shipping · Pack · Labels · Triage | Station hybrid strips — flex-1 find; toggle only if peek grows |
| P2 | Labels products · Products catalog · Pickup · Support board · Review packing/pairing | Catalog / navigate / no desk peek |

### Compact find / Band 3 `right=` refine drift

Re-run at session start:

```bash
rg -n 'w-52 shrink-0 lg:w-64|WorkbenchTriageBand|WorkbenchInspectorToggle' \
  src/components/**/*WorkspaceHeader*.tsx \
  src/components/dashboard/OutboundWorkspaceHeader.tsx \
  src/features/**/*Workspace*.tsx
```

Port remaining compact find + Band 3 refine icon rows toward the golden. Prefer
Unbox non-History tabs if any still drift, then receiving twins, then cohort.

---

## Paste this into a cloud agent / Claude Code session

```
Read docs/todo/band3-find-only-inspector-SOT-FINISH-HANDOFF.md end-to-end before editing.

GOAL (standing — finish today)
Codebase-wide Band 3 find-only + Show inspector parity.
Keep integrating until every desk WorkbenchTriageBand above a data table matches
the golden, or documents honest absence. Not a Cursor Automation — an
implementation goal.

GOLDEN (locked)
- Compose WorkbenchTriageBand + WorkbenchInspectorToggle only
- TechRailSearchBar variant="chrome" className="min-w-0 flex-1" (full-width band slot)
- Refine in trailingSuffix OR inspector View cluster — not Band 3 right= icon rows
- trailing = WorkbenchInspectorToggle only when a real RightRailHost peek exists
- Never mount the toggle for symmetry; never Station "Open displays" on Band 3
- Reference: Unbox History · OutboundTriageBand · HistoryWorkspaceHeader
- Disk guard: src/components/dashboard/band3-find-only.guard.test.ts (shrink-only allowlists)

HARD LAWS
- AGENTS.md + source-of-truth.md → Find-only Band 3 · Displays vs inspector
- display/workbench-ops-queue.md
- Motion only @/design-system/motion
- Attach to :3050 — never start/restart/kill the dev server
- User owns commits — do not commit unless asked
- npm run verify before done; never raise knip / DS ratchet baselines
- Hotkeys: ⌘\ + bare ] on WorkbenchInspectorToggle; never ⌘] (Displays)

WAVES (same day)
Wave 0 — Inventory against band3-find-only.guard.test.ts allowlists + rg above.

Wave 1 — Testing Returns P0 (see "Immediate P0" in this handoff)
  1. Product/architecture: real detail:testing-return (or agreed) RightRailHost
     peek — OR kick back if product meant Station Displays.
  2. Do NOT wire WorkbenchInspectorToggle until the occupant exists.
  3. Wire trailing on TestingTriageBand (scope recorded); move Testing from
     NO_DESK_PEEK_SURFACES → INSPECTOR_TOGGLE_SURFACES.
  4. Keep full-width find; visual check :3050.

Wave 2 — Remaining compact find / Band 3 right= refine drift
  Port any remaining w-52 / refine-icon Band 3 rows to the golden. Grow guards.

Wave 3 — Cohort honest-absence review
  For each NO_DESK_PEEK_SURFACES row: confirm still no peek (leave) OR grow a
  peek + toggle and shrink the allowlist. Never fake a toggle.

Wave 4 — Lock + verify
  - band3-find-only + receiving-grid-sheet + dashboard-orders-sheet green
  - No Desk Band 3 using Open displays
  - npm run verify green
  - Update Status below (or mark COMPLETE)

OUT OF SCOPE
- Station Displays push / Open displays edge toggle as a Band 3 substitute
- Inert inspector toggles with no occupant
- Cursor Automations / scheduled agents
- Raising ratchet baselines
- Starting the dev server

DONE WHEN
- Testing Returns has a real peek + WorkbenchInspectorToggle (or documented
  product rejection of option A)
- No desk WorkbenchTriageBand keeps compact w-52 find where History recipe applies
- band3-find-only allowlists match reality; npm run verify green
```

---

## Implementation notes

### Pattern to copy

```tsx
<WorkbenchTriageBand
  search={
    <TechRailSearchBar
      variant="chrome"
      value={…}
      onChange={…}
      placeholder="Filter …"
      className="min-w-0 flex-1"
      trailingSuffix={/* optional in-field Refine */}
    />
  }
  trailing={
    <WorkbenchInspectorToggle
      open={useRightRailOccupantOpen(occupantId)}
      testId="…-inspector-toggle"
    />
  }
/>
```

### KPI toggle

When Band 2 KPI exists, `kpiToggle` may remain on Band 3 **left of** the
inspector trailing control (never left of search, never over the select gutter).
History omits Band 3 kpiToggle when View cluster owns KPI hide.

### Guard growth preference

1. `band3-find-only.guard.test.ts` allowlist move (owns toggle ↔ honest absence)
2. Extend the surface’s `*-sheet.guard.test.ts`
3. Never invent a second Band 3 / inspector-toggle SoT module

### Anchors (Testing Returns + shared SoT)

- `src/components/tech/testing/TestingWorkspaceHeader.tsx` (`TestingTriageBand`)
- `src/components/tech/testing/TestingWorkspaceView.tsx`
- `src/components/dashboard/workbench-inspector-toggle.tsx`
- `src/components/right-rail/useRightRailOccupant.ts`
- `src/lib/right-rail/receiving-selection-occupancy.ts` (+ `.test.ts`)
- `src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx` (wiring reference)
- `src/components/dashboard/workbench-shell.tsx` (`WorkbenchTriageBand`)

---

## Status

| Date | State |
|---|---|
| 2026-08-08 | **OPEN — finish today.** Merged former `testing-return-queue-inspector-toggle-HANDOFF.md` into this goal doc. Goldens + shared `WorkbenchInspectorToggle` live; many desk surfaces already on `INSPECTOR_TOGGLE_SURFACES`. **Next:** Testing Returns needs a real desk peek before wiring trailing (P0). Then clear remaining compact-find / refine-row drift and shrink honest-absence only when peeks are real. |
| 2026-08-08 | **Unbox LEAN row (follow-on ruling).** Band 3 on `/unbox` is now exactly four things on every **sheet** tab (Queue · Recent · All · History): find · refine **in** the find field · KPI collapse · Show inspector. No `right` slot, no controls portal. Compare panes · spreadsheet zoom · `▦` column display · the week pill moved onto the inspector **View** cluster (`HistoryViewTopicsCluster`), which the trailing toggle opens as a View-only shell — so that toggle is now live on every sheet tab, not just History. Pinned **Inbound** renders no Band 3 at all (honest absence). **KPI left the View cluster** (`history-inspector-topics.ts` dropped `kpi`): Band 3 is on screen while the rail is parked, so the row is the one door. Four amendments were defects caught in review and are pinned in prose + guard: the View cluster publishes a **null** ▦ portal target while hidden/parked (else ▦ is swallowed by an inert node *and* the card-corner fallback is suppressed); the ⌘+/⌘-/⌘0 zoom chords moved to `HistoryViewChromeProvider` (they died with the rail otherwise); the View-only shell no longer feeds `ReceivingLineRailShell.inspectOpen` (it owns no row, so it was silently killing multi-select print/claim/copy); and it clears on `receiving-workspace-open` / `receiving-select-line` so it cannot sit beside `LineEditPanel` as a second right column. |
| 2026-08-08 | **CLOSED.** Measured **20** band mounts on disk: **9** own the toggle, **11** honest absence — every one classified, and honest absence now carries a stated reason per surface. From → to: (1) **Testing Returns P0** → option A rejected with the reasoning in code, not just here; (2) **Locations** room facet → moved from a hand-rolled `<select>` in the `right` zone into the find field's `trailingSuffix` as `WorkbenchFilterPopover density="field"` (it narrowed rows *and* wore soft radius); (3) **My Day** → chips kept in `right` as a documented compound-cluster resident, its comment corrected off the superseded "refine stays in `right`" rule; (4) **guard grown 8 → 11 tests** — reasons required, staff refine must be `density="field"` outside two residents, no raw `<select>` in a band. **Compact-find drift: none** — all 20 mounts already carry `min-w-0 flex-1`. Gates: typecheck + lint + the 4 pinned guards green (52/52). Verify's other reds (4 live-DB IDOR tests, 7 knip findings in `SectionTabsSlider` / `ScanStationProgressControl` / untracked `keyboard-region-owner.ts`, stale DOC-CATALOG) are **another session's in-flight tree**, untouched here. |
