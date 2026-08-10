# Research briefing — Desk **Show inspector**: View display grammar (icons → rows?) + exact data-table editing altitude

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers; open the real files. Do not invent modules or claim behaviors you did not verify.
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** For a dense B2B **warehouse / fulfillment ops SaaS**, what is the **2024–2026 industry-standard** anatomy of **sheet / spreadsheet layout chrome** that lives inside a desk **Show inspector** right rail — specifically: (A) should **View** controls (paint · drill · compare · zoom · **column display ▦**) stay **icon-only**, upgrade to **labeled index rows** (same grammar as record Display topics), or split; and (B) where does **exact data-table editing** (column visibility · highlight · width · density · compare layout) live relative to **record Display** (facts) and **record Edit** (mutate / delete / open-station)?
**Status:** OPEN — research to **rewrite / grow** the desk Show-inspector **View** contract and the table-edit altitude map. Not an implementation plan.
**Primary surfaces (empirical dogfood):**
1. Unbox **History / sheet tabs** — Band 3 **Show inspector** → `HistoryCartonTriagePanel` (`detail:history`) + View-only shell; View cluster = `HistoryViewTopicsCluster` (icons today).
2. To-ship **Orders** desk — Band 3 **Show inspector** → selected `detail:order` **or** View-only `detail:orders-view` (`OrdersViewControlsRail`); View cluster = `OrdersViewTopicsCluster` (icons today).
3. Column editor leaf — `GridColumnGutter` → `GridColumnDetailsPanel` (`detail:grid-column-details`) opened from the ▦ portal host.

**Operator complaint (verbatim job):** The Show-inspector path for **table display / column editing** is **icons only** and feels under-specified next to the upgraded record plane (Display topics are already **rows**; Edit is already a **sticky floor**). How should View / column editing be **situated** so the right rail reads as one coherent 2026 desk instrument — without breaking Band-3 find-only, without merging Station Displays, and without inventing a third edit system?

---

## 0. Method — read before answering

### 0.1 Your job (five deliverables — keep separate)

1. **Industry pattern survey (2024–2026).** How do mature B2B ops / WMS admin / spreadsheet-hybrid / helpdesk products place **table layout chrome** (columns · density · compare · paint/highlight · zoom) when the product also has a **selected-row side inspector**? Name products. Cite primary sources. State the dominant pattern for: icon toolbar vs labeled rows vs separate “View / Fields” panel vs table-proximal bar.
2. **Three-plane altitude map (mandatory).** Produce a Share / altitude table for every verb class in §0.3 across **Display · Edit · View** — the house already uses these three names; industry may use synonyms (Inspect · Act · Arrange / Layout / Fields). For each verb: **where it lives** · **face grammar** (icon · labeled row · floor CTA · panel leaf · never) · **when it appears** (n=0 View-only · n=1 · n≥2) · **what must not co-locate**.
3. **Candidate View anatomies scored.** Score **all** candidates in §0.4 against this product shape (~1080p desk, hours-long triage, Band-3 find-only, one right-edge slot shared with AI, wedge-adjacent sibling stations). Pick a default. State runner-up win conditions.
4. **Constitution rewrite pack.** Exact design principles this product should adopt for **Show-inspector View + table edit**, each with: principle name · one-sentence rule · who ships it · acceptance check on History **and** To-ship with n=0 / n=1. These principles will **update** `.claude/rules/source-of-truth.md` + `display/right-rail-inspector.md` + `display/workbench-ops-queue.md` — write them so an engineer can falsify them in guards.
5. **Gaps vs measured current state (§2) + SoT growth sketch.** What to keep · what to cut · what to grow in **named SoT modules** (never page-local twins). Call out History↔Orders asymmetry (View on same rail vs separate `detail:orders-view`).

### 0.2 Hard framing — house laws are **load-bearing constraints**, not optional taste

Unlike some sibling briefs that ask you to ignore internal constitution: **this brief requires you to verify and respect** the hard laws in §1. Industry may recommend something that violates a law — if so, either (a) **defend a house deviation** with win conditions, or (b) **propose an explicit Ask-first law change** with blast radius. Do **not** silently recommend reopening a guarded golden.

