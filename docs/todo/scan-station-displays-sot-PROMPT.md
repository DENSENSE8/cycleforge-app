# Scan-station Displays SoT — Claude Code prompt (phased)

**For:** the agent session that executes this initiative. Read this whole file
before touching code.
**Status:** execution prompt — paste a phase block into Claude Code; finish that
phase (including `npm run verify`) before opening the next.
**Date:** 2026-08-05.
**Golden SoT:** Unbox focused carton — `LineEditPanel` centre (PO lines + label +
dock) + `ReceivingDisplaysPushStack` / `UnboxPushColumn` on the **right**.
**Companion plan:** Cursor plan `scan_station_sot_pin` (Arrival → Testing → Tier B).
**Prior Unbox move (already shipped):** [`unbox-package-pairing-right-rail-HANDOFF.md`](./unbox-package-pairing-right-rail-HANDOFF.md).
**Sibling traps:** [`unbox-SIBLING-PATTERNS.md`](./unbox-SIBLING-PATTERNS.md) (P2 tabs · P3 dock↔tab).

---

## Paste this into a new session (master)

> Read `docs/todo/scan-station-displays-sot-PROMPT.md` (this file) end to end
> before editing. Execute **one phase at a time**. After each phase: call-site
> grep for deleted symbols, update/extend guards, `npm run verify` green. User
> owns commits. Attach to `:3050` — never start, restart, or kill the dev server.
> Never raise DS ratchet baselines.
>
> **Job:** Unbox is the golden scan-station SoT. Remove Arrival’s center
> Classify · Staging · Pairing tabs, put Package Pairing (+ Classify + Staging)
> on the **Displays push column** (right edge), leave **unfound/matched PO lines
> in the middle**, then fan the same grammar to Testing and Tier B stations so
> shared shells/tokens propagate. Delete dead `pairingOpen` / center-tab code.
>
> **Critical naming trap:** operators say “right rail host.” In this codebase
> that names `RightRailHost` — and it is the **wrong** component for station
> tools. Pairing / Classify / Staging are **Displays** on
> `ReceivingDisplaysPushStack` / `UnboxPushColumn`, flush beside the sunken
> centre. `RightRailHost` stays for AI / `detail:receiving` / batch / History
> inspectors only. See §0 and Unbox handoff §2.
>
> **Non-goals:** guided `ProcedureDeck` / `unbox-work` lane; re-running
> sheets-flush Waves 0–7; putting Pairing into `RightRailHost`; Products/Review
> pairing domains; raising baselines; commits unless asked.

---

## 0. Grammar (locked — do not re-argue)

| Rule | Detail |
|---|---|
| **Center** | Carton identity + **PO / unfound line work** + dock. Arrival: lines only (no Package Pairing card, no Classify accordion, no Staging form in mid). |
| **Right** | Displays push — Linkage/Pairing · Classify · Staging · Ticket · Photos · … |
| **Not RightRailHost** | Never register Pairing as `detail:*`. |
| **Open state** | Selected Displays tab (`activeSideTab === 'linkage'`) — **no** sibling `pairingOpen`. |
| **PO chip** | `openDisplays('linkage')` + `setPairingFocus` (Unbox race-free). No `requestAnimationFrame` + event on Displays hosts. |
| **Propagation** | Change named SoT modules; stations compose them. Never fork host class strings. |
| **Sheets plane** | Separate. Cohort done. Residual = `unbox-history-sheets-full-resweep-SWEEP-PROMPT.md`. |

```text
TODAY (Arrival focused carton)
┌─ identity ─────────────────────────────────────────┐
│ Classify | Staging | Pairing   [pencil]            │  ← DELETE this strip
├────────────────────────────────────────────────────┤
│ Classify accordion                                 │  ← move RIGHT
│ Package Pairing card  [Open in unbox]              │  ← move RIGHT
│ Location Placement                                 │  ← move RIGHT
│ Notes / Unfound strip                              │
│ [Save for unbox]                                   │
└────────────────────────────────────────────────────┘

TARGET (match Unbox grammar)
┌─ identity ──────────────┐ ┌─ Displays push ──────────┐
│ PO / Unfound lines      │ │ Ticket · Photos · Linkage│
│ (unmatched surface)     │ │ · Classify · Staging · … │
│                         │ │ bodies: CartonMatchHub,  │
│ dock: notes + Save      │ │ Classify, StagingSection │
└─────────────────────────┘ └──────────────────────────┘
```

