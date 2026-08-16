# Research briefing — PO-line **condition multi-road** → industry WMS inline grade instrument

**For:** Gemini Deep Research / Gemini Pro — **you have read access to this repository.** Paths below are pointers; open the real files.  
**From:** Cycle Forge engineering  
**Date:** 2026-08-10  
**Repo tip at authoring:** `aa4f3771f` — **verify live files; lines may have moved.**  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only — never frame the product as a shop-internal tool.

**Companion visual (operator evidence — middle bar only):**  
`~/.cursor/projects/Users-icecube-repos-cycleforge-app/assets/Screenshot_2026-08-10_at_18.34.03-bcef0ee1-1094-4544-bfc2-40b74b54ed95.png`

> **What we want back is a RULING that Claude Code can execute**, not a mood board. Every recommendation must map to a **named house SoT principle**, a **concrete upgrade to house code + house rules**, and a **pass/fail acceptance criterion**. Where industry practice conflicts with Kinetic Ledger / Unbox golden law, **pick a side and defend it**.

---

## Locked product ask (do not soften)

Operator dogfood on `/unbox` carton centre (2026-08-10 ~18:34 local), **PO line item middle strip only**:

| Observed (screenshot) | What it is in code today |
|---|---|
| Full-width 7-cell grade bar: Brand New · Like New · Refurbished · Used — A · **Used — B (solid blue)** · Used — C · For Parts | `ConditionPills` with `labelVariant="full"` + `layout="barDistribute"` inside `PoLineCaptureRow` |
| Idle cells = pale face + **per-grade ink**; active cell = **saturated fill + white** | `conditionPillClass` ← `CONDITION_GRADE_TONE` in `src/lib/condition-tone.ts` |
| Trailing mint ScanBarcode + blue Camera squares | Capture segments from `po-line-capture-chrome.ts` — **out of scope for this brief's visual redesign**, but keep their contract |
| Meta row above already shows Tags + `B` (grade chip) while the bar also shows Used — B active | Dual condition readout: `PoLineMetaGrid` chip **and** the multi-road — must be adjudicated, not ignored |

**Product ask (locked):** Upgrade **only the middle multi-road** so it fits **2024–2026 industry-standard design-system principles for warehouse / receiving / QC grade instruments**, by growing **house SoT rules + house SoT code** — not a page-local twin. The upgraded face must remain an **inline component** that an operator can **re-grade at any time via mouse** (never a progressive gate, never a modal, never “open editor then save”).

This brief is **not** asking to redesign Serial/Photos junction icons, the PO meta row, the dock Band-1 condition step, or to revive progressive disclosure.

---

## 0. How Gemini must work

### 0.1 Verify in the repo (mandatory)

Open every path in §2–§4 before asserting. Quote `file:line`. Mark inference `[UNVERIFIED]`. If a line moved since tip SHA, say so.

### 0.2 Search the web (mandatory for D1 + D2)

Industry 2024–2026 on **inline discrete-choice / segmented / radio-group grade pickers** in ops UIs — especially **warehouse RF / receiving / returns / QC condition grading**:

| Class | Named systems / specs (start here; expand) |
|---|---|
| Design systems — segmented / toggle / choice | Shopify Polaris ChoiceList / ButtonGroup · IBM Carbon ContentSwitcher / Toggle · Fluent 2 segmented · Material 3 segmented buttons · Adobe Spectrum ButtonGroup · Atlassian Button group · GitHub Primer ButtonGroup |
| Dense ops / inventory grade UX | SAP Fiori / EWM RF condition & quality inspection · Manhattan Active WM · Blue Yonder · Oracle WMS Cloud · Returns-management grade pickers (Refundid / Happy Returns style UX papers if primary) |
| Interaction / Fitts / floor monitors | NN/g radio vs dropdown · Fitts’s law for adjacent targets · ISO 9241-110 · WCAG 2.2 contrast (esp. colored idle ink on white) · WAI-ARIA APG **Radio Group** + **Toolbar** patterns |
| Inline edit grammar | Linear · Stripe Dashboard · Carbon inline edit · Polaris inline editing — **when a value is edited in place vs opened in a sheet** |

