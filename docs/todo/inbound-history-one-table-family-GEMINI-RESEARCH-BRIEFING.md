# Research briefing — Unify **Incoming + Unbox History** into **one entity family + one table family**

**For:** Gemini Deep Research / Gemini Pro — **you have read access to this repository.** Paths below are pointers; open the real files.  
**From:** Cycle Forge engineering  
**Date:** 2026-08-10  
**Repo tip at authoring:** `9a0e8b5a4` — **verify live files; lines may have moved.** Working tree may also contain uncommitted Inbound chrome edits (rail-less `/incoming`, Band-1 POS|Email); treat **live tree** as ground truth for chrome, **cited paths** for table forks.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only — never frame the product as a shop-internal tool.

**Companion context (operator complaint that triggered this brief):**  
Inbound `/incoming` spreadsheet “looks forked” from Unbox History — icon-only column headers vs sentence-case words, inconsistent cell faces — even though both claim the same table **host**. Operator diagnosis (accepted as the research premise): **a shared table host without a shared columns model is not enough.**

> **What we want back is a RULING that Claude Code can execute**, not a mood board. Every recommendation must map to a **named house SoT principle**, a **concrete merge / growth path for house code + house rules**, and a **pass/fail acceptance criterion**. Where industry practice or a prior SoT law (“domain cells stay per `entityFamily`”) conflicts with **one family**, **pick a side and defend it** — including an explicit Ask-first section if you overturn the law.

---

## Locked product ask (do not soften)

| Locked ask | Meaning |
|---|---|
| **One entity family** | Incoming POS and Unbox History / receiving browse stop being two `entityFamily` / `cellMapKey` values (`incoming` vs `receiving`) that drift independently |
| **One table family engine** | One column-model SoT + one cell registry + one header/row host recipe for that family — **not** merely “both mount `NonlinearTableHost`” |
| **Display parity grammar** | Sentence-case column headers (or one ruled exception), shared typed-cell atoms, same freeze / align / justification laws — operator must not relearn the sheet when moving Inbound ↔ History |
| **Honest job differences** | Expected / in-flight PO rows ≠ landed carton activity rows may still need **view-scoped column presets** — but those presets must compose **one** family, never fork a second layout + cell map |

**Anti-goals (do not “solve” by these):**

- Adopting a foreign grid (AG Grid / MUI / Glide / embedded Sheets)
- One mega-row that renders “any SQL column” without typed atoms
- Raising DS ratchet baselines to pass a migration
- Deleting Incoming as a product surface (the desk stays; the **table family** unifies)
- Collapsing Station open-carton accordion (`PoLinesAccordion`) onto the spreadsheet engine without Ask-first
- Pretending Unbox pinned-Inbound embed (`incoming_embed` prefs) is a reason to keep a forever-forked cell map

---

## 0. How Gemini must work

### 0.1 Verify in the repo (mandatory)

Open every path in §2–§5 before asserting. Quote `file:line`. Mark inference `[UNVERIFIED]`. If a line moved since tip SHA, say so.

### 0.2 Search the web (mandatory for D1 + D2)

Industry 2024–2026 on **one table engine, many views / one entity, many column presets** in sellable B2B ops SaaS:

| Class | Named systems / specs (start here; expand) |
|---|---|
| Ops dense tables | Linear · Stripe Dashboard · Shopify Polaris IndexTable · IBM Carbon DataTable · Attio |
| Metadata / view registries | Salesforce List Views · Dynamics views · Retool Table · Airtable Interfaces vs base tables |
| Headless engines | TanStack Table (engine vs column def vs page binding) — **not** an adoption candidate for the shell |
| WMS / receiving desks | SAP EWM / Fiori inbound vs putaway queues · Manhattan / Blue Yonder / Oracle WMS Cloud — how “expected inbound” vs “received history” share or split column grammars |
| Design systems — table headers | Polaris / Carbon / Fluent — when icon-only headers are legal vs sentence-case density |

Cite primary docs. Transfer **1080p floor monitor + workbench pick→edit** constraints (not RF gun primary for this desk pair).

### 0.3 Three questions (answer separately — never fuse)

