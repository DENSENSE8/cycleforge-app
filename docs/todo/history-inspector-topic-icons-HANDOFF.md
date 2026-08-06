# History inspector — topic icon condensation HANDOFF

**Created 2026-08-05.** Paste-ready execution prompt for the session that
rewrites Unbox History’s `detail:history` push inspector so **actions are
icon-only, grouped by topic**, with a clear **Display** vs **Edit** split —
instead of the current labelled button strip + overflow menu + body CTAs.

**Lane:** current checkout — attach to `:3050`; never start/restart/kill the
dev server. User owns commits.
**Prerequisite (done on this tree):** Unbox History Band 3 command row +
collapse-preserving inspector toggle (`Cmd+\` / `]` / Band 3 trailing). Do
**not** re-open that work; compose it.

**Coordinates with (do not re-litigate):**

| Doc | Use |
|---|---|
| [`right-panel-display-HANDOFF.md`](./right-panel-display-HANDOFF.md) | Law: action icons TOP row; **no labelled button block**; `close · up · down` far right; PUSH |
| [`.claude/rules/display/right-rail-inspector.md`](../../.claude/rules/display/right-rail-inspector.md) | Desk chrome: `DeskRailChromeRow` vs orders `PaneHeaderActionBar` |
| [`right-rail-inspector-FINISH-HANDOFF.md`](./right-rail-inspector-FINISH-HANDOFF.md) | Broader product-wide header contract — **this handoff is History-first**, not Session 1 wholesale |

---

## Paste this into a new session

```
Read docs/todo/history-inspector-topic-icons-HANDOFF.md end-to-end before editing.

GOAL
Rewrite HistoryCartonTriagePanel (detail:history) so every secondary action is
an icon in a per-TOPIC cluster, split into Display topics (scroll / reveal
dense read sections) vs Edit topics (mutate / jump to station work). Kill the
labelled button strip (Print barcode · Open in Unbox · Resolve Unfound) and
the ad-hoc MoreHorizontal dump. Align chrome with DeskRailChromeRow + an
icon-only PaneHeaderActionBar (or DeskRailChromeRow.trailing topic cluster).

HARD LAWS
- AGENTS.md + source-of-truth.md → Right-rail modality (PUSH; overlay only via frame.ts)
- display/right-rail-inspector.md → no labelled button blocks in the inspector;
  close is →|; prev/next on the same chrome row; identity = PaneHeaderLabel short key
- Grow SoT (PaneHeaderActionBar / DeskRailChromeRow / OrderFactList) — never invent
  HistoryInspectorHeader / TopicIconBar twins
- Band 3 command row stays find + in-field filter + inspector toggle — do NOT move
  Drill · Compare · Paint · Staff · week · ▦ into the inspector (those are sheet
  layout / refine, not record topics). Optional later: topic icons that SCROLL the
  panel body when already open — not new Band 3 chrome.
- Motion only via @/design-system/motion (motionRole.push.rail already owns park)
- Attach to :3050; user owns commits; npm run verify before done; never raise ratchets

START
1. Inventory live actions in HistoryCartonTriagePanel (header buttons, More menu,
   body ghosts, audit open) against §2 topic map below.
2. Implement Wave 1 (chrome + kill labelled buttons) before Wave 2 (body topic
   headers / scroll-spy). Wave 3 is polish + guards.

DONE WHEN
- No labelled primary/secondary Button strip under identity on detail:history
- Actions are icon-only, grouped by the §2 topics (Display vs Edit)
- DeskRailChromeRow still owns →| · ↑ · ↓ on Row 1 only; topic icons own a
  dedicated Row 2 ActionBar (never on the chrome row) — never a second close
- Unfound vs matched action sets still differ; destructive / station handoff
  stays behind HoverTooltip labels (and confirm where already required)
