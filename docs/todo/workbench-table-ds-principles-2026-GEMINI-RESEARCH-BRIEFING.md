# Research briefing — 2026 industry-standard design-system principles for Workbench tables (History gate before fan-out)

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers; open the real files. Do not invent modules or claim behaviors you did not verify.
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** What **exact industry-standard design-system principles (2024–2026)** must a dense B2B ops spreadsheet / data table meet — and how should Cycle Forge **upgrade + test Unbox History** against that bar **before** porting the same table engine / custom-column recipe to other Workbench pages?
**Status:** OPEN — research + History audit gate. Not an implementation plan yet.
**Dogfood surface (only):** Unbox **History** — `ReceivingGridHost` · `tableId: "receiving"` · `entityFamily: receiving`. Hard law: *Table engine fan-out (History first)* in `AGENTS.md` + `.claude/rules/source-of-truth.md`. Guard: `src/lib/custom-fields/custom-fields-history-first.guard.test.ts`.

**This brief is NOT** “build Airtable,” “clone AG Grid,” “port Orders now,” or “redesign Kinetic Ledger from scratch.” It is a **standards + acceptance gate** for one golden table so fan-out does not clone defects.

---

## 0. Method — read before answering

### 0.1 Three deliverables (keep separate)

1. **Industry principles catalog (2026).** A named, citable taxonomy of design-system principles that mature products apply to **dense data tables / virtualized grids / spreadsheet-like ops queues**. Prefer primary sources dated **2024–2026**. Group by principle class (see §0.3). Each principle gets: name · one-sentence rule · who ships it · when it applies · when ops SaaS may deviate.
2. **Codebase audit of Unbox History.** Map every principle onto the **current** History mount. Quote file + line / symbol. Verdict per principle: `PASS` / `PARTIAL` / `FAIL` / `N/A (defended deviation)` with evidence.
3. **Upgrade + test gate before fan-out.** A concrete checklist an engineer can run on History only: what to change in SoT modules (not page forks), what automated guards / unit tests / E2E / manual floor checks prove the bar, and an explicit **GO / NO-GO** recommendation for growing `CUSTOM_FIELD_LIVE_ENTITY_TYPES` past `RECEIVING`.

### 0.2 Repo verification (mandatory)

Prior briefs in this repo failed when paths were inferred. Rules:

- Every path you name must be one you opened. Mark guesses `[UNVERIFIED]`.
- Load-bearing claims need a quote: symbol, type field, or line.
- Prefer reading SoT + guards over re-deriving from component names.
- If a sibling brief already ruled something, **cite and extend** — do not re-litigate (see §0.5).

### 0.3 Principle classes you must cover (minimum)

Produce a principle for each row. Add rows only if industry evidence is strong; do not invent fluff axes.

| Class | What “industry standard” means here |
|---|---|
| **A. Information architecture** | Table job vs detail job; selection model; views vs columns vs filters |
| **B. Column model** | Typed columns; alignment; sticky/frozen panes; resize; hide/show; density; flex/`1fr` tracks |
| **C. Cell & editing** | Read vs edit affordance; commit/cancel; validation; focus retention; custom/typed fields |
| **D. Keyboard & a11y** | `grid` vs `table` roles; roving tabindex; sort announcements; focus rings; contrast; reduced motion |
| **E. Visual system** | Tokens (type, space, color, elevation); header vs body; zebra/rules; selection/hover; no page-local hex |
| **F. Performance & scale** | Virtualization; sticky header; column virtualization (or why not); paint budgets on floor monitors |
| **G. Chrome & composition** | Toolbar / Fields / ▦; context menus; empty & loading; error recovery; bulk actions bar |
| **H. Governance** | One SoT; anti-fork; token pipelines; DS lint/ratchets; golden-page dogfood before multi-surface roll-out |

### 0.4 Sources to search (minimum — cite primary docs)

| Class | Named systems / specs (start here; expand with 2024–2026 sources) |
|---|---|
| Design systems — tables | Shopify Polaris IndexTable · IBM Carbon DataTable · Atlassian / Atlaskit tables · Fluent 2 DataGrid · Material 3 data tables · Adobe Spectrum tables · GitHub Primer |
| Spreadsheet / hybrid UX | Google Sheets · Excel Online · Airtable · Notion databases · Smartsheet (interaction grammar only — not product goals) |
| Headless / engine practice | TanStack Table · AG Grid docs (patterns, not “adopt AG Grid”) · WAI-ARIA APG `grid` · WCAG 2.2 |
| Research | Nielsen Norman Group tabular / scannable tables · inclusive-design guidance for dense UIs |
| Ops / SaaS queues | Linear · Stripe Dashboard tables · Retool Table · Salesforce list views (selection + density lessons) |