Prior briefs failed when paths were inferred. Rules:

- Every path you name must be one you opened. Mark guesses `[UNVERIFIED]`.
- Load-bearing claims need a quote: symbol, type field, or line.
- Prefer reading SoT + guards over re-deriving from component names.
- If a sibling brief already ruled something, **cite and extend** — do not re-litigate (see §0.5).

### 0.3 Verb classes you must place (minimum)

Every row needs an altitude + **face-grammar** ruling. Add rows only with evidence.

| Plane | Verb class | Examples on these desks |
|---|---|---|
| **Display** (record) | Navigate topics · read facts · copy ids | Details · Logistics · Evidence · History leaves; `OrderFactRow` / chips |
| **Edit** (record) | Mutate · hand off · destroy | Print · Open in Unbox · Resolve Unfound · Delete carton / order; floor CTAs |
| **View** (sheet) | Arrange the **table**, not the record | Paint rows · Drill/List · Compare panes · Spreadsheet zoom · **Column display ▦** |
| **Table edit (exact)** | Durable column prefs | Visibility · highlight wash · cell chip · width min/max · Reset to default (`GridColumnDetailsPanel`) |
| **Chrome / park** | Open/park the rail | Band 3 **Show / Hide inspector** · chrome `→|` · View-only shell when n=0 |
| **Never here** | Wrong plane | Station Displays tools · Band-3 refine icon rows on find-only desks · AI dual column |

### 0.4 Candidate View anatomies (score all)

| ID | Candidate | One-line |
|---|---|---|
| **V1** | **Keep icon toolbar** | Status quo: `*ViewTopicsCluster` = `flex` icon row; ▦ portals into a `contents` host |
| **V2** | **Upgrade View to labeled index rows** | Same `DeskInspectorIndexShell` / `DisplayIndexRow` grammar as record Display — View topics become rows that drill to leaves (or expand inline) |
| **V3** | **Hybrid: Column display becomes a row; others stay icons** | Promote only ▦ / “Columns” into the index or a permanent labeled row; paint/drill/compare/zoom stay icon cluster |
| **V4** | **Always-separate View rail (Orders golden everywhere)** | n=0 and n=1 both put sheet chrome on `detail:*-view`; selected-record peeks never host View icons |
| **V5** | **Return sheet chrome to Band 3 / table-proximal bar** | Reverse find-only: ▦ + refine icons beside find again (or a Sheets-like bar above the grid) |
| **V6** | **View = accordion of labeled control rows (not index→leaf)** | Dense instrument list: each View topic is a full-width row with the control inline (switch / segmented / portal), no second leaf navigation |

Score 1–5 on: **Job clarity** · **Triage speed** · **Discoverability of column edit** · **Cognitive consistency with Display rows + Edit floor** · **Sellable density** · **Coordination cost** (History↔Orders↔Incoming↔guards).  
**ROI ≈ (Job clarity × Triage speed × Discoverability × Sellable density × Cognitive consistency) / (6 − Coordination cost).** Rank V1–V6.

### 0.5 Related briefs — cite, do not redo

| Brief | Already owns |
|---|---|
| `history-inspector-ds-and-table-actions-GEMINI-RESEARCH-BRIEFING.md` | Record peek anatomy + delete/copy/export altitude (H3 winner; floor shipped) — **do not re-score Delete** |
| `history-inspector-action-floor-and-keybinds-PLAN.md` | Shipped Phases 0–2; notes View-cluster move is **ask-first** vs Band-3 find-only |
| `scan-vs-desk-right-rail-separation-GEMINI-RESEARCH-BRIEFING.md` | **C2 thin waist** closed — Station Displays ≠ desk inspector hosts |
| `right-rail-ds-principles-2026-GEMINI-RESEARCH-BRIEFING.md` | Broad right-edge DS catalog — narrow to **View face grammar** |
| `table-action-bar-fields-GEMINI-RESEARCH-BRIEFING.md` | Fields altitude vs page chrome — **ratified**; do not invent `TableActionBar` |
| `table-display-sot-GEMINI-RESEARCH-BRIEFING.md` | Column align / zebra / editability on the column model |
| `grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md` | In-grid actions portfolio |
| `workbench-table-ds-principles-2026-GEMINI-RESEARCH-BRIEFING.md` | Workbench table DS bar |
| `band3-find-only-inspector-SOT-FINISH-HANDOFF.md` | Find-only Band 3 + View cluster golden — **do not casually reverse** |
| `history-inspector-topic-icons-HANDOFF.md` | Historical icon-topic pass; View group added later — status log shows Display moved toward tabs/rows |

