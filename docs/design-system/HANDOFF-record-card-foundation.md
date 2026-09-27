# Handoff prompt — RecordCard foundation: one triage list for every page, old tables retired

Paste everything below the line into a fresh long-running session.

---

You are replacing CycleForge's per-page data tables with ONE foundational triage list — `RecordCard`
inside `TriageCardList` — driven by the existing field-catalog / `SlotLayout` hierarchy, then
porting pages onto it and retiring each old table as its page moves. Worktree:
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Read `AGENTS.md` first. Dev origin is
`http://localhost:3050` ONLY (lane unit `cycleforge-lane@prod`).

This is a long autonomous run. Work in **waves**; each wave ends green (`pnpm verify:fast`) with a
screenshot proof at `:3050` of every page it touched, then continues. Stop and ask only at the
decision points marked **ASK**. Shared dirty tree (~450 paths, other sessions live): never commit
without asking; re-read a file right before editing; never revert what you did not write; report
red that belongs to other files instead of fixing it.

## Read first (in this order)
1. `docs/design-system/BRIEF.md` §12 (every desktop route = triage; Floor = industrial) and §13 (card
   line 1, card stages, width disclosure, one stage source).
2. `docs/design-system/HANDOFF-card-list-port.md` — phase 4 is this plan; phases 1–3 built the
   reference card.
3. `docs/design-system/RESEARCH-record-card-foundation.md` — how the DataTable consumes the hierarchy
   today (SlotLayout, cascade, saved views, painters, families × pages, gaps). Re-verify lines.
4. `docs/design-system/HANDOFF-qc-pick-split.md` — another session owns the QC/Pick DATA split and
   `src/lib/orders/order-stages.ts` internals; you consume its contract, you do not edit its SQL/API.
5. The reference implementation: `src/components/outbound/orders/cards/` (`OrderCardList.tsx`,
   `OrderCard.tsx`, `OrderCardSelectBar.tsx`, `OrderCardPeek.tsx`, `order-card-list-state.ts`),
   `src/lib/orders/order-card-model.ts`, tokens `CARD_FACT_BOX_CLASS` / `CARD_DISCLOSE` in
   `src/design-system/tokens/desk-stage.ts`.

## The foundation (five layers — a page supplies only layer 5)

| Layer | Owns | Source |
|---|---|---|
| 5. Page | family + layout (or saved view) + action set | a few lines per route |
| 4. `TriageCardList` | selection bar, check axis, sections, pager/scroll, Find (`FindField`), J/K, quick look, record plane, URL state | extract from `OrderCardList` / `OrderCardSelectBar` |
| 3. `RecordCard` | fixed anatomy: rail · check · identity (top-left) · status (top-right) · lead photo + title · sub-lines · subtitle facts · stage chips (bottom-right) · Details | extract from `OrderCard` |
| 2. Hierarchy | WHAT each slot shows: field catalog + `SlotLayout` (`src/lib/tables/field-catalog/*`, `slot-layout-core.ts`, `slot-layout.ts`, `resolve-effective-layout.ts`) | exists; extend |
| 1. Data | family resolver → `CompoundSlotValue` (`<family>-resolve.ts`) | exists |

## Laws (enforce in review; add a source-law gate to `verify:fast` if one fits — see `add-guard` skill)
1. **Pages pass ids, never JSX.** Field ids, layout ids, action ids. `RecordCard` / `TriageCardList`
   never branch on family (`if (family === …)` is a failed review). A page that "needs" a branch is
   missing a field, a slot binding, a paint kind or an action.
2. **One painter per display type**, shared by the card, the remaining sheet tables, the quick look
   and AI chat (`CompoundCells.tsx`, `compound-slot-face.ts`). New paint kinds go into the shared set.
3. **Fixed positions everywhere:** identity top-left, the family's most important status top-right,
   time far right, stage chips bottom-right, names never inline (on click / quick look), full facts in
   the quick look, everything in one 24 px line box (`CARD_FACT_BOX_CLASS`).
4. **Disclosure by the card's own width** through `CARD_DISCLOSE` tiers (`brand` @md, `label` @xl,
   `detail` @2xl), chosen per binding by priority — never per-page breakpoints.
5. **Actions are fixed and identifiable** (owner QoL ask, 2026-09-27):
   - One per-family **action registry**: ordered verbs, each with scope `single | bulk | both`, a
     keyboard key, and an `unavailable(reason)` rule. Verbs are **disabled with a reason, never
     hidden**, so the bar never reshuffles.
   - **Selection actions live in the selection bar only** — same verbs, same order, same place for 1
     or N checked (bar reads "1 selected" / "12 selected · 3 out of stock · 5 not picked", each part
     narrows the selection; "Select all 240 matching" vs this page). **ASK** before shipping: BRIEF
     §13 currently rules "one checked → card drop-down, 2+ → bulk bar"; recommend replacing it.
   - **Single-card actions live in fixed card spots only:** the ⋮ menu at line 1 far right, the
     identity ↗ (admin link, hover menu: copy / edit link), stage-chip popovers (assign). Same glyph,
     same spot, every family.
   - Bulk safety: preview ("Assign pick → Mo for 8 lines on 5 orders"), then run; Undo toast;
     per-item result ("7 done · 1 failed — Retry").
   - Keyboard parity for every pointer verb (J/K, X check, Space quick look, Enter open, A assign,
     `?` cheat sheet); keys shown in bar buttons and tooltips.
   - A persistent "what I just changed" feed (session-scoped list of the operator's last actions
     with undo where possible) and a freshness mark on the bar ("Live" / "Updated 1 min ago").