### Golden files (copy structure — do not fork classes)

| Role | Path |
|---|---|
| Center + Displays mount | `src/components/receiving/workspace/LineEditPanel.tsx` |
| Displays stack | `src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx` |
| Push shell | `src/components/receiving/workspace/UnboxPushColumn.tsx` |
| Side-tab vocabulary | `…/line-edit/unbox-side-tabs.ts` |
| URL ↔ display | `…/line-edit/hooks/useUnboxDisplayView.ts` |
| Linkage body | `…/line-edit/LinkageDisplayHost.tsx` → `CartonMatchHub` |
| Unbox tab builders | `…/line-edit/terminal/unbox-tabs.tsx` |
| Guard to extend | `…/workspace/unbox-right-edge-chrome.guard.test.ts` (block A) |
| Arrival today (rewrite) | `src/components/receiving/triage/TriagePanel.tsx` |
| Arrival tabs (delete/repurpose) | `…/triage/build-triage-tabs.tsx` |
| Focus deep-links | `src/lib/receiving/triage-focus.ts` (+ `.test.ts`) |
| Station chrome tiers | `src/components/station/workbench/station-workbench-chrome-config.ts` |

### Shared shells / tokens (one change must fan out)

| Concern | Module |
|---|---|
| Sheet host / chrome pill | `src/components/dashboard/workbench-shell.tsx` |
| KPI collapse | `src/components/dashboard/workbench-kpi-collapse.tsx` |
| Station column geometry | `src/components/station/workbench/workbench-layout.ts` |
| Frame / yield | `src/lib/right-rail/frame.ts` |
| Nested radius | `nestedCornerClass` / radius tokens |
| Motion | `@/design-system/motion` only |

### Laws to read first

- `AGENTS.md`
- `.claude/rules/source-of-truth.md` → Unbox centre · Depth/planes · Frame budget · Right-rail modality
- `.claude/rules/display/station-workbench.md` · `station.md` · `workbench.md` · `right-rail-inspector.md`
- `.claude/rules/pattern-evolution.md`

---

## Phase A — Law + failing guards (no product UI yet)

**Paste:**

> Execute **Phase A** only from `docs/todo/scan-station-displays-sot-PROMPT.md`.
> Do not rewrite `TriagePanel` yet.

**Do:**

1. **Promote one SoT row** (and a one-liner in `AGENTS.md` if missing):
   - Scan-station reference tools (Pairing/Linkage · Classify · Staging · Ticket · Photos · …) live in the **Displays push column**, never as center station `SectionTabsSlider` chrome, never as `RightRailHost` occupants.
   - Arrival center work = PO / unfound lines + identity + dock.
2. **Add a guard file** (suggested:
   `src/components/receiving/triage/arrival-displays-push.guard.test.ts`)
   that **fails today** and documents the target:
   - `TriagePanel.tsx` must **not** import/mount `TriageSectionTabs` / center
     `buildTriageTabs` as station chrome.
   - must **not** contain `pairingOpen`, `togglePairing`, `PairingTogglePill`.
   - must mount a Displays push stack (import of `ReceivingDisplaysPushStack`
     or the shared host extracted in Phase B).
   - must mount unmatched / PO line surface in center (`LinePoItemsSection` /
     `UnmatchedItemsSection` / shared equivalent).
   - PO open path must match `/openDisplays\('linkage'/` (or arrival alias) —
     not `dispatchReceivingOpenPairingPo` alone.
3. Mirror a **Testing** stub assertion block (can `it.todo` or soft-fail list)
   pointing at `TestingPanel.tsx` still having `pairingOpen` — so Phase E is
   scheduled, not forgotten.
4. Update `station-workbench-chrome-config.ts` comments/tiers: Tier A =
   Unbox (done) · Arrival (in flight) · Testing (next).

**Done when:**