Your unique job: **Show-inspector View face grammar (icons vs rows) + exact table-edit situating**, under industry standards **and** the hard house laws in §1.

### 0.6 Closed forever for *this research* (do not recommend unless Ask-first with strong evidence)

- Mounting **Station Displays** (`StationDisplaysPushStack`) as a `RightRailHost` occupant, or renaming View “Displays”
- Dual permanent right columns (AI + inspector + column panel) without an occupancy / yield ruling
- A second column-visibility system beside `useGridFields` / `GridColumnDetailsPanel`
- Foreign grids (AG Grid / MUI DataGrid / Handsontable) as the table shell
- Soft pill / marketing chrome as the ops default
- Raising DS ratchet baselines to “pass”
- Bare-digit View hotkeys on wedge-adjacent Unbox (nav-keys / wedge law)
- Labelled **record** CTA strips under identity (already killed; Edit gravity is the floor)

You **may** recommend phased V1→V2/V3/V6 and a History↔Orders convergence plan — label horizon vs next sprint.

---

## 1. Product + hard house laws (verify in tree)

**Cycle Forge** = multi-tenant reseller-ops SaaS (sellable product; USAV = dogfood tenant only). Frame as warehouse/fulfillment desk software.

| Concern | Path |
|---|---|
| Portable hard laws | `AGENTS.md` |
| SoT index | `.claude/rules/source-of-truth.md` → **Displays vs inspector** · **Find-only Band 3** · **Right-rail modality** · **Grid column visibility** · **Host vs content pad** |
| Desk inspector recipe | `.claude/rules/display/right-rail-inspector.md` |
| Ops-queue desk recipe | `.claude/rules/display/workbench-ops-queue.md` → Column display · three-band · View topics |
| Pattern evolution | `.claude/rules/pattern-evolution.md` — compose SoT first; grow when wrong; never page-local twin |
| Kinetic Ledger | `.claude/rules/kinetic-ledger.md` |

### 1.1 Operator nouns (never unify)

| Noun | Region | Opens | Operator copy |
|---|---|---|---|
| **Displays** (plural) | Station scan | `StationDisplaysPushStack` | **Open displays** / Hide right panel |
| **Inspector** | Desk / History table | `RightRailHost` peek | Band 3 **Show / Hide inspector** |
| **Display topic** (singular) | Inside inspector | Index leaf (Details · …) | Topic name — **≠** Station Displays |
| **View** | Sheet layout chrome | View strip / `detail:orders-view` | View toggle / View-only shell |
| **Column display** | Grid prefs | `▦` → `GridColumnDetailsPanel` | “Column display” |

Chord split: Station Displays = **⌘/Ctrl+]**; desk inspector park = **⌘\\** + bare **]**. Band 3 owns Show/Hide on find-only desks.

### 1.2 Hard laws that bound View + table edit (one-liners)