Cite primary docs. Transfer **standing desk + wedge** constraints: mouse is the **go-back / correction** locus on the PO line; wedge/dock is primary procedure (already dual-loci law — do not invert again).

### 0.3 Two questions (answer separately — never fuse)

1. **Industry DS principles:** What exact named principles must a **flush multi-road grade instrument** on a warehouse receiving bench satisfy in 2026 (selection model, contrast, density, commit grammar, a11y, token discipline)?
2. **House upgrade path:** How exactly should Cycle Forge **grow** `conditions.ts` · `condition-tone.ts` · `ConditionPills` · `po-line-capture-chrome.ts` · SoT prose (`source-of-truth.md` · `display/unbox-station.md` · `ui-design-system.md`) so the Unbox centre multi-road becomes that industry-grade **inline anytime-mouse** component — without forking a second picker?

### 0.4 Deliverables (keep as separate numbered sections)

| # | Deliverable |
|---|---|
| **D1** | **DS principles catalog (2026)** — taxonomy for **inline discrete grade / segmented radio** instruments on WMS floors. Columns: Principle · One-sentence rule · Industry peer (cite) · When ops SaaS may deviate · Kinetic Ledger collision risk |
| **D2** | **Codebase autopsy of the middle multi-road** — map every D1 principle onto live `ConditionPills` `barDistribute` + `PoLineCaptureRow` + tone/label SoT. Verdict per principle: `PASS` / `PARTIAL` / `FAIL` / `N/A (defended deviation)` with `file:line` evidence. Explicitly score: always-mouse-editable · flush vs soft · contrast of idle grade inks · selected vs unselected grammar · clear-on-reclick · dual readout with meta Tags+B · a11y `radiogroup` · Fitts target size · token vs raw hue debt |
| **D3** | **Interaction contract — “inline anytime mouse grade”** — exact state machine in ASCII: rest · hover · press · commit · re-click clear · keyboard/wedge co-existence · disabled/locked after ship. State is **readout + immediate write**, never a gate. Name what MUST NOT return (progressive collapse, confirm ✓, modal grade sheet, SelectField dropdown as the Unbox centre face) |
| **D4** | **Visual / token upgrade ruling** — decide: keep per-grade idle ink rainbow · OR idle-neutral + active-only hue · OR badge+road dual plane · OR industry ContentSwitcher monochrome. Defend against WCAG + Kinetic Ledger “facts drive chrome.” Paste proposed `CONDITION_GRADE_TONE` / `conditionPillClass` deltas (conceptual, not full CSS dump) |
| **D5** | **SoT growth map (rules)** — ordered patches to house **rules** only: `AGENTS.md` one-liner (if earned) · `source-of-truth.md` (Station PO line / Unbox centre / Condition SoT rows) · `display/unbox-station.md` (capture trio face) · `ui-design-system.md` / `kinetic-ledger.md` if a new named instrument appears. Prefer growing named SoT over page prose |
| **D6** | **House code growth map** — deletion-ordered P0→P2 patches with owners: `ConditionPills.tsx` · `condition-tone.ts` · `conditions.ts` · `po-line-capture-chrome.ts` · `PoLineCaptureRow.tsx` · consumers that must keep parity (`ConditionDockControl` / dock grade bar · `TestingStatusPills` · `InlinePillPicker` — **compose or explicitly diverge with reason**). Ban a page-local `PoLineConditionBar.tsx` twin unless you prove `ConditionPills` cannot grow |
| **D7** | **DONE acceptance** — screenshot + bench checklist Claude Code pastes into the PR body (no soft language). Must include: mouse re-grade without opening Displays · active grade always legible · Serial/Photos segments untouched · dock wedge still grades · `npm run verify` green · no ratchet raise |
| **D8** | **Guard flip list** — extend `po-line-capture-entry.guard.test.ts` · `units-explosion.guard.test.ts` · `border-seam.guard.test.ts` / carton density guards as needed. New asserts for the ruled contract (e.g. no `collapsible` on capture face · anytime `onChange` · no confirm check · optional persistent badge if D4 requires it) |
| **D9** | **Claude Code P0 prompt** ≤40 lines — attach `:3050`, measure the screenshot bar first, grow SoT modules first, never start/kill the dev server, then `npm run verify` |
| **D10** | **Out-of-scope / Ask-first** — Serial/Photos redesign · progressive stage revival · replacing dock locus · marketplace condition ingestion schema · printing ZPL grade strings · raising DS baselines · forking AG Grid / third-party segmented libraries as the product SoT |