- Law text landed.
- New guard exists and **fails red** for the right reasons on Arrival.
- `npm run verify -- --fast` may be red **only** on that new guard (or you
  keep the guard skipped behind a `PHASE_A_PENDING` comment — prefer failing
  open so Phase C must turn it green). Prefer: commit the guard as failing is
  OK only if the user wants; otherwise land the guard assertions commented
  with `// PHASE_C: enable` and enable them when Phase C starts.

**Preferred:** land assertions enabled; Phase C turns them green in the same
branch of work. Do not silence with baseline bumps.

**Verify:**

```bash
npx tsx --test src/components/receiving/triage/arrival-displays-push.guard.test.ts
npm run verify -- --fast
```

---

## Phase B — Extract shared Displays host (Unbox stays golden)

**Paste:**

> Execute **Phase B** only. Extract so Arrival does not copy-paste Unbox
> internals. Unbox behavior must not regress.

**Do:**

1. Extract (or thin-wrap) a **station-family Displays host** from Unbox:
   - Vocabulary pattern from `unbox-side-tabs.ts` — support an **Arrival tab
     set**: at minimum `linkage` · `classify` · `staging` (+ Ticket/Photos if
     Arrival already needs them; prefer reuse Unbox ids).
   - URL sync: either generalize `useUnboxDisplayView` →
     `useStationDisplayView({ surface: 'unbox' | 'arrival' | 'testing' })`
     or add `useArrivalDisplayView` that shares canonicalize helpers.
   - Keep `ReceivingDisplaysPushStack` + `UnboxPushColumn` as the visual shell;
     Arrival mounts the same stack with an Arrival tab builder.
2. Add `buildArrivalSideTabs` (new file under `triage/` or shared
   `station/displays/`) that returns Display bodies:
   - **linkage** → `CartonMatchHub` (`chrome="bare"`, `tabSet="arrival"`,
     `showOpenInUnbox` as product requires — usually true for Arrival escape).
   - **classify** → `TriageClassifySection`
   - **staging** → `StagingSection`
   - Optional: photos / ticket if already reachable from Arrival chrome —
     match Unbox strip order where possible.
3. Re-point Unbox to the shared helpers **without** changing Unbox UX. Guards
   in `unbox-right-edge-chrome.guard.test.ts` and
   `carton-match-hub.guard.test.ts` must stay green.
4. Document Arrival strip order in `display/station-workbench.md`.

**Done when:**

- Unbox still green on existing Unbox guards.
- Arrival tab builder exists but is **not yet** mounted in `TriagePanel`
  (or mounted behind a flag — prefer not mounted until Phase C).
- No second push grammar invented (no new floating gutter column).

**Verify:**

```bash
npx tsx --test \
  src/components/receiving/workspace/unbox-right-edge-chrome.guard.test.ts \
  src/components/receiving/workspace/line-edit/carton-match-hub.guard.test.ts \
  src/components/receiving/workspace/line-edit/unbox-side-tabs.test.ts
npm run verify -- --fast
```

**Traps:**

- Do not rename Unbox `linkage` for Arrival — canonicalize aliases if needed
  (`pairing` → `linkage`).
- Do not put Staging inside Linkage. Staging is its own display (was its own
  center tab).
- Frame budget: Displays push must still yield via `frame.ts`; do not dual
  full-width right columns with AI.

---

## Phase C — Arrival: remove center tabs + port to Displays (THE product ask)

**Paste:**

> Execute **Phase C** only — the Arrival rewrite. This is the screenshot fix:
> remove Classify/Staging/Pairing top tabs; Package Pairing leaves the middle;
> unfound PO lines stay center; details open on the Displays push (right).

### C1 — Rewrite `TriagePanel` anatomy

Target JSX shape (match `LineEditPanel` sibling pattern):

```text
StationPanelRoot
  StationContextBar + LineCartonContextSection
    onEditPo → openDisplays('linkage') + setPairingFocus
    poEditOpen → activeSideTab === 'linkage'
  [optional] StationRightEdgeAction "Open in unbox"  (keep; quiet escape)
  CENTER column (sunken):
    — NO SectionTabsSlider / TriageSectionTabs
    — Unfound / matched PO lines via LinePoItemsSection / UnmatchedItemsSection
      (editLines/serialScan per Arrival product — Arrival may keep editLines false)
    — UnfoundTodoStrip when unmatched (can stay under lines)
    — WorkspaceNotesCard ONLY if not already in dock; prefer Unbox: notes in dock
  DOCK: StationTerminalDock — Save for unbox (decouple from tab id — P3)
  RIGHT sibling: ReceivingDisplaysPushStack / UnboxPushColumn
    tabs from buildArrivalSideTabs
```