1. **Open displays ≠ Show inspector** — different hosts, dismiss chords, AI occupancy (`source-of-truth.md` → Displays vs inspector). Guarded.
2. **Find-only Band 3 (Unbox History golden; To-ship twin)** — Band 3 = flex-1 find (+ in-field refine) + KPI collapse where owned + far-right Show/Hide inspector. **Sheet refine / layout / ▦ live on the pushing inspector View cluster** — never a Band 3 refine icon row. Guard: `band3-find-only.guard.test.ts`.
3. **C2 thin waist** — desk inspectors share `DisplaysIndexLeafStage` presentational waist with Station; **never** mount the push stack on `RightRailHost`.
4. **Record Display = rows** — `DeskInspectorIndexShell` → index→leaf (`history-inspector-topics.ts` / `order-inspector-topics.ts`). Never `PaneHeaderTabs` / `SectionTabsSlider density="icon"` as primary topic nav on desk peeks.
5. **Record Edit = sticky floor (History + Orders leaf)** — `InspectorActionFloor` + flush trailing Delete; primary CTAs on the floor’s dominant side; chrome row stays navigation-only (`→|` · ↑↓). History n=1 floor shipped 2026-08-09.
6. **Column display belongs to the grid** — sole editor = `GridColumnGutter` → `GridColumnDetailsPanel` (`detail:grid-column-details`). Prefs via `staff_preferences.tableColumns[tableId]`. No `GridFieldsMenu`, no `WorkbenchTrailingCluster.fields` slot.
7. **▦ portal hosts** — house-wide portal-only; **Unbox History + To-ship exception:** portal into inspector View controls host; other desks with Band-3 still portal into triage `controlsSlotRef`. Publishing a non-null portal target while the View strip is hidden/parked **swallows ▦** (must publish `null` so fallback / honest absence works) — load-bearing in `HistoryViewTopicsCluster`.
8. **One right-edge slot** — detail priority 100 > assistant 10; recommendations must not require permanent dual-right layout.
9. **Compose → grow SoT → compound** — grow `DeskInspectorIndexShell` / View cluster / `GridColumnDetailsPanel`; never invent `HistoryViewIconBar` / `OrdersViewRows` page twins for the same job.
10. **Ops chrome flush-square** — `cornerClass('flush')`; no soft pill bands for ops View chrome.
11. **Wedge-safe keys** — no bare digits as jump targets on Unbox family; leader-armed nav-keys (`⌘;`) for region jumps.

### 1.3 Asymmetry you must reconcile (not paper over)

| Surface | Record peek id | Where View lives today | Notes |
|---|---|---|---|
| **History / Unbox sheets** | `detail:history` | **Same rail** — View toggle expands `HistoryViewTopicsCluster`; View-only shell when n=0 | Record Display rows + Edit floor + View icons share one card |
| **To-ship Orders** | `detail:order` | **Separate rail** — `detail:orders-view` (`OrdersViewControlsRail`) owns View; selected-order must **never** remount `OrdersViewTopicsCluster` (guarded) | Cleaner separation; Band 3 Show inspector can open View-only with no row |

`display/right-rail-inspector.md` states the Orders split explicitly. Some older prose in `workbench-ops-queue.md` still mentions View on `detail:order` — **re-verify and treat the guard + `OrdersViewControlsRail` header comment as authority** if they conflict.

---

## 2. Measured current anatomy (verify 2026-08-09)

Treat as ground truth. Do not invent chrome.

### 2a. Three planes inside Show inspector (History golden — the painful one)

Implementation: `src/components/receiving/history/HistoryCartonTriagePanel.tsx`.

```text
┌─ DeskRailChromeRow ─────────────────────────────────────────┐
│ [→|] park ………………………………… [↑] [↓] queue walk (omit if viewOnly) │
├─────────────────────────────────────────────────────────────┤
│ View toggle  (forced open when viewOnly / n=0)              │
│ ┌─ HistoryViewTopicsCluster — ICONS ONLY (the gap) ───────┐ │
│ │ [paint] [drill] [compare] [zoom] [▦ portal host]        │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Slim identity key (n=1) — status + short PO/Carton          │
│ (no icon hero, no CTA row — Phase 1 shipped)                │
├─────────────────────────────────────────────────────────────┤
│ DeskInspectorIndexShell — RECORD DISPLAY = ROWS             │
│   Details · Logistics · Evidence · History  → leaves        │
├─────────────────────────────────────────────────────────────┤
│ InspectorActionFloor (n=1 only) — RECORD EDIT               │
│ [ Print / Open Unbox / … ] ………………… [ Delete icon ]          │
└─────────────────────────────────────────────────────────────┘
```