1. **Difference autopsy:** Exactly how and why Incoming and History diverge today (host · definition · columns · headers · cells · freeze · prefs · API · chrome)?
2. **Target architecture:** What does **one entity family + one table family** mean in Cycle Forge vocabulary (`entityFamily` · `cellMapKey` · `tableId` · `TableDefinition` · view presets · capabilities)?
3. **Migration path:** Exact deletion-ordered plan to get there without stranding Unbox History golden, custom fields History-first law, or `/incoming` product jobs?

### 0.4 Deliverables (keep as separate numbered sections)

| # | Deliverable |
|---|---|
| **D1** | **Industry matrix — one entity / many views** — how peer products share column grammar across related queues. Columns: Peer · Shared layer · Per-view layer · Header label policy · Ruling transferable to Cycle Forge |
| **D2** | **Codebase fork autopsy (exhaustive)** — layer-by-layer diff table with `file:line`. Must cover every row in §3. Verdict per layer: `KEEP SHARED` / `MUST MERGE` / `VIEW PRESET ONLY` / `LEGITIMATE DIVERGENCE (defend)` |
| **D3** | **Target vocabulary ruling** — pick **exactly one** of: (A) absorb `incoming` into `receiving` with view-scoped presets · (B) new shared family name that both redefine · (C) keep two `entityFamily` keys but **one** physical column+cell module (aliases). Defend against SoT “cells stay per family.” ASCII diagram of target |
| **D4** | **Shared columns model contract** — what is the single SoT file/module? What is a **column track preset** vs a **view definition**? How `headerGlyphOnly`, freeze pane, `_fill`, custom fields, and Incoming-only tracks (`age`, delivery status, `removed`) resolve |
| **D5** | **Shared cell registry contract** — how typed atoms (`GridQtyFractionValue`, `OrderIdChip`, status faces) compose; what Incoming-only status (`delivery_state`) vs History stage status become; ban second dash/title helpers |
| **D6** | **Host / mount unification** — Incoming today mounts `NonlinearTableHost` directly in `ReceivingLinesTable`; History uses `ReceivingGridHost`. Target: one host path. Map blast radius |
| **D7** | **Prefs / `tableId` / embed ruling** — `incoming` vs `incoming_embed` vs `receiving` buckets. How one family keeps Unbox Inbound embed column relief (Gemini D13) without forking cells |
| **D8** | **API / mode / SQL honesty** — `view=incoming` vs `view=activity` / history modes share `ReceivingLineRow` today. What stays server-side view; what UI wrongly forked because of it |
| **D9** | **SoT growth / overturn map** — exact patches to `source-of-truth.md` (Table definition registry · Table engine fan-out · Grid identity · headerGlyphOnly Incoming exception) · `display/workbench-ops-queue.md` · `AGENTS.md` one-liner if earned. Call out laws to **overturn** vs **grow** |
| **D10** | **Migration plan P0→P3** — deletion-ordered. Prefer delete Incoming layout/cells after absorbing · never dual-write forever. Include guard flips |
| **D11** | **DONE acceptance** — screenshot parity checklist (History sentence-case headers · Incoming same grammar · shared freeze law or defended view preset) + `npm run verify` · no ratchet raise |
| **D12** | **Claude Code P0 prompt** ≤40 lines — attach `:3050`, autopsy first, grow SoT modules first, never start/kill dev server |
| **D13** | **Out-of-scope / Ask-first** — Orders/Catalog merge · Station centre accordion · custom fields live for Incoming before History dogfood · deleting `/incoming` desk · foreign grids |

### 0.5 Paste prompt (give this entire file to Gemini)

```
Read docs/todo/inbound-history-one-table-family-GEMINI-RESEARCH-BRIEFING.md end-to-end.
Open every cited repo path. Deliver D1–D13 as separate sections.
Priority: (1) exhaustive fork autopsy Incoming vs Unbox History,
(2) exact ruling for ONE entity family + ONE table family engine,
(3) shared columns model + shared cell registry + migration that preserves
History-as-golden and Incoming product jobs.
Quote file:line. Mark [UNVERIFIED]. Industry citations required for D1.
End with the ≤40-line Claude Code P0 prompt (D12).
```

---

## 1. Product + design-system frame (non-negotiable)

### 1.1 Kinetic Ledger — five laws

Source: [`.claude/rules/kinetic-ledger.md`](../../.claude/rules/kinetic-ledger.md)