### C2 — Delete center-tab machinery from Arrival

Remove from `TriagePanel.tsx`:

- `activeTab` state used as SectionTabs value (replace with display URL state).
- `pairingOpen` / `togglePairing` / `openPoPairing` toggle branch.
- `PairingTogglePill` / `sectionTabsRightSlot` / `editPoControl`.
- `buildTriageTabs` + `TriageSectionTabs` mount.
- `requestAnimationFrame(() => dispatchReceivingOpenPairingPo())` for the
  Displays path — use Unbox `setPairingFocus` mount handoff instead.

Delete or gut `build-triage-tabs.tsx`:

- Center Classify/Staging/Pairing `SectionTab[]` builder dies.
- If anything remains, it is only a Displays body factory — rename clearly
  (`build-arrival-side-tabs.tsx`) so grep never finds “triage tabs” meaning
  center chrome.

### C3 — Re-point deep links (`triage-focus.ts`)

Today:

```ts
TriageFocusTab = 'overview' | 'staging' | 'pairing'
triageFocusToTab('classify') → 'overview'
```

Target:

```ts
// Map focus targets → Displays ids (not center tabs)
triageFocusToDisplay('classify') → 'classify'
triageFocusToDisplay('stage') → 'staging'
triageFocusToDisplay('pair') → 'linkage'
```

- Update `triage-focus.test.ts`.
- Callers that `setActiveTab(...)` must `openDisplays(...)` instead.
- URL params that said `?tab=pairing` canonicalize to display=linkage.

### C4 — Center body content

- **Always show** the PO / unfound line surface in center (this is the ask).
- For unfound: `UnmatchedItemsSection` / unmatched accordion — same shared
  path Unbox uses via `LinePoItemsSection`.
- Do **not** re-introduce Package Pairing card / `TriagePoUnboxingSection`
  matching chrome in center. Matching lives in Linkage display only.
- Collapse `TriagePoUnboxingSection` / `TriageLineMatchingSection` to Displays
  wrappers or delete if `buildArrivalSideTabs` mounts `CartonMatchHub` directly.

### C5 — Terminal / dock (P3)

- `useStationTerminalAction({ tabId: activeTab })` must **not** key Save-for-unbox
  on Classify/Staging/Pairing. Terminal is carton-scoped. Use a stable mode id
  (`'arrival'` / `'triage'`) so opening Linkage does not relabel the dock.

### C6 — Enable Phase A guards

- Turn Arrival Displays guard fully green.
- Extend `unbox-right-edge-chrome.guard.test.ts` notes: Triage no longer uses
  `pairingOpen` / event — update the assertion that currently says Triage keeps
  the in-place event (`block A` ~476–489). After Phase C, Triage should match
  Unbox’s focusTab handoff; delete the “Triage keeps event” carve-out if the
  event has no Arrival listeners left (or keep event only while Testing still
  needs it — document which).

### C7 — Visual accept (attach `:3050`, QA org)

1. Open Arrival → focus an **unfound** carton.
2. Confirm: **no** Classify/Staging/Pairing pill strip.
3. Confirm: middle shows unfound PO / unmatched lines — **not** Package Pairing.
4. Open Linkage/Pairing from Displays (or PO chip) → hub on the **right**.
5. Open Classify · Staging from Displays → editors on the **right**.
6. Save for unbox still works from dock.
7. Open a **matched** carton — lines center; Linkage still right.
8. Unbox regression smoke: lines + label center; Linkage right.

**Done when:** Phase A Arrival guards green; triage-focus tests updated;
manual accept above; `npm run verify` green.

**Verify:**

```bash
npx tsx --test \
  src/components/receiving/triage/arrival-displays-push.guard.test.ts \
  src/lib/receiving/triage-focus.test.ts \
  src/components/receiving/workspace/unbox-right-edge-chrome.guard.test.ts
npm run verify
```

**Deletion grep (must be clean for Arrival paths):**

