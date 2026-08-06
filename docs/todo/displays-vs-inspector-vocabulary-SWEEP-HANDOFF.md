# Displays vs inspector — codebase vocabulary sweep HANDOFF

**Created 2026-08-05.** Paste-ready execution prompt for Claude Code to align
**operator copy + comments + docs** with the ratified three-way noun law
(Station **Displays** ≠ Desk **inspector** ≠ carton **LineEdit**), codebase-wide.

**Lane:** current checkout — attach to `:3050`; never start/restart/kill the
dev server. User owns commits.

**Prerequisite (done on this tree — do not re-open):**

| Lock | Where |
|---|---|
| SoT law | [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → **Displays vs inspector** |
| AGENTS one-liner | [`AGENTS.md`](../../AGENTS.md) Scan-station centre bullet |
| Display recipes | [`station-workbench.md`](../../.claude/rules/display/station-workbench.md) · [`right-rail-inspector.md`](../../.claude/rules/display/right-rail-inspector.md) · [`workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md) |
| Goldens | `UnboxDisplaysEdgeToggle` = **Open displays** / **Hide right panel**; Unbox History Band 3 = **Show / Hide inspector** |
| Guards | `unbox-right-edge-chrome.guard.test.ts` · `history-carton-triage.guard.test.ts` · `receiving-grid-sheet.guard.test.ts` |

**Coordinates with (do not conflate):**

| Doc | Use |
|---|---|
| [`history-inspector-topic-icons-HANDOFF.md`](./history-inspector-topic-icons-HANDOFF.md) | History peek **Display topics** (scroll body) — singular category, **not** Station Displays |
| SoT → Right-rail modality | Desk `RightRailHost` peeks stay **inspector**; Station push stays **Displays** |

---

## Paste this into a new Claude Code session

```
Read docs/todo/displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md end-to-end before editing.

GOAL
Codebase-wide operator-copy + comment + recipe alignment to the ratified noun law:

  Station Displays  ≠  Desk inspector  ≠  carton LineEdit surface

Keep live goldens. Fix drift. Extend guards so cohort pages cannot reintroduce
wrong nouns. Do NOT invent twin toggles or rename product regions.

LOCKED COPY (do not “improve”)
| Surface | Control | Correct strings |
|---|---|---|
| Station scan LineEdit | UnboxDisplaysEdgeToggle ←| / →| | Open displays · Hide right panel |
| Desk / History Band 3 | park/reopen ColumnsTwo (etc.) | Show inspector · Hide inspector · Select a row to open the inspector |
| DeskRailChromeRow / push dismiss | close →| | Hide right panel (REGION, not tab) |
| Carton LineEdit | already open | NEVER “Open details editor” on the Displays edge glyph |
| History peek topic icons | Display | Edit topics | “Display topic” ≠ “Displays column” |

REJECTED RENAMES
- Station ←| → “Open inspector” or “Open details editor”
- History Band 3 → “Open displays” / “Hide displays”
- Calling RightRailHost peeks “Displays”
- Mounting Station Displays as a RightRailHost occupant

HARD LAWS
- AGENTS.md + source-of-truth.md → Displays vs inspector · Scan-station centre lines display · Right-rail modality
- display/station-workbench.md · right-rail-inspector.md · workbench-ops-queue.md
- Grow SoT / compose existing toggles — never Invent DisplaysEdgeToggle twin / InspectorToggle twin
- Motion only @/design-system/motion; attach to :3050; user owns commits
- npm run verify before done; never raise knip / DS ratchets

INVENTORY FIRST (rg before edits)
1. Operator strings in src/**/*.{tsx,ts}:
   - Hide displays | Show displays | Open displays | Open inspector
   - details editor | Open details | Hide details (classify — many are OK for non-rail UI)
   - Show inspector | Hide inspector | Hide right panel
2. Default props / ariaLabelClose that still say Hide displays on Station push
   (known: ScanStationProgressControl ariaLabelClose = 'Hide displays')
3. Support / service-workspace toggles that say Show/Hide displays
   (known: SupportTicketPaneHeader — may be CORRECT if it opens a Displays-class
   column; confirm against SoT before changing)
4. Cohort Band 3 / workbench trailing toggles for record peeks
   (Incoming · Orders · Pack · Testing · Shipping · Labels · Triage) — must use
   inspector nouns if they park RightRailHost detail:*, not displays
5. Studio Canvas inspector (StudioShell Show/Hide inspector) — KEEP; Canvas
   secondary detail is “inspector” by contextual-display.md
6. Comments / handoffs / .claude/rules that conflate Displays with inspector
7. E2E aria asserts (tests/e2e/unbox-displays-column.spec.ts already pins
   Hide right panel)

WAVES
Wave 1 — Station push close copy
- Align every Station Displays open/close string with UnboxDisplaysEdgeToggle /
  UNBOX_PUSH_CLOSE_LABEL ('Hide right panel'). Fix ScanStationProgressControl
  default ariaLabelClose if it still says Hide displays (close names REGION).
- Preserve Open displays for pane-open only.

Wave 2 — Desk / table Band 3 inspector toggles
- Any WorkbenchTriageBand.trailing (or twin) that parks detail:* RightRailHost
  must say Show/Hide inspector (or select-a-row), never Open/Hide displays.
- Port Unbox History golden pattern; do not invent page-local copy helpers unless
  a shared string constant in an existing SoT module is clearly warranted.

Wave 3 — Support / other “Displays” toggles
- If the control opens a Station-family Displays push column → Displays nouns.
- If it opens RightRailHost / Canvas secondary detail → inspector nouns.
- Document the decision in a one-line comment at the call site if ambiguous.

Wave 4 — Docs + guards
- Grep docs/todo + .claude/rules for wrong renames; fix prose only where it
  contradicts the SoT table (do not rewrite history of old handoffs wholesale).
- Extend guards (prefer growing unbox-right-edge-chrome / receiving-grid-sheet /
  cohort *-sheet.guard.test.ts) so Hide displays cannot return on Station close
  and Open displays cannot appear on Desk Band 3 inspector toggles.
- After new docs under docs/: node scripts/portfolio-sot-sync.mjs if catalog drifts.

OUT OF SCOPE
- history-inspector-topic-icons UI condensation (separate handoff)
- Renaming LineEditPanel or inventing “details editor” product noun
- Changing RightRailHost collapseLabel="Hide details" (edge grip — different job)
- Mobile “Show details” expanders / photo viewer Hide details (i) — not this law

DONE WHEN
- rg shows no Station ←| / push-close using inspector or details-editor copy
- rg shows no Desk Band 3 detail-park toggle using Open/Hide displays
- Known goldens unchanged: UnboxDisplaysEdgeToggle + Unbox History Band 3
- Targeted guards green + npm run verify green; no ratchet baseline raises
```

---

## 1. Why this exists

Operators (and agents) conflate three right-edge jobs that share similar glyphs
(`←|` / `→|` / ColumnsTwo):

1. **Station Displays** — reference tools column on the carton bench  
2. **Desk inspector** — `RightRailHost` peek over a table (History golden)  
3. **LineEdit** — the carton work surface itself (already open when scanning)

Unbox goldens + SoT + three guards already lock the nouns. Cohort surfaces and
a few defaults still say **Hide displays** where the SoT wants **Hide right
panel**, or may mislabel Band 3 peeks. This sweep finishes the product, not the
Unbox island.

## 2. Seeded drift to triage (measured 2026-08-05)

| Location | Current | Likely fix |
|---|---|---|
| [`UnboxDisplaysEdgeToggle.tsx`](../../src/components/receiving/workspace/UnboxDisplaysEdgeToggle.tsx) | Open displays / Hide right panel | **Keep** (golden) |
| [`UnboxWorkspaceHeader.tsx`](../../src/components/receiving/unbox/UnboxWorkspaceHeader.tsx) History Band 3 | Show / Hide inspector | **Keep** (golden) |
| [`ScanStationProgressControl.tsx`](../../src/components/station/ScanStationProgressControl.tsx) `ariaLabelClose` | `'Hide displays'` | Prefer **Hide right panel** (REGION close) unless a call site proves Displays-only |
| [`SupportTicketPaneHeader.tsx`](../../src/components/support/service-workspace/SupportTicketPaneHeader.tsx) | Show / Hide displays | Confirm: Support display column → **keep Displays**; if it became a Desk inspector, switch |
| [`StudioShell.tsx`](../../src/components/studio/StudioShell.tsx) | Show / Hide inspector | **Keep** (Canvas inspector) |
| [`DeskRailChromeRow.tsx`](../../src/components/right-rail/DeskRailChromeRow.tsx) `closeTitle` | Hide right panel | **Keep** |
| Photo / mobile / picker “Hide details” | various | **Out of scope** |

## 3. Acceptance grep (after)

```bash
# Station edge must not borrow Desk nouns
rg -n "Open inspector|Open details editor|details editor" \
  src/components/receiving/workspace/UnboxDisplaysEdgeToggle.tsx \
  src/components/station/ScanStationProgressControl.tsx

# History / Desk Band 3 must not borrow Station Displays open copy
rg -n "Open displays" src/components/receiving/unbox/UnboxWorkspaceHeader.tsx

# Push close should name the region (except deliberate Displays-tab-only UI)
rg -n "Hide displays" src/components --glob '*.tsx'
```

## 4. Verify

```bash
npx tsx --test \
  src/components/receiving/workspace/unbox-right-edge-chrome.guard.test.ts \
  src/components/receiving/history/history-carton-triage.guard.test.ts \
  src/components/station/receiving-grid/receiving-grid-sheet.guard.test.ts
# + any new/extended cohort guards touched

npm run verify
```