- history-carton-triage.guard + right-rail-inspector-header.guard green
- npm run verify green
```

---

## 1. Why this exists (measured on the live panel)

[`HistoryCartonTriagePanel.tsx`](../../src/components/receiving/history/HistoryCartonTriagePanel.tsx)
already has the right **body topics** (PO linking / Order summary · Logistics ·
Photo evidence · Audit), but the **action surface is pre-SoT**:

| Current affordance | Problem |
|---|---|
| Labelled `Print barcode` / `Open in Unbox` / `Resolve Unfound` Buttons under identity | Violates right-panel-display law #1 — labelled button **block** |
| `MoreHorizontal` menu (Assign holding · Flag unknown · Attach photo · Report condition · View audit) | Topic-blind dump; Edit and Display mixed |
| Body “View listing” ghost + “Full log” ghost | Second action surface fighting the header |
| `DeskRailChromeRow` only has close · prev · next | Correct chrome seed — missing the **icon action row** orders already prove |

Band 3 (just shipped) is **not** this job: find · in-field filter · inspector
toggle · secondary sheet refine (Drill · Compare · Paint · Staff · week · ▦).
Condensing **those** is a different handoff. This one is **record inspector
display + edit**.

---

## 2. Topic map (locked for Wave 1–2)

One dedicated **topic icon row** under chrome (Row 2). Each topic is either
**Display** (reveal / focus a body section — no mutation) or **Edit** (mutate
here, open a rail tool, or hand off to Station / Unbox).

### 2.1 Display topics (read / navigate)

| Topic id | Icon job (HoverTooltip) | Body section / behavior |
|---|---|---|
| `summary` | Order / PO summary | Scroll to “Order summary” / “PO linking” |
| `logistics` | Logistics & channel | Scroll to tracking · channel · qty · location |
| `photos` | Photo evidence | Scroll to `ReceivingPhotosSection` (read-only on History peek) |
| `audit` | Audit / timeline | Open compact audit peek **or** scroll + expand; full `ReceivingAuditPanel` stays one click deeper |

### 2.2 Edit topics (act)

| Topic id | Icon job | Matched carton | Unfound carton |
|---|---|---|---|
| `print` | Print barcode / label | `handlePrint` (today’s Print) | Soft-disable or route to Open Unbox (honest absence OK) |
| `unbox` | Open / Continue / Match in Unbox | Primary station handoff (CTA from readiness) | Same — holding location / resolve work lives in Station |
| `link` | Link / Resolve Unfound PO | Hidden (honest absence) | Primary — today’s Resolve Unfound / pairing deep-link |
| `flag` | Flag / condition / return | Report condition discrepancy | Flag unknown / return to sender |
| `more` | Overflow only for rare edits | Attach photo evidence (if not under photos edit), Assign holding, … | Same — **≤3 items**; prefer promoting to a topic |

**Rules for the map**

1. **Display icons never mutate.** They only scroll, expand, or open a read panel.
2. **Edit icons may hand off to Station** (`openInUnbox` / pairing) — History peek
   stays Desk-family; full condition/serial work stays LineEdit / Displays.
3. **One primary Edit** may use `tone="accent"` (Resolve Unfound **or** Continue
   Unbox / Print — pick by readiness; never two solid labelled buttons).
4. **No topic for sheet layout** (Drill / Compare / Columns / Staff / Week) —
   those stay Band 3.
5. Grow a small pure helper (e.g. `historyInspectorTopics(target, readiness,
   unfound) → PaneHeaderActionBarAction[]`) beside
   [`history-triage-row.ts`](../../src/lib/receiving/history-triage-row.ts) —
   not JSX in the panel file.

---

## 3. Target chrome anatomy

**Status 2026-08-05:** Condensed chrome shipped — labelled Display tabs + one
identity primary CTA + View toggle (not icon-soup ActionBar).

```text
detail:history  (RightRailHost push, modal={false}, edgeCollapse on)
┌──────────────────────────────────────────────────────────────┐
│ Row 1 — DeskRailChromeRow (chrome ONLY)                        │
│ [ →| ] ……………………………… [ ↑ · ↓ ]                                │
├──────────────────────────────────────────────────────────────┤
│ Row 2 — Display tabs (PaneHeaderTabs dense)                    │
│ [ Details | Logistics | Evidence | History ] …… [ View ▾ ]     │
│ View-only: tabs omitted; View strip expanded by default        │
├──────────────────────────────────────────────────────────────┤
│ Row 2b — HistoryViewTopicsCluster (when View expanded)         │
│ paint · drill · compare · zoom · staff · week · ▦ · KPI        │
├──────────────────────────────────────────────────────────────┤
│ Row 3 — Identity + ONE primary + More                          │
│ [badge] status · PO # …… [ Open Unbox ] [ ⋯ ]                  │
├──────────────────────────────────────────────────────────────┤
│ Body — exclusive section for active Display tab                │
│   summary · logistics · photos · audit                         │
└──────────────────────────────────────────────────────────────┘
```

**Compose (locked):** Keep `DeskRailChromeRow` for `→| · ↑ · ↓` with **no**
`.actions`. Display uses `PaneHeaderTabs` (not Edit icon ActionBar). One
`historyInspectorPrimaryAction` Button on identity; secondary edits + shortcuts
in More. Do not put topics on the chrome row or migrate History to a second
close grammar.

**Kill list**

- Labelled `Button` strip under identity (Print / Open / Resolve)
- Body ghost CTAs that duplicate Edit topics (“View listing”, “Full log” as
  buttons — replace with topic icon + optional text link inside the fact row)
- Second close / Esc grammar — park via existing collapse SoT
  (`setDetailInspectorCollapsed` / Band 3 toggle / `Cmd+\`)

---

## 4. Waves

### Wave 1 — Chrome + kill labelled buttons (ship this first)

1. Extract `historyInspectorTopicActions(…)` → `PaneHeaderActionBarAction[]`
   with Display + Edit groups (visual hairline / gap between groups if the
   ActionBar supports it; otherwise Display left, Edit right of the display
   cluster, overflow last).
2. Mount icon-only ActionBar on the panel; wire existing handlers
   (`handlePrint`, `openInUnbox`, `setAuditOpen`, pairing).
3. Delete labelled Button strip + thin the More menu to ≤3 rares.
4. Guard: `history-carton-triage.guard.test.ts` asserts **no**
   `Print barcode` / `Open in Unbox` / `Resolve Unfound` string Buttons; asserts
   `PaneHeaderActionBar` (or documented trailing compose) + `DeskRailChromeRow`.

### Wave 2 — Body topics as Display targets

1. `id` / `data-history-topic` on each body `<section>`.
2. Display topic icons `scrollIntoView({ block: 'nearest' })` (reduced-motion:
   instant — use existing motion/reduced helpers, not a page-local tween).
3. Optional quiet active state when section is in view (IntersectionObserver) —
   do not invent a second tab strip; History peek is not Station section tabs.
4. Photos stay `ReceivingPhotosSection` read-only; Edit “attach evidence” hands
   off to Unbox / photos tool — do not fork a capture stack in the peek.

### Wave 3 — Polish + SoT doc one-liner

1. HoverTooltip labels match §2 table exactly (operators learn topics by tip).
2. One-liner in `display/right-rail-inspector.md`: History peek uses topic-grouped
   icon actions (Display | Edit); labelled strips banned (already law — cite
   History as the receiving golden).
3. `npm run verify`.

---

## 5. Explicit non-goals

- Rebuilding Band 3 command row / wedge / `Cmd+\` collapse (done).
- Moving Pairing / Classify / Staging onto `RightRailHost` (Displays push law —
  Station tools, not this Desk peek).
- Full `LineEditPanel` feature parity inside the peek.
- Product-wide Session 1 of `right-rail-inspector-FINISH-HANDOFF.md` (namespaced
  collapse, every Category A modal) — stay on `detail:history` unless a shared
  ActionBar gap forces a one-line SoT grow.
- GSAP / raw `framer-motion` outside `design-system/motion`.

---

## 6. Files to touch (expected)

| File | Role |
|---|---|
| `src/components/receiving/history/HistoryCartonTriagePanel.tsx` | Compose topic ActionBar; kill labelled strip |
| `src/lib/receiving/history-inspector-topics.ts` (new) | Pure topic → actions map + unit tests |
| `src/lib/receiving/history-triage-row.ts` | Keep target shape; topics consume it |
| `src/components/receiving/history/history-carton-triage.guard.test.ts` | Pin no labelled strip; ActionBar present |
| `.claude/rules/display/right-rail-inspector.md` | One-liner History golden (Wave 3) |

Optional compose only: `PaneHeaderActionBar` API grow if Display|Edit group
separator is missing — prefer existing `divider` / gap props before new
primitives.

---

## 7. Verify

```bash
node --test --import tsx \
  src/lib/receiving/history-inspector-topics.test.ts \
  src/components/receiving/history/history-carton-triage.guard.test.ts \
  src/components/right-rail/right-rail-inspector-header.guard.test.ts