### 0.5 Paste prompt (give this entire file to Gemini)

```
Read docs/todo/po-line-condition-multi-road-inline-GEMINI-RESEARCH-BRIEFING.md end-to-end.
Open every cited repo path. Deliver D1–D10 as separate sections.
Priority: (1) industry DS principles for a WMS inline grade multi-road,
(2) autopsy of ConditionPills barDistribute on PoLineCaptureRow,
(3) exact SoT rules + house code growth so the middle bar is an anytime-mouse
inline instrument — never a second design language, never progressive gating.
Quote file:line. Mark [UNVERIFIED]. Industry citations required for D1–D2.
End with the ≤40-line Claude Code P0 prompt (D9).
```

---

## 1. Product + design-system frame (non-negotiable)

### 1.1 Kinetic Ledger — five laws

Source: [`.claude/rules/kinetic-ledger.md`](../../.claude/rules/kinetic-ledger.md)

1. Facts and state drive chrome — chrome never invents a second story.
2. Archetypes are region contracts (I/O + persistence), not layout skins.
3. Data shape chooses the primary surface.
4. Presentation kinds resolve via SoT — views stay dumb.
5. Compose named shells / blocks; grow the SoT when wrong; compound every UI task.

**Always ban:** random card soup · soft pill bands on ops chrome · a second visual language for the same grade · progressive hide that shifts muscle memory on a bench row.

### 1.2 Region + dual loci (already decided — cite, do not reopen)

Sources:

- [`.claude/rules/display/unbox-station.md`](../../.claude/rules/display/unbox-station.md) → Centre dual loci · Capture trio  
- [`docs/todo/unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md`](./unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md) (historical — dock became procedure waist)  
- [`docs/todo/po-line-capture-entry-ONE-WRAPPER-SIMPLIFY-HANDOFF.md`](./po-line-capture-entry-ONE-WRAPPER-SIMPLIFY-HANDOFF.md) (**progressive disclosure retired**)

| Locus | Job for **condition** | Home |
|---|---|---|
| **Dock / wedge** | Primary procedure grade (Band 1 `ConditionDockControl`, wedge accepts grade codes) | Floor instrument |
| **Middle multi-road** | **Mouse go-back / anytime correction** — same write path, flush full-name bar | `PoLineCaptureRow` → `ConditionPills` |

Ruling already locked: the middle face is **not** the wedge. It must stay mouse-reachable and **always** gradeable. This brief upgrades **how that mouse instrument looks and commits**, not whether it exists.

### 1.3 Condition data SoT (already exists — grow, do not fork)

