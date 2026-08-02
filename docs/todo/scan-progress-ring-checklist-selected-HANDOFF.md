# Handoff — Scan progress ring owns Checklist (selected face + drop strip tab)

**For:** implementing agent (Claude Code / Cursor)  
**Date:** 2026-08-02  
**Status:** ready to execute · decisions locked  
**Product:** Cycle Forge Station contract (Unbox golden; peers compose the same SoT later)  
**WS:** dogfood `main` — attach `:3050`, never start/kill the dev server; user owns commits

---

## 0. Paste prompt

```
Unbox Displays: the pane-anchored scan progress ring becomes the ONLY Checklist
entry. Remove the Checklist tab from the Displays icon strip. When checklist is
the active display, the ring face is highlighted / darkened so staff see that
Checklist is selected and on screen.

Read first, in order:
1. docs/todo/scan-progress-ring-checklist-selected-HANDOFF.md  (this file)
2. .claude/rules/display/station.md → Procedure progress chrome
3. .claude/rules/display/station-workbench.md → Unbox Displays + scan progress
4. .claude/rules/source-of-truth.md → Right-rail modality (Unbox push)
5. AGENTS.md + .claude/rules/workflow-safety.md

Already locked (do NOT re-litigate):
- Ring is ScanStationProgressControl / ScanStationProgressRing — NOT GoalRing
- Ring is ALWAYS pane-anchored top-right (same place open or closed)
- Displays strip = density="icon": tabs · vertical ⋮ · flat pencil
- Hover peek = 2 checklist rows; hover OFF while any push rail is open
- Click ring opens Displays on checklist / closes when checklist is showing
- Two views, one derivation: useUnboxProcedureSteps

Your job (one landing):
1. Selected face on the ring when activeSideTab === 'checklist' (and Displays open)
2. Remove Checklist from the strip membership (no strip cell, not in ⋮ overflow)
3. Keep `?display=checklist` as a valid Displays body — opened only via the ring
4. Update strip default / resolveUnboxSideTab fallbacks (checklist is no longer
   the strip lead)
5. Update SoT one-liners + unbox-side-tabs tests + e2e that click the Checklist tab
6. npm run verify green on YOUR files

Do not move the ring into the strip. Do not fork a second ring. Do not raise
ratchet baselines. Do not commit unless asked.
```

---

## 1. One-sentence goal

Checklist is no longer a strip tab — the pane progress ring **is** the Checklist
control, and when that display is open the ring reads as **selected** (highlighted /
darkened).

---

## 2. Current state (as of this handoff)

| Piece | Path | Today |
|---|---|---|
| Ring SoT | `src/components/station/ScanStationProgressControl.tsx` + `ScanStationProgressRing.tsx` | Bare ring; `expanded` = Displays open (any tab) |
| Unbox adapter | `src/components/receiving/workspace/UnboxScanProgressControl.tsx` | Opens `checklist`; hover peek 2 rows |
| Pane mount | `LineEditPanel.tsx` → `stationMoreDetailsPaneHostClass` | Always mounted |
| Strip | `SectionTabsSlider` `density="icon"` + `UnboxSectionTabs` | Checklist is primary strip cell + default |
| Tab id / URL | `unbox-side-tabs.ts` · `?display=` | `checklist` leads `UNBOX_SIDE_TAB_ORDER` |
| Body | `unbox-tabs.tsx` → `UnboxProcedureChecklist` | Renders in Displays push |

Screenshot debt: Checklist still appears as a selected strip pill while the ring
floats separately top-right — two names for one display.

---

## 3. Locked decisions

| # | Decision | Why |
|---|---|---|
| D1 | Ring stays **pane-anchored** always | Procedure chrome ≠ panel chrome; same place open/closed |
| D2 | **Remove Checklist from the strip** (primary and overflow) | Ring is the entry; strip cell is redundant and fights the ring |
| D3 | Keep `checklist` as a **Displays body id** + `?display=checklist` | URL durability; `null` still means column closed |
| D4 | Ring **selected face** when `showDisplays && activeSideTab === 'checklist'` | Operator sees which display is live without a strip cell |
| D5 | Click ring: if checklist showing → `closeDisplays()`; else → `openDisplays('checklist')` | Already close to this; do not close when another tab is showing without switching — prefer: click while Displays open on another tab → switch to checklist; click while on checklist → close |
| D6 | Hover peek stays off while any push rail is open | Already shipped |
| D7 | New strip default when Displays opens from non-ring entry = first visible **non-checklist** tab (classify / listings by gates) | Checklist no longer leads the strip |
| D8 | Visual: selected = darkened / highlighted ink + calm wash (match icon-rail `ICON_CELL_ACTIVE_CLASS` energy — `bg-surface-sunken` + stronger stroke — **not** a GoalChip semantic hue, not a saturated accent pill) | Quiet Station chrome |