6. **Saved views keep working.** Extend `SlotLayout` additively through the strict gate and the
   cascade (saved view → staff → org → product default); existing `saved_views.filters.layout` rows
   must still load. No new layout type.
7. **Floor stays industrial** (BRIEF §12/§13 Mode D): Ctrl/⌘+Shift+F keeps the industrial ledger.
   Phone routes (`/m/*`) keep their own surfaces unless a wave explicitly ports them — mobile-first
   law `docs/mobile-first/SURFACE_LAW.md`: every verb stays completable on `/m/*`.

## Waves

> **Superseded order (owner 2026-09-27):** outbound first, one page per wave, owner sign-off on
> each page's screenshots before the next: root lock on To ship → Exceptions → PO paired → Pick
> list → Shipped. Wave 3 (inventory) and Wave 4+ wait until all five are signed off. The live
> order is the "Wave order" table in `RECORD-CARD-MIGRATION.md`.

**Wave 0 — Inventory (no code).** List every table mount (`<DataTable` is in 35 files today;
also `registered-bindings.ts`, `SLOT_LAYOUT_TABLES` in `org-table-layouts.ts`, ledger/sheet grids).
For each: route, family, layout id, morph (compound/sheet), saved views in use (query the dev DB),
mobile twin, and a verdict: **port** (triage list), **keep sheet** (true spreadsheet/report use —
exports, audit logs, reports where columns ARE the job), or **Floor/industrial**. Write
`docs/design-system/RECORD-CARD-MIGRATION.md` (the ledger of this run). **ASK** the owner to confirm
the keep-sheet list before Wave 3.

**Wave 1 — Foundation.**
- Extend `SlotLayout` + catalog types: `lead` (photo + title fields), `lines` (sub-line source, cap),
  `stage` (ordered stage fields with roles; words/icons from `FieldDef.stageLabels` / `iconKey`),
  `rail` (tone field), per-binding `priority` → `CARD_DISCLOSE` tier. Fill the orders layout.
- `RecordCard`, `TriageCardList`, `ActionRegistry` (+ selection bar) under
  `src/design-system/components/` (check `ds_contract` first; reuse `FindField`, `DeskRecordPlane`,
  `HoverTooltip`, `LedgerStageAssign`; don't stretch `TriageSections` / `TriageScrollLayout`).
- Implement Law 5 in the bar and card.

**Wave 2 — Proof: To-ship on the foundation, zero visual change** (except the owner-approved
Law 5 bar). Delete `OrderCard` / `OrderCardList` internals that the foundation now owns; the orders
family becomes layout + action registry + page. Screenshot before/after at `:3050`.

**Wave 3 — Stress family: inventory** (`units` / `bins` / `sku-bins`): stock and location are the
top-right status, no price. Anything that doesn't fit becomes a layout field or shared paint kind.

**Wave 4+ — Port the rest, one family per wave**, in the order Wave 0 recommends (expected: receiving
/ inbound, daily, my-day, catalog/products, walk-in sales, tasks/automations, remaining outbound
views). Per wave: default layout, action registry, page mount, saved views verified, **delete the
old table mount and every helper it alone used** (clean cutover — no shims, no dead exports),
update the migration ledger.

**Wave N — Retire table infrastructure** only when a piece has zero consumers (knip / grep). The
DataTable primitive stays while any keep-sheet page uses it.

**Wave N+1 — AI chat.** Map artifact tables (`src/lib/assistant/ui-artifacts.ts` `entityHint`,
`idColumn`, `identity`; `InlineArtifact.tsx`) to a family + default layout and render them as
`TriageCardList` (read-only action set).

## Verification per wave
`npx tsc --noEmit -p tsconfig.json` (filter touched), `npx eslint <touched> --quiet`,
`pnpm verify:fast`; screenshots of every touched route at `:3050` (desktop split + in place, one
narrow width); saved view load for that route; `/m/*` twin still works. Record results in the
migration ledger. No new unit tests unless the owner asks (the design is still moving).

## ASK points (only these)
1. Wave 0 keep-sheet list.
2. Law 5 selection-bar model replacing BRIEF §13's single-card drop-down.
3. Any family whose hierarchy the layout cannot express after two attempts.
4. Any port that would change a mobile (`/m/*`) surface.