```bash
rg -n "pairingOpen|PairingTogglePill|TriageSectionTabs|buildTriageTabs" \
  src/components/receiving/triage/
rg -n "activeTab.*overview|setActiveTab\('pairing" \
  src/components/receiving/triage/
```

---

## Phase D — Arrival dead-code + doc scrub

**Paste:**

> Execute **Phase D** only. Delete orphans Phase C left behind. Verify by
> call site, not docblock.

**Do:**

1. Delete unused:
   - `TriagePoUnboxingSection` / `TriageLineMatchingSection` if zero callers.
   - Center-only props on matching wrappers (`pairingOpen`, `onPairingToggle`,
     `chrome="card"` collapse paths with no callers).
   - Stale `RECEIVING_OPEN_PAIRING_PO_EVENT` listeners **only if** Testing and
     every other host no longer dispatch (else keep until Phase E).
2. Scrub docs/rules still naming deleted stacks:
   - `ReceivingClaimStack` · `ReceivingTicketStack` · `ReceivingToolPushStack`
   - Point them at `ReceivingDisplaysPushStack` + `TicketDisplayHost`.
3. Update `unbox-package-pairing-right-rail-HANDOFF.md` status line:
   “Unbox done; Arrival port = this prompt Phase C.”
4. Knip: remove dead exports; refresh `knip-baseline.json` only for intentional
   reviewed removals — say so in the change.

**Verify:**

```bash
rg -n "ReceivingClaimStack|ReceivingTicketStack|ReceivingToolPushStack" \
  src docs .claude
npm run verify
```

---

## Phase E — Testing panel (Tier A twin)

**Paste:**

> Execute **Phase E** only. Port `TestingPanel.tsx` to the same Displays
> grammar. Center = testing work; Pairing/PO tools on Displays push. Kill
> `pairingOpen` + center `SectionTabsSlider` station chrome.

**Do:**

1. Read `TestingPanel.tsx` — it still has `pairingOpen`, `PairingTogglePill`,
   `buildSectionTabs` / `SectionTabsSlider` (sibling P2/P3).
2. Mount shared Displays host (Phase B). Decide Testing side-tab set (likely
   subset: linkage + whatever Testing already tabs).
3. Decouple dock CTA from tab id (P3) as part of the move.
4. Enable Testing assertions from Phase A guard; extend
   `station-workbench-chrome.guard.test.ts` Tier A = Unbox + Arrival + Testing
   all Displays-push compliant.
5. Manual: Testing focused unit — Pairing opens right, not center toggle.

**Verify:**

```bash
npx tsx --test src/components/station/workbench/station-workbench-chrome.guard.test.ts
npm run verify
```

**Out of scope for E:** Testing ownership My/All handoffs
(`testing-triage-ownership-scope-HANDOFF.md`) unless they block the chrome move.

---

## Phase F — Tier B station columns (Pack · Labels · Shipping · Packer review)

**Paste:**

> Execute **Phase F** only. Tier B from
> `station-workbench-chrome-config.ts`. Compose `StationPanelRoot` /
> `StationWorkbench`. Adopt Displays **only where** center tabs today hold
> reference tools. Do not invent Displays for stations with no such tools.

**Do:**

1. `LabelsOrderWorkspace` — kill panel-root hand-roll; shrink
   `PANEL_ROOT_BASELINE`.
2. `PackOrderPanel` · `ActiveOrderWorkspace` · `PackerReviewMode` — Station
   chrome adoption; move station-level body tabs to Displays if they are the
   P2 defect (see `unbox-SIBLING-PATTERNS.md`).
3. Repair intake + Support service-workspace stay **non-members**
   (`workbench-anti-station-shell.guard.test.ts`).
4. Pickup: Station chrome only when a focus entity exists.
5. Parallel (if not done): return-to-scan ports —
   `docs/todo/return-to-scan-PORTS.md` — hybrid Workbench chrome only; do not
   mix into Displays push work without a clear boundary.

**Verify:**

```bash
npx tsx --test src/components/station/workbench/station-workbench-chrome.guard.test.ts
npm run verify
```

---

## Phase G — Token / layout pin audit (propagation)

**Paste:**

> Execute **Phase G** only. Audit every scan station / hybrid workbench so
> one SoT edit fans out. No new behavior unless a fork is found.