npm run verify
```

Manual on `:3050` `/unbox` History:

1. Left-click row → push inspector; labelled Print/Open/Resolve **gone**.
2. Display topic icons scroll to summary / logistics / photos / audit.
3. Edit: Print · Unbox · (Unfound) Link work; tooltips name the topic.
4. `Cmd+\` still parks without clearing target; Band 3 find still filters.
5. ↑↓ still walks queue via `receiving-navigate-table` / record-cursor.

---

## 8. Status log

| Date | Note |
|---|---|
| 2026-08-05 | Handoff filed after History command-row ship. Panel still has labelled button strip — this job. |
| 2026-08-05 | Waves 1–3: `historyInspectorTopicActions` + icon-only ActionBar (Display \| Edit); labelled strip / body ghosts killed; body `data-history-topic` scroll; SoT one-liner. |
| 2026-08-05 | SoT grow: `DeskRailChromeRow.actions` + `PaneHeaderActionBarAction.dividerBefore`; History topics on **one** chrome row inside the push inspector only — Band 3 stays park/reopen; scroll-spy active Display. |
| 2026-08-05 | **Supersedes non-goal §5 #4 / §2 rule 4:** View group added — Band 3 sheet icons (Drill · Compare · Paint · Staff · week · ▦ · KPI) move into the inspector View cluster. Band 3 = find + park/reopen (+ View-only shell open). |