### Click matrix (lock this)

| Current state | Ring click |
|---|---|
| Displays closed | `openDisplays('checklist')` |
| Displays open on `checklist` | `closeDisplays()` |
| Displays open on another tab | `openDisplays('checklist')` (switch, don’t close) |

---

## 4. Implementation sketch

### 4.1 Selected face — `ScanStationProgressControl` / ring

- Add prop `selected?: boolean` (or tighten meaning of `expanded` to “checklist selected” and pass a separate `railOpen` for hover — Unbox already has both; prefer **`selected`** = checklist active so other stations can reuse).
- When `selected`:
  - Darken progress stroke (e.g. slate-700 / `text-text-default` ink)
  - Optional calm wash behind the bare button (`bg-surface-sunken rounded-lg`) — still **no white card / no circular plate**
  - `aria-pressed={selected}` or keep `aria-expanded` honest to Displays open
- Grow `ScanStationProgressRing` only if needed (`tone: 'idle' | 'selected'`) — compose, don’t fork.

### 4.2 Strip — drop Checklist membership

- `buildUnboxSideTabs` / filter: still **mount** checklist panel content when `activeSideTab === 'checklist'`, but do **not** emit a strip `SectionTab` for it (or mark it strip-hidden).
- Cleanest shape: split “body registry” from “strip tabs”:
  - Bodies: include checklist
  - Strip tabs: `UNBOX_STRIP_TAB_ORDER` without `checklist`
- `UNBOX_SIDE_TAB_ORDER`: either keep checklist in the type for URL resolve, or keep type + add `UNBOX_STRIP_TABS` without it. Update `resolveUnboxSideTab` fallback to first **strip-visible** tab when a gated tab dies — if request is `checklist`, still honor it.
- `unbox-side-tabs.test.ts`: rewrite “checklist LEADS the strip” → “checklist is ring-only / not on strip”; keep “always resolvable via URL”.

### 4.3 Wire Unbox adapter

```ts
selected={showDisplays && activeSideTab === 'checklist'}
// click matrix in §3
```

Pass `selected` from `LineEditPanel` (has `showDisplays` + `activeSideTab`).

### 4.4 Docs (same landing)

Update one-liners in:

- `.claude/rules/display/station.md` — Procedure progress chrome
- `.claude/rules/display/station-workbench.md` — Unbox Displays strip + ring
- `.claude/rules/source-of-truth.md` — Displays / ring sentence
- Docblocks on `UnboxProcedureChecklist`, `unbox-side-tabs.ts`, `unbox-tabs.tsx` (no longer “FIRST and PRIMARY” strip cell)

### 4.5 Tests / e2e

- Unit: side-tab order + resolve fallbacks
- E2E: `tests/e2e/unbox-displays-column.spec.ts` — open checklist via `unbox-displays-expand-button`, assert body; assert no strip cell for Checklist; assert selected face (testid / aria) when open

---

## 5. Out of scope

- Moving the ring into the strip row
- GoalRing / daily goal chip
- Pack / Testing procedure rings (compose later when they have a derivation)
- Changing centre procedure cards
- ResizeObserver strip membership (Phase 5 of record-cursor plan)

---

## 6. Done when

- [ ] No Checklist cell on the Displays icon strip (or ⋮ menu)
- [ ] Ring click opens checklist / closes when checklist active / switches when another tab active
- [ ] Ring face clearly selected (highlighted + darkened) while checklist is showing
- [ ] Ring position unchanged whether Displays is open or closed
- [ ] `?display=checklist` still deep-links
- [ ] SoT docs + tests updated
- [ ] `npm run verify` green (fix only what you broke)

---

## 7. Verify

```bash
npm run verify -- --fast
# then full verify before claiming done
npm run verify
```
