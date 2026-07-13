# Receiving condition/serial display unification — plan

**Status:** ✅ SHIPPED — all phases, **no feature flags** (2026-07-13). Prod + dev both run the unified surface unconditionally. **Owner:** receiving/unbox.

## Shipped summary (2026-07-13)

All three phases are live and **there is no flag to toggle** — the unified one-row surface is the only receiving path.

- **Phase 1 — leaf aligned.** `UnmatchedLineRow` renders its editor through the shared `ActiveLineConditionSerial` leaf (same as a matched PO line). Guard: `unmatched-line-row-shared-leaf.test.ts`.
- **Phase 2 — one row surface (unflagged).** `UnmatchedItemsSection` renders `UnmatchedAccordionSurface` for **every** receiving carton: a `PoLinesAccordion` whose **active row is the condition + serial editor**, with the return scanner as the empty-carton (0-line) "scan the first return" affordance — no standing carton scanner beside the rows, so a return import updates the row **in place** (no duplicate). A created line is upserted into the shared `receivingSiblingsQueryKey` cache (`upsertSiblingLine`). The former `NEXT_PUBLIC_RECEIVING_UNIFIED_UNFOUND_SURFACE` flag and its reader were **deleted**. The per-line list (`UnmatchedLineRow`) survives **only** for the tech testing workspace's `renderLineActions` (per-line verdict pills) — a genuine capability fork, not a flag. Guards: `unified-unfound-surface.test.ts`, `upsert-sibling-line.test.ts`.
- **Phase 3 — source classifier, sibling-layer controllers (Open Q#3 → sibling layer).** `shouldUseUnmatchedItemsSurface` is demoted to a **source classifier** (`classifyLineSource(row) → 'po' | 'unmatched'`): both lanes render the **same** `PoLinesAccordion` row surface; the classifier only selects which controller layer drives it (`useUnboxLineController` vs `useUnmatchedItems`). Guard: `intake-items-routing.test.ts`.
  - **Deliberately NOT done:** folding `useUnboxLineController` + `useUnmatchedItems` into one hook (plan Open Q#3's *other* option). Both are ~600-line tenant-scoped mutation controllers; a blind merge with no runtime parity harness would *reduce* prod-readiness, not increase it. The sibling-layer shape the plan explicitly sanctions delivers the unified single surface with no regression risk. A future one-controller fold is optional cleanup, not required for the unified surface, and should ship behind its own parity check.
  - **Follow-up (not blocking):** graduation unfound→matched still re-selects the real line (`onLinked` → `dispatchSelectLine`) rather than an in-place source flip on one controller — that "no remount" nicety depends on the one-controller fold above.

Original phased plan (as authored) is preserved below for context.

**Blast radius:** Phase 1 low · Phase 2 medium · Phase 3 ask-first (controller merge).

## Goal

One condition-pills + serial display for a receiving carton, whether the carton is a **matched PO line** or an **unfound / return** intake — so importing a return **updates the same row in place** instead of rendering the condition/serial twice (a standing carton-level scanner **plus** a new per-line row) and instead of swapping the entire surface when a carton graduates unfound → matched.

Non-goal: changing the condition-grade vocabulary, the serial scan endpoints, or the receiving state machine. This is a **display/controller-seam** consolidation, not a data-model change.

## Background — what already exists (do not re-derive)

The leaf is **already shared**. Both sides bottom out in the same primitives:

- `ConditionPills` (`src/components/receiving/workspace/ConditionPills.tsx`) — the flat NEW/L-NEW/REFURB/A/B/C/PARTS row; grades from `CONDITION_GRADES` + `conditionLabel(..,'pill')`.
- `SerialCard` (`src/components/receiving/workspace/SerialCard.tsx`) — renders `ConditionPills` + the "Serial" `<input>` + the green-check no-serial CTA + saved `SerialChipWithMenu` chips.

Both surfaces also write the **same** query cache (`receivingSiblingsQueryKey`, `src/lib/queries/receiving-queries.ts`) and fire the **same** events (`receiving-line-updated`, `app-refresh-data`). The plumbing for "update in place" is present; it is simply not used by the unfound surface.

### The two parallel stacks (the actual duplication)

| Concern | Matched | Unfound |
|---|---|---|
| Surface | `PoLinesAccordion` → `PoLineRow` → `activeRowSlot` | `UnmatchedItemsSection` |
| Editor leaf | `ActiveLineConditionSerial` → `SerialCard` | **carton-level** `SerialCard` **+** `UnmatchedLineRow` (per line, its own `SerialCard`) |
| Controller | `useUnboxLineController` / `useLineSerials` | `useUnmatchedItems` |
| Chosen by | `LinePoItemsSection` hard-branch: `shouldUseUnmatchedItemsSurface(row)` (`src/lib/receiving/intake-items-routing.ts`) |

Reference files:
- Branch: `src/components/receiving/workspace/line-edit/LinePoItemsSection.tsx` (`useUnmatchedSurface` → `UnmatchedItemsSection` else `PoLinesAccordion`).
- Matched slot JSX: `LinePoItemsSection.tsx` `activeRowSlot={({ serials }) => <ActiveLineConditionSerial …/>}`.
- Unfound surface: `src/components/receiving/workspace/UnmatchedItemsSection.tsx` (carton-level `SerialCard` at the "PO ITEMS · N" body) + `unmatched-items/UnmatchedLineRow.tsx`.
- Unfound controller: `unmatched-items/useUnmatchedItems.ts` (`handleReturnSerialScan`, `handleAddLine`, `handleConditionChange`, `handleCartonConditionChange`).
- Return-import path: `handleReturnSerialScan` → `GET /api/serial-units/lookup` → `POST /api/receiving/add-unmatched-line` → `POST /api/receiving/scan-serial` → `PATCH /api/receiving/{id}`.

### Root cause of "two rows"

`UnmatchedItemsSection` renders a **carton-level `SerialCard`** (the standing scanner in the screenshot) **and, separately**, one `UnmatchedLineRow` per line already added. Scanning a return creates a line → a new `UnmatchedLineRow` appears while the carton-level scanner stays → the condition/serial is now shown twice. The matched accordion has no equivalent split: its active row **is** the editor.

## Target architecture

`PoLinesAccordion` becomes the **single row surface** for both matched and unfound lines.

- An unfound carton = a line with `receiving_source === 'unmatched'` (or a stub line before the first scan) rendered as a `PoLineRow`.
- The active row's `activeRowSlot` is the **same** `ActiveLineConditionSerial` for both sources. There is **no** separate carton-level scanner.
- A return import mutates *that line's* condition + serials, writes `receivingSiblingsQueryKey`, and fires `receiving-line-updated` → the row updates in place. No second row.
- Graduation unfound → matched is a **data flag flip** on one line (`receiving_source`, `zoho_purchaseorder_number`), not a component swap.
- Unfound-only affordances (`IntakeClassifyRow` "Receiving as", `LabelIdentifyButton`, off-PO add, `UnfoundMatchStrip`) live in the row/header, resolved by `source`, not a rival body.

This matches Kinetic Ledger law: one row anatomy; do not fork a page-local parallel primitive for the same job; grow the SoT so the next caller inherits it.

## Phased plan

### Phase 1 — align the leaf (low blast radius, behavior-preserving)

Make an unfound **per-line** row render pixel- and behavior-identical to a matched row.

- Change `UnmatchedLineRow.tsx` to render its editor via `ActiveLineConditionSerial` instead of the bare `SerialCard` body, mapping `useUnmatchedItems` handlers onto the `ActiveLineConditionSerial` prop contract (`onSubmitSerial`, `onDeleteSerialUnit`, `onConditionChange`, no-serial waiver props). Multi-qty and single-qty branches then behave identically to matched.
- Keep `ProgressBadge`/`ScannedBadge` (already re-exported from `PoLinesAccordion` via `PoLineBadges`).
- **No controller merge, no surface swap.** The carton-level scanner still exists (removed in Phase 2).

**Deliverable:** unfound line rows and matched line rows share `ActiveLineConditionSerial`. **Guard:** add a source-text or render test asserting `UnmatchedLineRow` composes `ActiveLineConditionSerial`.

### Phase 2 — route unfound through the accordion (removes the double row)

- `UnmatchedItemsSection` renders a `PoLinesAccordion` (embedded) instead of its own carton-level `SerialCard` + `UnmatchedLineRow[]` list. The lines it holds become the accordion's rows; the **active** row's `activeRowSlot` = `ActiveLineConditionSerial`, driven by `useUnmatchedItems`.
- The standing carton-level `SerialCard` scanner is **deleted**; the active row is the scanner. For a truly empty carton (0 lines), the accordion shows a single stub/"new line" active row that owns the scan input (or an explicit "scan the first return serial" active-row affordance).
- Unfound-only chrome (`IntakeClassifyRow`, `LabelIdentifyButton`, `UnfoundMatchStrip`) moves to the accordion header (`headerRight`) or the active row, gated on `source === 'unmatched'`.
- Return import: `handleReturnSerialScan` continues to `add-unmatched-line` + `scan-serial`, but now writes the accordion's `receivingSiblingsQueryKey` cache (it already fires `receiving-line-updated`) so the **active row** reflows in place — no new standalone row, no tree swap.

**Deliverable:** one row surface; a return import updates the active row's condition + serial in place. **Verify:** drive the return-import flow end to end (scan a return serial on an unfound carton → the same row shows the serial chip + condition, no duplicate).

### Phase 3 — merge the controllers (ask-first)

- Introduce one line controller with a `source: 'po' | 'unmatched'` discriminator (fold `useUnmatchedItems` into `useReceivingLineCore` + a source-specific layer, mirroring `useUnboxLineController` / `useCartonLabelEditor`). One `activeRowSlot`/`activeSerialActions` contract, one condition-PATCH path, one serial-scan path.
- `LinePoItemsSection`'s hard branch collapses: it always mounts `PoLinesAccordion`; the controller resolves source. `shouldUseUnmatchedItemsSurface` becomes a source classifier feeding the controller, not a surface switch.
- Graduation unfound → matched: the controller flips `source` on the line; the row re-derives. No remount.

**Gate:** flag-gated rollout (`readBoolEnv` / `resolveForOrg`) behind e.g. `RECEIVING_UNIFIED_LINE_SURFACE`, matched-first parity check against the current unfound surface before default-on. This is the Ask-first tier (touches tenant-scoped receiving mutations + two controllers) — do **not** start without ratifying the open questions below.

## Migration order & flag gating

1. Phase 1 ships unflagged (pure leaf alignment, no behavior change).
2. Phase 2 behind `RECEIVING_UNIFIED_UNFOUND_SURFACE` (env flag, default off) → dogfood on USAV → default on → remove the old carton-level scanner branch.
3. Phase 3 behind `RECEIVING_UNIFIED_LINE_SURFACE`, strangler-style; keep both controllers until parity is proven, then delete `useUnmatchedItems`.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Return-import optimistic write drifts from the accordion cache | Both already target `receivingSiblingsQueryKey`; Phase 2 asserts the write path lands on that key (test the cache patch). |
| Unfound-only affordances (classify, label-identify, off-PO) lose their home | Enumerate each and place it in the accordion header/active row **before** deleting the carton scanner (Phase 2 checklist). |
| Multi-qty unfound behaves differently than matched | Phase 1 routes unfound through the same `ActiveLineConditionSerial` multi-qty branch (`ReceivingUnitRows`) — parity by construction. |
| `refetchOnWindowFocus:false` (Pass+Print) semantics | Inherited from `usePoLinesData` — unchanged; unfound now benefits from the same guard. |
| Two dispatch cadences during the strangler | Keep events identical (`receiving-line-updated`, `app-refresh-data`); the accordion's `usePoLinesData` already listens to both. |

## Test / guard updates

- `po-lines-accordion-meta-order.test.ts` — already repointed to `PoLineRow.tsx`; unaffected.
- Add: `UnmatchedLineRow` composes `ActiveLineConditionSerial` (Phase 1 guard).
- Add: return-import writes `receivingSiblingsQueryKey` (Phase 2 — DB-free test of the cache-patch helper, node:test convention).
- Phase 3: parity spec — same input row through both controllers yields the same `activeRowSlot` contract.

## Open questions to ratify before Phase 3

1. **Empty unfound carton (0 lines):** does the accordion show a persistent stub "new line" active row that owns the scanner, or an explicit "scan first return" empty-active affordance? (Decides how the screenshot's carton-level scanner is replaced.)
2. **Door classification ("Receiving as"):** header-level (per carton) or active-row-level? It is carton-scoped today (`IntakeClassifyRow`).
3. **Controller merge shape:** fold `useUnmatchedItems` into `useReceivingLineCore` + an `unmatched` layer, or keep it as a sibling layer selected by `source`? (Prefer the former — one core, mode layer, per the god-component cleanup SoT.)
4. **`shouldUseUnmatchedItemsSurface` fate:** demote from surface-switch to source-classifier, or delete once the controller owns source resolution.

## Related

- God-component cleanup of `PoLinesAccordion` (thin shell + `usePoLinesData` + `usePoLineItemDescriptionEditor` + `PoLineRow`) — the prerequisite that makes the accordion a viable single surface.
- Memory: `returned-serial-unbox-autolink`, `receive-to-prepack-pair-link-decouple`, `returns-receiving-order-unification`, `unbox-scan-modes-local-first`.