**Hard fork (state it in every contested ruling):**  
“What a general spreadsheet product does” ≠ “what a dense, scan-adjacent warehouse-ops Workbench on a ~1080p floor monitor should do.” Cycle Forge is the latter (Kinetic Ledger).

### 0.5 Related briefs — cite, do not redo

| Brief | Already owns |
|---|---|
| `docs/todo/table-display-sot-GEMINI-RESEARCH-BRIEFING.md` | Alignment, zebra, editability → column model SoT |
| `docs/todo/ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md` | Display consistency / chrome simplification |
| `docs/todo/grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md` | Row actions / attention / multi-select ROI |
| `docs/todo/nonlinear-data-table-engine-GEMINI-RESEARCH-BRIEFING.md` | Engine / mount waist / nonlinear host |
| `docs/todo/ledgergrid-typed-column-track-floors-GEMINI-RESEARCH-BRIEFING.md` | Typed track floors / rem geometry |
| `docs/todo/table-action-bar-fields-GEMINI-RESEARCH-BRIEFING.md` | Fields / lip chrome |
| `docs/todo/universal-table-connector-and-custom-columns-GEMINI-RESEARCH-BRIEFING.md` + `…-PLAN.md` | Custom columns / S3 storage / U2–U3 connector |
| `docs/todo/chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md` | DS governance vs 2026 practice |
| `docs/todo/in-house-libraries-premium-gap-GEMINI-RESEARCH-BRIEFING.md` | Library maturity altitude |

Your job is the **cross-cutting 2026 DS principle bar + History acceptance gate**, not reopening those plans.

### 0.6 Closed forever (do not recommend unless Ask-first with strong evidence)

- Foreign UI grids as the product table (AG Grid / MUI DataGrid / Handsontable / Glide / embedded Sheets)
- Raising DS ratchet baselines to “pass”
- Fan-out of custom fields / new shell geometry to Orders · Catalog · N queues before History GO
- Page-local `*GridView` twins (forest is burned — `GRID_VIEW_FOREST === []`)
- Mega-row / arbitrary SQL introspection for columns (U4 killed)
- Expanding flat `/search` into a custom-column matrix in this gate
- Soft radius / pill chrome on Workbench ops tables (flush-square law)
- Motion via `framer-motion` / `motion/react` outside `src/design-system/motion/**`

---

## 1. Product context (read these laws)

| Concern | Path |
|---|---|
| Portable hard laws | `AGENTS.md` |
| SoT index + table laws | `.claude/rules/source-of-truth.md` → Table definition registry · Table engine fan-out · Ops table / spreadsheet surface shell · LedgerGrid justification |
| Pattern evolution | `.claude/rules/pattern-evolution.md` |
| Kinetic Ledger identity | `.claude/rules/kinetic-ledger.md` |
| Density / type / focus / chips | `.claude/rules/ui-design-system.md` |
| Region contracts | `.claude/rules/contextual-display.md` + `.claude/rules/display/workbench.md` |
| Design-system overview | `src/design-system/DESIGN_SYSTEM.md` |

**Cycle Forge** = multi-tenant reseller-ops SaaS (sellable product; USAV = dogfood tenant only). Workbench tables are **ops queues of work items**, not freeform documents. Status writes go through `transition()`; `orgId` from auth context; color/type/space/focus from tokens.

**Region vocabulary:** Station (scan, ephemeral) · Workbench (pointer, durable URL selection) · Monitor · Canvas. This brief is about the **Workbench spreadsheet** on hybrid Unbox (Station + Workbench), History tab.

---

## 2. Golden surface — what to audit (ground truth pointers)

Open and reconcile; treat current tree as authority if this brief drifts.

### 2.1 Mount chain (History)