**Observed tension:** Display graduated to **rows**; Edit graduated to **floor**; View remains **icon soup**. Column editing (exact table edit) is one icon among peers, then jumps to a **second** rail occupant (`detail:grid-column-details`) — occupancy / back-stack semantics matter.

### 2b. View cluster implementation (icons)

| Module | Role |
|---|---|
| `HistoryViewTopicsCluster.tsx` | Composes paint · drill · compare · zoom · ▦ portal `div.contents` |
| `OrdersViewTopicsCluster.tsx` | Same icon grammar + filters · sort · staff · KPI (To-ship) |
| `history-inspector-topics.ts` → `VIEW_TOPICS` | Locked order: paint · drill · compare · zoom · columns |
| `history-view-chrome-context.tsx` | Bridge so grid can portal ▦ + zoom while panel is re-parented |
| `OrdersViewControlsRail.tsx` | View-only shell for To-ship (`detail:orders-view`) |

### 2c. Exact table editing (column display) — already a leaf panel

| Module | Role |
|---|---|
| `GridColumnGutter` / `GridColumnDetailsTrigger` | Sole ▦ entry; portals to host |
| `GridColumnDetailsPanel.tsx` | Push rail `detail:grid-column-details`: visibility · highlight · chip · widths · Reset |
| `useGridFields` / `useGridColumnDisplay` / `useGridColumnWidths` | Pref persistence |

**So the “rows vs icons” question is not “does column editing exist?”** — it does, as a full panel. The question is: **what face should open that panel / host the other View verbs**, so operators discover and trust them the way they trust Display rows and Edit floor.

### 2d. Record Display rows (the grammar View might clone)

| Module | Role |
|---|---|
| `DeskInspectorIndexShell.tsx` | Thin adapter over `DisplaysIndexLeafStage` |
| `StationDisplayIndexList.tsx` / `display-index.ts` | Labeled rows, tone chips, armed cursor — **navigation rows hold no nested controls** |
| `history-inspector-topics.ts` Display group | Details · Logistics · Evidence · History |

Row-anatomy law (Station index): the row is the control; it does not embed switches. If View becomes rows, industry + house must decide: **navigate-then-configure** (index→leaf with controls in leaf) vs **instrument rows** (V6 — controls inline) — those are different patterns.

### 2e. Operator-stated upgrades (product intent — not yet law)

1. Fix **Show inspector** so **table display** (what the spreadsheet shows) is as legible as record Display.
2. Fix **exact editing** for the data table (columns / layout) so it is not buried in icon-only chrome.
3. Decide whether View should **upgrade into rows** (or another face) and how that **fits the SoT** without forking.
4. Keep Band-3 find-only and Displays≠inspector intact unless Ask-first.

---

## 3. Research questions (answer all)

### Q1 — Dominant face for sheet-layout chrome beside a record inspector

In 2024–2026 B2B ops SaaS, when a queue has both **selected-row detail** and **column/layout tools**, what face does industry use for the layout tools: icon toolbar · labeled list · Fields side panel · table header menu · separate “View” mode? Cite ≥5 systems. When do **labeled rows** win over icons?

### Q2 — Icons → rows: when is the upgrade correct?

Under what conditions should an icon cluster become **index rows**? When is that a category error (confusing Arrange-the-table with Inspect-the-record)? How do products prevent mode errors when both live on one right edge?

### Q3 — Column display / Fields specifically

Should **▦ / Columns** be (a) peer icon, (b) first-class labeled row, (c) always-open section in View-only, or (d) only reachable from column headers? Reconcile with Carbon / Polaris / Airtable / Sheets / Linear without redoing the ratified “no TableActionBar / no Fields in page chrome” house ruling — give the **Show-inspector-specific** ruling.

### Q4 — Nested rail occupancy

Opening ▦ mounts `detail:grid-column-details` while `detail:history` or `detail:orders-view` may already own the slot. What is industry practice for **inspector → Fields panel → back**? Should Columns become an **in-card leaf** of the View index (same occupant) instead of a second detail id?

### Q5 — History vs Orders asymmetry

Should Cycle Forge **converge** on Orders’ separate `detail:*-view` rail, or on History’s same-rail View strip, or keep both with a documented predicate? Score against job clarity and guard cost.