| Concern | Module |
|---|---|
| Grade codes + label variants (`pill` / `table` / `compact` / `label` / `full` / `option`) | [`src/lib/conditions.ts`](../../src/lib/conditions.ts) |
| Grade → tone (active / inactive / badge / text / chip / dot) + `conditionPillClass` densities | [`src/lib/condition-tone.ts`](../../src/lib/condition-tone.ts) |
| Expanded picker UI (`scroll` \| `barDistribute`, collapsible Tags square, readOnly lock) | [`src/components/receiving/workspace/ConditionPills.tsx`](../../src/components/receiving/workspace/ConditionPills.tsx) |
| Unbox capture row chrome (row height, condition flex-1 cell, Serial/Photos segments) | [`src/components/receiving/workspace/po-line-capture-chrome.ts`](../../src/components/receiving/workspace/po-line-capture-chrome.ts) |
| Mount site (invariant row) | [`src/components/receiving/workspace/line-edit/PoLineCaptureRow.tsx`](../../src/components/receiving/workspace/line-edit/PoLineCaptureRow.tsx) |
| Gate | [`src/components/receiving/workspace/line-receive-mode.ts`](../../src/components/receiving/workspace/line-receive-mode.ts) `resolveCaptureEntry` |
| Guards | [`po-line-capture-entry.guard.test.ts`](../../src/components/receiving/workspace/po-line-capture-entry.guard.test.ts) · [`units-explosion.guard.test.ts`](../../src/components/receiving/workspace/units-explosion.guard.test.ts) |

Hard law (`AGENTS.md` / `source-of-truth.md`): **one module per concern** — never re-inline a grade→label or grade→hue map in a view.

### 1.4 Sibling instruments (compose or diverge with reason — never silent fork)

| Sibling | Job | Relationship to condition multi-road |
|---|---|---|
| `InlinePillPicker` | Carton identity classify (urgency · platform · type) — collapse ↔ expand | Same flush abut grammar; **not** a 7-grade inventory taxonomy |
| `TestingStatusPills` | Testing verdict strip | Same confirm-by-pick / no trailing ✓ grammar |
| Dock `ConditionDockControl` | Procedure Band 1 grade | **Must stay tone/label-parity** with the centre multi-road |
| Meta `ConditionGradeChip` / Tags+letter on `PoLineMetaGrid` | Dense readout above the road | D2 must rule duplication vs persistent badge handoff |

Related open handoff (do not redo extract; **do** reconcile badge ruling with this brief’s D4):  
[`docs/todo/po-line-capture-row-EXTRACT-AND-BADGE-HANDOFF.md`](./po-line-capture-row-EXTRACT-AND-BADGE-HANDOFF.md) — Job 1 extract is largely landed (`PoLineCaptureRow` exists); Job 2 persistent badge may still be open vs screenshot (full road, no leading badge cell).

---

## 2. Current implementation — measured (middle bar)

### 2.1 Composition (ASCII from live code + screenshot)