| Layer | Start here |
|---|---|
| Page / tab host | `src/components/station/ReceivingLinesTable.tsx` (Unbox / History spreadsheet body) |
| Host adapter | `src/components/station/receiving-grid/ReceivingGridHost.tsx` |
| Registry mount | `src/components/tables/NonlinearTableHost.tsx` |
| Definition | receiving table definition beside receiving grid (`*-table-definition.ts` under `receiving-grid/`) |
| Column geometry SoT | `src/lib/receiving/receiving-grid-layout.ts` |
| Cell map | `src/components/station/receiving-grid/cells/` + `src/lib/tables/cell-map-registry.ts` |
| Custom field cell | `src/components/tables/CustomFieldCell.tsx` |
| Engine | `src/design-system/components/grid/LedgerGridSurface.tsx` → `LedgerGrid.tsx` |
| Shell tokens | `src/design-system/tokens/table-surface.ts` |
| Column display / Fields | `src/components/ui/table-column-config/GridColumnDetailsPanel.tsx` |
| Prefs | `staff_preferences.tableColumns[tableId]` (see table-column-config + useGrid* hooks) |
| List hydrate (custom) | `GET` receiving-lines route + `src/lib/custom-fields/queries.ts` |
| Live allowlist | `CUSTOM_FIELD_LIVE_ENTITY_TYPES` in `src/lib/custom-fields/types.ts` (**`RECEIVING` only**) |

### 2.2 Already-landed SoT invariants (audit against these; grow them if wrong)

Confirm in code — do not assume from names alone:

- **LedgerGrid justification:** magnitudes end-align; labels/IDs start-align — `resolveGridColumnAlign` only (`grid-header-align.ts`). Guard: `grid-column-display.guard.test.ts`.
- **Typed track floors / frozen geometry:** `grid-column-geometry.ts`, `grid-column-type-track.ts`, frozen-left guard.
- **Editability:** `grid-column-editability.ts` — system vs custom fields; record-plane correction where required.
- **Capabilities bag:** every mount names a bag — `grid-surface-capabilities.guard.test.ts`.
- **Sheet vs Clip:** History is the flush **SHEET** recipe (abut context rail) — verify `definition.surface`.
- **ARIA roles:** `grid-aria-roles.guard.test.ts`.
- **No `*GridView` forest:** `grid-view-plumbing.guard.test.ts`.
- **History-first custom fields:** `custom-fields-history-first.guard.test.ts`.

### 2.3 Operator reality for the gate

- ~1080p floor monitors, long shifts, mouse on queues, wedge scanners on benches.
- History is a **browse / triage / annotate** queue next to Unbox scan — not a formula sheet.
- Custom columns: org **Create field** (admin) + per-staff hide/show (Sheets Fields / ▦). Dogfood path is documented in `universal-table-connector-and-custom-columns-PLAN.md`.
- Right edge **pushes** (`RightRailHost`); never a floating table overlay as the default inspector.

---

## 3. What “meeting industry standard” means for *this* gate

A principle is **met** when **all** of the following are true on History:

1. **Industry:** You can cite a 2024–2026 primary source that names the principle (or a clear split with a defended pick).
2. **SoT:** The behavior is owned by a named module / token / definition field — not re-decided in `ReceivingGridHost` or a cell fork.
3. **Observable:** An operator or automated test can fail the surface if it regresses.
4. **Portable:** The same SoT path will apply when another `entityFamily` is allowlisted later — no History-only special case unless explicitly defended as domain law.

`PARTIAL` = principle exists in industry and partly in code, but ownership is split or untested.  
`N/A (defended deviation)` = industry spreadsheet pattern that Kinetic Ledger / Station law correctly rejects (document why).

---

## 4. Forced audit questions (answer each)

### D1 — Table vs grid role
When must ARIA `grid` (interactive) vs `table` (read-mostly) be used in 2026 APG guidance, and does History pick correctly?

### D2 — Selection grammar
What is the 2026 standard for single-select vs multi-select vs “open inspector” on ops tables? Does History’s URL selection + rail match a named pattern (Linear / Polaris / Carbon)?

### D3 — Column alignment & type
Confirm industry “numbers end / text start” (or the modern split). Does `resolveGridColumnAlign` match? Any History columns that violate by override?

### D4 — Density & zoom
What do Carbon / Polaris / Fluent publish for compact density? How does `--cf-density` / spreadsheet zoom on LedgerGrid compare? Gaps?

### D5 — Frozen panes
Industry expectation for sticky leading identity columns + sticky header. Is History’s frozen prefix contiguous and keyboard-reachable?

### D6 — Resize & min tracks
Sheets/Excel vs DS tables: resize affordance, minimum track, flex filler (`_fill` / `1fr`). Is Product + trailing fill geometry on History industry-correct for ops queues?

### D7 — Hide/show & column manager
Polaris / Airtable / Sheets column managers — what is standard UX? Is ▦ → `GridColumnDetailsPanel` + context-menu hide at parity for **system + custom** columns?