### Q6 — Exact table editing vs in-cell editing vs record Edit

Separate three jobs that operators conflate:

| Job | Mutates | SoT today |
|---|---|---|
| **Sheet View** | How the queue is laid out (compare/drill/zoom/paint) | View cluster |
| **Column prefs** | Which columns / how painted | `GridColumnDetailsPanel` |
| **In-cell / record Edit** | Domain facts / lifecycle | Floor + leaves + station handoff; status via `transition()` only |

What face/altitude map keeps these three from collapsing into “edit the table”?

### Q7 — Constitution-ready principles

List **8–12** principles in portable vocabulary for Show-inspector View + table edit. Each must be falsifiable on History and To-ship (n=0 and n=1). Include at least one principle that decides **icons vs rows**.

---

## 4. Constraints that are product facts (not taste)

1. Operators work **~1080p–1440p**; History / To-ship sessions are **hours long**; queue must stay visible while arranging columns.
2. Multi-tenant sellable SaaS — column prefs are **per-staff**; never folklore per warehouse.
3. Unbox is scan-adjacent — View hotkeys must remain wedge-safe.
4. AI and detail share one right slot — View upgrades cannot require a fifth permanent column.
5. Band-3 find-only + View portal null-when-parked are **guarded goldens**; reversing them is Ask-first with blast radius across Unbox + To-ship.
6. Incoming and other desks may still portal ▦ into Band 3 — any universal View-rows recipe must state the **predicate** (find-only desks vs refine-row desks).

---

## 5. Deliverable format (mandatory)

```markdown
# Desk Show inspector View + table edit — industry research

## Executive verdict
Winner among V1–V6 · one paragraph · when to switch · History↔Orders convergence

## Score table
| Candidate | Job clarity | Triage speed | Discoverability | Cognitive consistency | Sellable density | Coordination cost | ROI |

## Industry survey
### Sheet-layout chrome faces beside record inspectors
### Column / Fields panel patterns
### Icons vs labeled rows — win conditions

## Three-plane altitude map (mandatory)
| Verb class | Plane | Altitude | Face grammar | Visible when | Must not co-locate | Citations |

## Answers to Q1–Q7
…

## Constitution rewrite pack
| # | Principle | Rule (1 sentence) | Who ships it | Acceptance (n=0) | Acceptance (n=1) | SoT file to update |

## Gaps vs measured current state (§2)
What to keep · what to cut · View face upgrade · ▦ occupancy · History↔Orders

## SoT growth sketch (compose first)
Named modules to grow · guards to extend · forbidden twins

## Ask-first
Only decisions not decidable from industry + §1–§4 (e.g. reverse Band-3 find-only)
```

---

## 6. Suggested SoT touchpoints if principles land (for the engineer — not for you to implement)

After your principles are accepted, an implementer would expect updates **only** where principles change law:

| File | Likely one-liner growth |
|---|---|
| `.claude/rules/display/right-rail-inspector.md` | View face grammar (icons / rows / hybrid) + Orders vs History View host predicate |
| `.claude/rules/display/workbench-ops-queue.md` | Column display entry face on find-only desks; fix any stale “View on detail:order” prose |
| `.claude/rules/source-of-truth.md` | Displays vs inspector table — clarify View ≠ Display topic ≠ Displays |
| `history-inspector-topics.ts` / Orders twin | If View becomes rows, descriptors gain row labels / leaf ids — still pure maps |
| Guards | `band3-find-only.guard.test.ts` · `history-carton-triage.guard.test.ts` · `shipped-order-inspector-topics.guard.test.ts` · sheet guards |

Do **not** invent a parallel `ViewIndexShell` if `DeskInspectorIndexShell` can host a View group — pattern evolution prefers growing the waist.

---

**End of briefing.** Prefer primary sources dated 2024–2026. Prefer named products over anonymous “best practice.” When industry splits, show both sides, then pick for §1’s find-only Show-inspector desks. Your principles will **update** house SoT for View + table edit — write them to stand alone and to be guard-testable.