1. Facts and state drive chrome — chrome never invents a second story.
2. Archetypes are region contracts, not layout skins.
3. Data shape chooses the primary surface.
4. Presentation kinds resolve via SoT — views stay dumb.
5. Compose named shells / blocks; grow the SoT when wrong; compound every UI task.

### 1.2 Region contracts for this pair

Source: [`.claude/rules/contextual-display.md`](../../.claude/rules/contextual-display.md) + [`display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md)

| Surface | Route | Region | Job |
|---|---|---|---|
| **Inbound desk** | `/incoming` | Workbench `ops-queue` | Expected / in-flight purchase lines → attach tracking → land |
| **Unbox History** | `/unbox?unboxview=history` (and Docked `/incoming?lane=docked` activity) | Workbench sheet on hybrid Unbox / desk | Landed carton activity trail → inspect → resume |

Both are **pointer-driven triage sheets**, not Station scan benches. They already share the row type `ReceivingLineRow`.

### 1.3 Settled table laws (reconcile — do not ignore)

Source: [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → Table definition registry · Table engine fan-out · Grid identity · header labels

| Law | Tension with this brief |
|---|---|
| Shell SoT = LedgerGrid / `NonlinearTableHost` | Already shared — **not the problem** |
| **Domain cells stay per `entityFamily`** | **Direct conflict** with “one entity family” — you must grow or overturn |
| **Unbox History is golden**; fan-out History-first | Merge must **not** regress History; Incoming absorbs toward History (or shared module History owns) |
| **Custom fields live = History-first** (`CUSTOM_FIELD_LIVE_ENTITY_TYPES`) | Incoming must not leapfrog custom-field live mounts |
| LedgerGrid justification / freeze / type→glyph | Shared grammar exists; Incoming overrides via `headerGlyphOnly` |
| Incoming Pipeline exception (2026-08-04): **every data column `headerGlyphOnly`** | Primary visual fork the operator hates — adjudicate keep vs kill |

### 1.4 Prior research already closed (do not redo)

| Doc | Use |
|---|---|
| [`nonlinear-data-table-engine-GEMINI-RESEARCH-BRIEFING.md`](./nonlinear-data-table-engine-GEMINI-RESEARCH-BRIEFING.md) + [`nonlinear-data-table-engine-PLAN.md`](./nonlinear-data-table-engine-PLAN.md) | Registry waist already shipped; this brief is the **next** problem (family fork inside the waist) |
| [`workbench-table-ds-principles-2026-GEMINI-RESEARCH-BRIEFING.md`](./workbench-table-ds-principles-2026-GEMINI-RESEARCH-BRIEFING.md) | DS principles for workbench sheets |
| [`universal-table-connector-and-custom-columns-GEMINI-RESEARCH-BRIEFING.md`](./universal-table-connector-and-custom-columns-GEMINI-RESEARCH-BRIEFING.md) | Custom columns / connector — History-first |

---

## 2. Current architecture map (verify live)

### 2.1 Shared today (do not pretend these are forked)

| Concern | Path / symbol |
|---|---|
| Row type | `ReceivingLineRow` — `src/components/station/receiving-line-row.ts` |
| Engine | `LedgerGrid` / `LedgerGridSurface` |
| Mount waist | `NonlinearTableHost` — `src/components/tables/NonlinearTableHost.tsx` |
| Definition schema | `parseTableDefinition` — `src/lib/tables/table-definition.ts` |
| Some cell atoms | `@/components/ui/grid-cells` (`GridQtyFractionValue`, `GridDateCellValue`, …) · `CopyChip` / `OrderIdChip` |
| Zoho receipt chip | Incoming **imports** `ReceivingZohoCell` already — proof cells can cross-compose |
| API bag | `/api/receiving-lines` with `view=` discriminating SQL |

### 2.2 Forked today (the problem surface)

```
                    ReceivingLineRow (SHARED)
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
   entityFamily: 'incoming'              entityFamily: 'receiving'
   cellMapKey:   'incoming'              cellMapKey:   'receiving'
   tableId:      'incoming'              tableId:      'receiving'
          │                                       │
          ▼                                       ▼
 INCOMING_GRID_COLUMNS                    RECEIVING_GRID_COLUMNS
 (headerGlyphOnly: ALL)                   (sentence-case labels)
 freeze: select only                      freeze: select · order
 tracks: +age · delivery status           tracks: +price · location · serial · _fill
          │                                       │
          ▼                                       ▼
 incoming-grid/cells/index.tsx            receiving-grid/cells/*Cell.tsx
 IncomingGridColumnHeader                 ReceivingGridColumnHeader
 IncomingGridRow / GroupRow               ReceivingGridRow / GroupRow
          │                                       │
          ▼                                       ▼
 NonlinearTableHost (inline in            ReceivingGridHost
   ReceivingLinesTable)                     (+ ReceivingDrillHost)
 definition: inbound.incoming             definition: receiving.browse
```

### 2.3 Definition registry entries

| Id | File | `entityFamily` | `tableId` |
|---|---|---|---|
| `inbound.incoming` | `src/components/station/incoming-grid/incoming-table-definition.ts` | `incoming` | `incoming` |
| `receiving.browse` | `src/components/station/receiving-grid/receiving-table-definition.ts` | `receiving` | `receiving` |

`TABLE_ENTITY_FAMILIES` in `src/lib/tables/table-definition.ts` lists **both** `'receiving'` and `'incoming'` as separate enums — that is the formal fork.

### 2.4 Family file trees (count the blast)

**Incoming family**

- `src/lib/receiving/incoming-grid-layout.ts` (+ `.test.ts`)
- `src/components/station/incoming-grid/**` (definition, descriptor, header, row, group, status cell, cells/index, sheet guard)

**Receiving / History family**

- `src/lib/receiving/receiving-grid-layout.ts` (+ `.test.ts`)
- `src/components/station/receiving-grid/**` (host, drill, definition, descriptor, header, row, group, cells/*, date helpers, guards)

**Mount site that wires Incoming**

- `src/components/station/ReceivingLinesTable.tsx` — `isIncomingMode` branch mounts `NonlinearTableHost` + Incoming renderers; Docked/history uses `receivingGrid()` → `ReceivingGridHost`

---

## 3. Exhaustive difference inventory (Gemini must verify + extend)

### 3.1 Column model

| Dimension | Incoming (`INCOMING_GRID_COLUMNS`) | History (`RECEIVING_GRID_COLUMNS`) |
|---|---|---|
| Header face | **`headerGlyphOnly: true` on every data column** | Sentence-case `label` shown (`Qty`, `Status`, …) |
| Freeze | `select` only | `select · order` |
| Slack track | No trailing `_fill` (Notion-overflow pilot — fixed preferred Product) | Trailing `_fill` `1fr` |
| Unique tracks | `age` (duration), delivery-oriented `status`, optional `platform`, `removed` (legacy) | `price`, `location`, `serial`, custom `custom:*` |
| Shared key names | `select`, `title`, `date`, `qty`, `condition`, `status`, `order`, `tracking`, `zoho` | same keys — **different semantics for `date` / `status`** |
| Date meaning | Expected / PO date face | Activity stamp (Unboxed / Scanned / …) as civil day |
| Status meaning | Delivery attention (`delivery_state` / Incoming status cell) | Lifecycle / coarse stage |
| Guard pin | `incoming-grid-layout.test.ts` asserts **all** `headerGlyphOnly` | `grid-column-tier.guard.test.ts` asserts History Qty keeps **word** |

### 3.2 Cells

| Concern | Incoming | History |
|---|---|---|
| Registry shape | One switch in `incoming-grid/cells/index.tsx` | Per-key `Receiving*Cell.tsx` files + `renderReceivingGridCell` |
| Title helper | `displayProductTitle` (Incoming module) | `displayReceivingProductTitle` (receiving helpers) |
| Status | `IncomingGridStatusCell` (delivery / claim / dwell) | `ReceivingStatusCell` (stage) |
| Custom fields | Not live | `CustomFieldCell` when `CUSTOM_FIELD_LIVE` includes `RECEIVING` |
| Cross-import today | Uses `ZohoReceiptChip` from receiving | Does not import Incoming cells |

### 3.3 Host / chrome

| Concern | Incoming | History |
|---|---|---|
| Host | Direct `NonlinearTableHost` in `ReceivingLinesTable` | `ReceivingGridHost` (and drill host) |
| Sheet chrome | `IncomingWorkspaceHeader` | `HistoryWorkspaceHeader` / Unbox sheet chrome |
| Inspector | `detail:incoming` | `detail:history` (stations override to work surface) |
| Day bands | `showDayHeaders: false` | false by default; Testing may override |

### 3.4 Prefs / embed

| Bucket | Purpose |
|---|---|
| `tableId: 'incoming'` | L1 Inbound desk density |
| `tableId: 'incoming_embed'` | Unbox pinned Inbound tab — **same definition, instance override** so hiding columns on embed does not ruin desk (documented in `incoming-table-definition.ts`) |
| `tableId: 'receiving'` | History / Unbox sheet |

Unifying families must **preserve** embed relief without resurrecting a second cell map.

### 3.5 Server / modes (UI fork vs data fork)

| Mode / view | UI family today | Notes |
|---|---|---|
| `view=incoming` | Incoming grid | Expected lines |
| `view=incoming_removed` | Was Incoming (Recently removed UI retired 2026-08-10; SQL may still exist) | Do not revive UI without product ask |
| `view=activity` / history sorts | Receiving grid | Docked + Unbox History |
| Email Triage | Not a grid — `EmailTriagePanel` | Out of spreadsheet family scope |

### 3.6 Chrome already moved (context only)

Inbound left Views rail deleted; Pipeline|Docked big tabs + KPI strip + Recently removed tab deleted or retired; Band-1 = POS | Email. **Do not spend research budget on chrome** unless the table merge forces a chrome SoT line.

---

## 4. Operator-visible failure mode (why “shared host” felt like a lie)

1. Operator opens Unbox History → reads **sentence-case** headers (`Qty`, `Tracking`, …).
2. Operator opens `/incoming` → sees **type glyphs** only (`headerGlyphOnly`).
3. Status / date / qty faces use overlapping atoms but different wrappers and status vocabularies.
4. Engineering says “same NonlinearTableHost / registry” — true for the **waist**, false for the **columns model + cell map**.
5. Operator conclusion (correct): **without a shared columns model, the family is forked.**

Gemini must treat that conclusion as the problem statement, not as ignorance of the registry.

---

## 5. Candidate architectures (score all; pick one)

Score each on Fit · Operator parity · Blast radius · History-golden risk · Migration cost (1–5). Rank.

| Id | Candidate | One-line |
|---|---|---|
| **C1** | Absorb `incoming` → `receiving` | Delete `entityFamily: 'incoming'`; Incoming becomes `receiving.inbound` (or similar) **view** with column preset |
| **C2** | New family `inbound-lines` | Both History and Incoming redefine onto a renamed family (bigger rename, cleaner noun?) |
| **C3** | Dual enum keys, single module | Keep `'incoming'|'receiving'` in Zod for prefs continuity but **one** `receiving-grid-layout` + **one** cell registry with view presets (aliases only) |
| **C4** | Shared column presets only | Extract `SHARED_LINE_TRACKS` composed by both layouts; keep two families — **weakest** vs locked ask; include only as foil |
| **C5** | Status quo + kill `headerGlyphOnly` | Visual patch only — **rejects** locked “one family” ask; include only as foil |

**Locked ask requires C1, C2, or C3.** Foils must be scored and rejected with reasons.

---

## 6. Laws Gemini may need to overturn (Ask-first section required)

If you choose one family, you likely overturn or narrowly amend:

| Law today | File | Possible amendment |
|---|---|---|
| “Domain cells stay per `entityFamily`” | `source-of-truth.md` Table definition registry | “One cell registry per **row-type family**; views select presets” |
| Incoming all-`headerGlyphOnly` exception | `workbench-ops-queue.md` § Qty / column header labels | Delete exception; Incoming follows History sentence-case |
| Incoming freezes `select` only vs History `select·order` | Grid identity pane | One freeze law + optional view preset if Expected desk truly needs order scrolling |
| Fan-out History-first | `CUSTOM_FIELD_LIVE` / guards | Unchanged — Incoming gains custom fields only after History dogfood (already true) |

Do **not** silently ignore these. Either grow them or Ask-first overturn.

---

## 7. Suggested evidence checklist (paste into D2)

Gemini: for each item, `PASS` shared / `FORK` / `N/A` with path:

- [ ] `INCOMING_TABLE_DEFINITION` vs `RECEIVING_BROWSE_DEFINITION` fields
- [ ] Every column key in both layouts (side-by-side table)
- [ ] Every `headerGlyphOnly` occurrence
- [ ] Freeze keys via `gridFrozenKeys`
- [ ] `makeIncomingGridDescriptor` vs `makeReceivingGridDescriptor`
- [ ] Cell switch cases / files
- [ ] Title display helpers duplication
- [ ] Status cell vocabulary sources (`delivery_state` vs stage)
- [ ] Date cell source fields
- [ ] Qty cell atom reuse
- [ ] Tracking / Order chip reuse
- [ ] Custom field wiring presence/absence
- [ ] Host mount sites in `ReceivingLinesTable` / `ReceivingGridHost`
- [ ] Prefs `tableId` + embed override
- [ ] Guards that **pin the fork** (must flip in D10):  
  `incoming-grid-layout.test.ts` (all glyph-only) · `grid-column-tier.guard.test.ts` · `incoming-grid-sheet.guard.test.ts` · `table-definition-registry.guard.test.ts` · `custom-fields-history-first.guard.test.ts`

---

## 8. Constraints for the ruling

1. **History remains the golden spreadsheet.** Incoming moves toward History’s grammar unless a view preset is explicitly defended.
2. **Row type stays `ReceivingLineRow`** unless you prove a split type is required (unlikely).
3. **No foreign grid.**
4. **No ratchet raise.**
5. **Prefer deletion** of `incoming-grid/**` after absorption over eternal dual-write.
6. **Embed prefs** (`incoming_embed`) remain an instance `tableId` override — not a second family.
7. **Email Triage** stays a non-grid pane.
8. **Server `view=`** may remain multiple SQL shapes; UI family count is the unification target.
9. Attach to `:3050`; never start/kill the user dev server in execution prompts.
10. `npm run verify` is the definition of done.

---

## 9. Out of scope

- Merging Orders / Catalog / Pickup into this family
- Station centre PO-line capture / `PoLinesAccordion`
- Reviving Recently removed as a Band-1 tab
- Restoring Incoming KPI Band 2 / Pipeline|Docked parent tabs
- Rewriting `/api/receiving-lines` SQL from scratch (only call out UI-driven API needs)
- Studio AI authoring of the unified definition (Horizon C — mention only if it changes the module boundary)

---

## 10. What “done” looks like after Claude Code executes your plan (preview)

Operator on `/incoming` and Unbox History:

- Same sentence-case header grammar (unless you defend a single muted track)
- Same typed cell atoms for shared keys
- One `entityFamily` (or proven alias module)
- One column-model module + one cell registry
- View presets explain Expected vs Activity columns without a second design language
- Guards pin unity; fork guards deleted or inverted
- `npm run verify` green

---

## Appendix A — Key paths (quick open list)

```
src/lib/tables/table-definition.ts
src/components/tables/NonlinearTableHost.tsx
src/components/tables/table-definition-registry.ts
src/components/station/incoming-grid/incoming-table-definition.ts
src/components/station/receiving-grid/receiving-table-definition.ts
src/lib/receiving/incoming-grid-layout.ts
src/lib/receiving/receiving-grid-layout.ts
src/components/station/incoming-grid/cells/index.tsx
src/components/station/receiving-grid/cells/index.tsx
src/components/station/ReceivingLinesTable.tsx
src/components/station/receiving-grid/ReceivingGridHost.tsx
src/components/station/receiving-line-row.ts
.claude/rules/source-of-truth.md
.claude/rules/display/workbench-ops-queue.md
src/lib/custom-fields/custom-fields-history-first.guard.test.ts
src/lib/tables/grid-column-tier.guard.test.ts
```

## Appendix B — Paste-ready Claude Code starter (replace with your D12)

```
Read docs/todo/inbound-history-one-table-family-GEMINI-RESEARCH-BRIEFING.md
and the Gemini ruling (D1–D13). Attach to :3050 — never start/kill the dev server.
Execute only the ruled P0: grow the shared columns/cell SoT toward one family;
do not dual-write forever; do not raise ratchets; keep History golden.
Run npm run verify before claiming done.
```