### D8 — Inline edit
Commit on blur/Enter, Esc cancel, validation placement, disabled/read-only styling — industry bar vs `CustomFieldCell` + system cells on History.

### D9 — Loading / empty / error
Skeleton vs spinner vs honest empty; error inline vs toast. What does History do today?

### D10 — Keyboard complete path
Can an operator sort, move focus across cells/rows, edit a custom field, and open the column panel without a mouse? Where does APG diverge from wedge-safe house nav-keys law (`src/lib/keyboard/nav-keys/`)?

### D11 — Focus & contrast
Tokenized focus rings (`focusRing`) on resize handles, headers, editors; WCAG 2.2 contrast on selected/hover/urgent rows. Failures?

### D12 — Motion
Reduced-motion and DS `motionRole.*` — any illegal motion imports or gratuitous row animation on History?

### D13 — Visual hierarchy
Header plane vs body; selection wash; status color as state not decoration; truncation + tooltip SoT (`HoverTooltip`). Drift on History?

### D14 — Performance principles
Virtualized body, sticky header cost, column count budgets (`MAX_DEFAULT_VISIBLE_TRACKS`), custom-field hydrate join cost — what is “good enough” for 2026 ops SaaS, and does History meet it?

### D15 — Governance principle (meta)
What do mature 2026 design systems require before **promoting a golden component to N surfaces**? Map that onto History-first + guard tests. Is our gate strong enough, or missing a visual/regression artifact (Chromatic / story / E2E fixture)?

---

## 5. Scoring model (mandatory for upgrade candidates)

Every proposed upgrade (not every principle) scores 1–5 on:

| Axis | Meaning |
|---|---|
| **Floor throughput** | Faster decide/act on History? |
| **Scannability** | Tired operator, 1080p, still legible? |
| **SoT fit** | Grows LedgerGrid / definition / tokens vs page fork? |
| **Blast radius** | 5 = History-local SoT tweak; 1 = multi-family rewrite |
| **Sellable SaaS** | Tenant-safe, a11y-defensible, not dogfood folklore? |
| **Fan-out safety** | Makes the next `entityFamily` port safer (5) or riskier (1)? |

**Priority ≈ (Floor × Scannability × SoT fit × Sellable × Fan-out safety) / (6 − Blast).**  
Rank upgrades. Cut anything that does not raise the History GO bar.

---

## 6. Required output shape

Return **one markdown report** with these sections in order:

1. **Executive verdict** — Is Unbox History GO or NO-GO for fan-out? One paragraph + top 5 blockers.
2. **Principles catalog** — Table: `ID` · `Principle` · `Industry sources (links)` · `Cycle Forge SoT owner` · `History verdict` · `Notes`.
3. **History evidence pack** — For every `FAIL` / `PARTIAL`, quote code and describe the minimal SoT fix (file-level, not a redesign essay).
4. **Upgrade backlog (History only)** — Ordered by §5 score; each item: change · test · done-when.
5. **Acceptance checklist** — Copy-pasteable gate an engineer runs before editing `CUSTOM_FIELD_LIVE_ENTITY_TYPES`:
   - Automated: which `*.guard.test.ts` / unit / E2E must be green (name them after you verify they exist).
   - Manual floor: 8–12 operator steps on `/unbox` → History (create field, hide/show, edit cell, resize, sort, select → inspector, keyboard path).
6. **Defended deviations** — Industry patterns we correctly refuse (list + why).
7. **What NOT to port yet** — Explicit “do not copy this History debt” list so fan-out does not clone fails.

---

## 7. Success criteria for *your* research

- Principles are **exact and testable**, not slogans (“be consistent,” “delight users”).
- Every FAIL has a **SoT-shaped** fix path (grow `LedgerGrid*` / tokens / definition / shared cell — never “fix ReceivingGridHost specially”).
- Fan-out GO requires History `PASS` (or defended `N/A`) on classes **B, C, D, E, H** at minimum; call out if A/F/G may stay PARTIAL with a time-boxed follow-up.
- No recommendation that violates History-first, foreign-grid ban, or DS ratchet direction.

---

## 8. Paste targets after you answer

Implementers will turn your report into:

- Gaps → issues / handoff under `docs/todo/` (History-only).
- New laws → one line in `AGENTS.md` + detail in `source-of-truth.md` **only** when a principle is ratified and enforceable.
- New guards beside existing `src/design-system/components/grid/*.guard.test.ts` / `src/lib/tables/*`.

Do **not** write those law edits in your research response unless a principle is already true in code and merely undocumented — then propose the exact one-liner.

---

*End of briefing.*