**Checklist per surface** (Arrival · Unbox · Testing · Pack · Scan-out ·
Labels · Pickup · Repair browse · FBA/Ready sheets):

| Must compose | Forbidden fork |
|---|---|
| `WORKBENCH_SHEET_HOST` / `CHROME` | Local `rounded-xl` sheet islands |
| `WORKBENCH_CHROME_PILL_CLASS` | `rounded-*-none` solid CTAs against hairline |
| `STATION_WORKBENCH_*` | Local `max-w-[720px]` / `max-w-3xl` (unless exempt comment) |
| `UnboxPushColumn` / shared Displays | Second push gutter / `my-2` islands between planes |
| `frame.ts` yield | Crushing center below `MIN_WORK_SURFACE_PX` |
| `@/design-system/motion` | Raw `framer-motion` / `motion/react` outside DS |

Fix forks by **growing the SoT**, then re-point. Shrink guard baselines only.

**Verify:** full `npm run verify`.

---

## Phase H — Cohort dead-code finale + E2E

**Paste:**

> Execute **Phase H** only. Final deletion pass + QA-org E2E smoke.

**Do:**

1. Repo-wide deletion grep:

```bash
rg -n "pairingOpen|PairingTogglePill" src --glob '!**/node_modules/**'
rg -n "TriageSectionTabs|buildTriageTabs" src
rg -n "ReceivingClaimStack|ReceivingTicketStack|ReceivingToolPushStack" src docs .claude
```

2. If `PairingTogglePill` has zero callers — delete the primitive from
   `station/workbench`. If Testing still needs it, Phase E was incomplete.
3. E2E (QA org, not dogfood): Arrival unfound carton → no center tabs → lines
   center → Linkage right → Save for unbox. Unbox smoke regression.
4. Full `npm run verify`.

**Done when:** greps clean (or intentional allowlist documented in a guard);
E2E green on QA org; verify green.

---

## Phase order cheat-sheet

| Phase | One line | Turns green |
|---|---|---|
| **A** | Law + failing Arrival Displays guards | Law only |
| **B** | Extract shared Displays host; Unbox unchanged | Unbox guards |
| **C** | Arrival: kill tabs; Pairing/Classify/Staging → Displays; lines center | Arrival guards + verify |
| **D** | Delete Arrival orphans; scrub deleted-stack docs | knip + verify |
| **E** | TestingPanel same grammar | Tier A Displays |
| **F** | Tier B StationPanelRoot + Displays where needed | chrome guard |
| **G** | Token/shell fork audit | verify |
| **H** | Dead-code finale + E2E QA org | verify + E2E |

---

## Paste blocks (short) — one per new Claude Code session

### Session 1 — Phase A+B

> Read `docs/todo/scan-station-displays-sot-PROMPT.md`. Do **Phase A then B**.
> Law + guards + extract shared Displays host. Do **not** rewrite TriagePanel.
> `npm run verify -- --fast` after each. Unbox must not regress.

### Session 2 — Phase C (Arrival product)

> Read `docs/todo/scan-station-displays-sot-PROMPT.md` Phase C. Rewrite
> `TriagePanel`: remove Classify/Staging/Pairing center tabs; move Package
> Pairing + Classify + Staging to Displays push (NOT RightRailHost); center =
> unfound/PO lines only + dock. Re-point `triage-focus`. Enable Arrival
> guards. Visual check on `:3050`. Full `npm run verify`.

### Session 3 — Phase D+E

> Read the prompt. Phase D dead-code scrub, then Phase E TestingPanel Displays
> port. Full verify.

### Session 4 — Phase F+G+H

> Read the prompt. Tier B ports, token audit, final deletion grep, QA-org E2E,
> full `npm run verify`.

---

## Acceptance summary (product)

| Surface | Pass |
|---|---|
| Arrival focused | No top Classify/Staging/Pairing strip |
| Arrival center | Unfound/matched PO lines (+ identity + dock) |
| Arrival right | Package Pairing / Classify / Staging in Displays push |
| Unbox | Unchanged grammar (lines center · Linkage right) |
| Testing (after E) | No center pairing toggle; Displays push |
| Architecture | No Pairing in `RightRailHost`; shared shells only |
| CI | `npm run verify` green; baselines never raised |