```
┌ PoLineRow ─────────────────────────────────────────────────────────────┐
│ [thumb]  meta: 0/1 · SKU · Tags B · serials — · $299.50                 │
│ ┌ data-capture-row / PO_LINE_CAPTURE_ROW_CLASS (h-11, divide-x, flush) ┐ │
│ │ ┌ ConditionPills barDistribute (flex-1) ──────────────┐┌serial┐┌photo┐│ │
│ │ │ Brand New│Like New│Refurb│Used—A│Used—B│Used—C│Parts ││ ⛓   ││ 📷  ││ │
│ │ │ idle hue │ …      │ …    │ …    │ ACTIVE │ …  │ …    ││green ││blue ││ │
│ │ └─────────────────────────────────────────────────────┘└──────┘└─────┘│ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ Bose Wave Music System - Multi-CD Changer White                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Scope of this brief = the `ConditionPills` flex-1 multi-road only.** Serial/Photos stay as locked peers for Fitts / chrome rhythm context.

### 2.2 Mount contract (`PoLineCaptureRow`)

Live behaviour to verify in tip SHA:

- Always mounts `ConditionPills` with `labelVariant="full"` + `layout="barDistribute"` — **never** `collapsible` on this face (guarded).
- `onConditionChange` fires on pill click; re-click active clears (`onChange("")`) — Units/editing grammar from `ConditionPills`.
- Segments open Displays; **condition edits inline** (does not open a sheet to change grade).
- Row height `h-11` shared with dock Band 1 rhythm (`po-line-capture-chrome.ts`).

### 2.3 Visual / token facts to autopsy

From `CONDITION_GRADE_TONE` + `conditionPillClass(..., 'barDistribute')`:

- Active: saturated `bg-*` + `text-white` + `ring-*` + `relative z-raised`.
- Inactive: `bg-surface-card` + **per-grade colored text** + pale `ring-*` + hover wash.
- Seam: parent `[&>*+*]:-ml-px` collapses double inset rings (same mechanic as `STATION_IDENTITY_GROUP_CLASS`).
- Density `barDistribute`: `flex-1`, `p-0`, `text-role-caption`, **no** uppercase tracking (full names).
- Press feedback: `active:scale-[0.98]` (motion debt vs Kinetic Ledger — score it).

### 2.4 Operator complaint this brief exists to solve

Not “the bar is missing.” The ask is **industrialisation**:

1. Does this multi-road match **industry WMS / DS segmented-control principles** (contrast, selection clarity, target size, commit grammar, reduced cognitive load under warehouse lighting)?
2. Is the house SoT (rules + `ConditionPills` / tone modules) the **named instrument** for “inline anytime mouse grade,” or is it still a **receiving-only pill strip** wearing Unbox full labels?
3. How do we upgrade SoT so every future station/desk grade face **compounds** from the same upgraded instrument?

---

## 3. Locked / closed forever (do not recommend unless Ask-first)

| Closed | Why |
|---|---|
| Progressive Condition → Serial → Photos stage machine | Retired; handoff + guards |
| Confirm ✓ / emerald check on the capture row | Explicitly deleted; “ops chrome tells truth, does not gate” |
| Collapsible Tags-square as the Unbox **centre** capture face | Capture face stays always-expanded road (SerialCard / Units may still use collapsible elsewhere) |
| Modal / sheet / SelectField as the primary Unbox centre grade UI | Violates dual-loci + anytime mouse; Select is desk density, not floor instrument |
| Third condition writer path | Dock + row share controller writes — “no third path” (`unbox-station.md`) |
| Soft `rounded-full` / pill-band reskin of the multi-road | Ops chrome flush law |
| Raising DS / knip baselines to pass | Verify law |
| Replacing house tone/label SoT with a third-party segmented package as the product API | Pattern evolution grows SoT; libraries may inform, not become the grade taxonomy |

---

## 4. Research axes Gemini must cover (minimum)

### A. Selection model

- Radio-group (single grade) vs multi-select (never for condition).
- Clear-to-empty on re-click: industry standard for QC override, or anti-pattern on a floor where empty grade is illegal?
- Immediate commit vs explicit Apply (BulkQuantityPanel has Apply for qty — condition here is instant).

### B. Visual encoding

- **Color-as-identity** (every idle cell keeps its hue) vs **color-as-selection** (idle neutral, active carries meaning) — which dominates 2026 WMS DS, and which survives warehouse lighting / deuteranopia?
- Full names vs abbreviated codes at `h-11` across 7 cells on a ~720px station middle (`STATION_PUSH_CENTER_FLOOR_PX`) — Fitts + truncation risk.
- Leading persistent badge + road (Job 2 handoff) vs road-only (screenshot) vs collapsed+expand (`InlinePillPicker` grammar) — pick **one** Unbox centre contract.

### C. Inline edit altitude

Industry “inline edit” usually means: click value → field → blur/Enter commits.  
This multi-road is **stronger**: every option is already a commit target. Name the pattern (segmented radio / content switcher / choice strip) and state whether Cycle Forge should document it as a **named house instrument** (e.g. `GradeRoad` / grow `ConditionPills`) in SoT.

### D. Dual loci + dual readout

Meta Tags+`B` above the active Used — B cell: industry prefers **one authoritative face** or **badge + expandable road**? Reconcile with Spatial predictability law (fixed milestone boxes stay mounted).

### E. A11y + wedge co-existence

- `role="radiogroup"` / `role="radio"` already present — enough?
- Arrow-key grade change on the road while dock owns wedge focus — required or harmful?
- Screen-reader name: full label + description tooltip (`conditionDescription`) — industry minimum.

### F. Governance

How mature products keep **one grade taxonomy** across RF gun UI, desktop bench, print label, and grid chip — mapped to our `conditions.ts` variants. What upgrades prevent label/tone drift when the multi-road visual language changes?

---

## 5. Acceptance shape (preview — Gemini finalizes in D7)

Claude Code will treat the research as done only if the ruling enables a PR that can claim:

1. **Mouse:** From rest, one click on any other grade re-grades the unit; one re-click clears (or ruled alternative) — no Displays open, no confirm step.
2. **Always legible:** Current grade is unambiguous at arm’s length on a floor monitor (ruling defines how: active fill, badge, or both).
3. **SoT:** Label + tone still resolve only from `conditions.ts` / `condition-tone.ts`; Unbox centre does not invent a twin map.
4. **Parity:** Dock condition Band 1 and centre multi-road stay the same grades / tones / commit grammar.
5. **Guards + `npm run verify`:** green; baselines not raised.
6. **Screenshot delta:** middle multi-road only — Serial/Photos geometry unchanged unless D4 proves a one-token chrome change is required for Fitts.

---

## 6. Related briefs / handoffs — cite, do not redo

| Doc | Already owns |
|---|---|
| `po-line-capture-entry-ONE-WRAPPER-SIMPLIFY-HANDOFF.md` | Always-accessible row; progressive deleted; condition owns remaining width |
| `po-line-capture-row-EXTRACT-AND-BADGE-HANDOFF.md` | Extract `PoLineCaptureRow`; optional persistent badge Job 2 |
| `unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md` | Dock = procedure waist; middle = display + mouse escape |
| `unbox-dock-two-band-floor-GEMINI-RESEARCH-BRIEFING.md` / flush-floor briefs | Floor segment geometry |
| `chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md` | DS governance altitude |
| `workbench-table-ds-principles-2026-GEMINI-RESEARCH-BRIEFING.md` | Broader 2026 DS method (tables) — reuse method, not conclusions |

Your job is the **condition multi-road instrument bar** — industry principles → house SoT growth → executable upgrade.

---

## 7. Files Gemini must open (checklist)

```
.claude/rules/kinetic-ledger.md
.claude/rules/source-of-truth.md          # Condition rows + Station PO line + Unbox centre
.claude/rules/display/unbox-station.md
.claude/rules/ui-design-system.md
.claude/rules/pattern-evolution.md
AGENTS.md                                 # Unbox centre / capture trio one-liners
src/lib/conditions.ts
src/lib/condition-tone.ts
src/components/receiving/workspace/ConditionPills.tsx
src/components/receiving/workspace/po-line-capture-chrome.ts
src/components/receiving/workspace/line-edit/PoLineCaptureRow.tsx
src/components/receiving/workspace/line-edit/PoLineUnitCaptureList.tsx
src/components/receiving/workspace/line-edit/ActiveLineConditionSerial.tsx
src/components/receiving/workspace/line-edit/InlinePillPicker.tsx
src/components/receiving/workspace/TestingStatusPills.tsx
src/components/receiving/workspace/po-line-capture-entry.guard.test.ts
src/components/receiving/workspace/units-explosion.guard.test.ts
docs/todo/po-line-capture-entry-ONE-WRAPPER-SIMPLIFY-HANDOFF.md
docs/todo/po-line-capture-row-EXTRACT-AND-BADGE-HANDOFF.md
```

Also locate dock condition control (search `ConditionDockControl` / `barDistribute` under `line-edit/steps/dock/`) and quote its mount of `ConditionPills` for parity.

---

## 8. Out of scope reminder

Do not redesign the PO meta chip row, product title, thumb, Serial/Photos icons, dock geometry, Displays Units explosion, or BulkQuantityPanel Apply flow — except where D2 proves the multi-road’s industry gap is **caused** by a chrome token shared with those peers (then change the token once in `po-line-capture-chrome.ts` / `condition-tone.ts`).
