# Plan C — Label + note grain (per-PO vs per-item)

**Lane:** C · runs in parallel with A and B · **must land before B Phase 3**
**Surface:** label previews + note composers
**Date:** 2026-07-31 · `main` @ `1c226847d`

---

## Goal

Make the **grain** of labels and notes legible and complete:

| Grain | Label | Note |
|---|---|---|
| **PO / carton** | one label for the whole receipt | one note for the whole receipt |
| **Item / line** | one label per item | one note per item |

Today the machinery for both grains partly exists but is not presented as a grain choice, so an operator cannot reliably tell which one they are printing or writing.

---

## What already exists — read before designing

### Labels: the kind system is real

- `WorkspaceLabelKind` + `resolveActiveLabelKind` + `labelOptionsForSelect` + `workspaceLabelToFace`, wired in `useUnboxLineController.ts:406-426`.
- Default is `'carton'` (`:408`, re-seeded `:410`).
- The dock split-CTA already exposes kind selection: `labelSelectOptions` / `selectedLabelKind` / `activeLabelKind` / `printKind` (`LineEditPanel.tsx:348-353`).
- Face SoT is `src/lib/print/labelFace.ts` (`LabelFaceModel`). Preview components: `ReceivingPoLabelPreview`, `ReceivingProductLabelPreview`, `UnboxLabelPreview`, `LineLabelPreviewCard`, `WorkspaceLabelPreviewCard`.

**So do not build a new label system.** The work is: make the two grains explicit in the UI, ensure a per-item label exists for every item, and ensure the preview always shows the kind actually being printed.

### Notes: four fields already exist — the problem is grain legibility, not storage

| Field | Grain | Purpose |
|---|---|---|
| `receiving.zoho_notes` | PO header | the synced overall PO note (`schema.ts:1152`) |
| `receiving.support_notes` | carton | carton-level support / ops notes (`schema.ts:1149`) |
| `receiving_lines.notes` | line | **the durable label buffer** — composes the printed face *and* is the saved note |
| `receiving_lines.zoho_notes` | line | per-line item description |

`receiving_lines.notes` is doing **two jobs at once** (label content + operator note), documented in `WorkspaceNotesCard.tsx:11-16`. That conflation is the real defect in this lane.

**Do not add a fifth note field before resolving whether the label buffer and the item note should be separate.** That is the central design question here, and it is **Ask-first** — `receiving_lines.notes` is live data with printed history.

---

## The design questions this lane must answer

1. **Is the per-item note the same string as the per-item label face?** Today: yes, one buffer. If an operator wants a note that does *not* print, the current model cannot express it. Decide before building.
2. **Where does each grain compose?** Recommendation: PO-grain note + PO label live at the **carton** level (the PO note tab / carton label); item-grain note + item label live on the **item row** in the record plane (lane A's row 2 / the right details panel), never in the capture stack.
3. **Does every item get a label by default, or on demand?** Multi-qty lines mean N items under one line — printing N labels silently is a paper-waste failure mode.

---

## Composition rules

- **Label face resolves through `labelFace.ts` only.** Never hand-build a face object; never inline a label layout. (`docs` memory: Label face SoT.)
- **Printing is user-action-scoped and lazily imported** — `await import('@/lib/print/printLabel')`. `bwip-js` is ~250 KB gz and must never reach a station bundle at module top-level (`.claude/rules/build-gotchas.md` → bundle altitude).
- **The note composer is `StationComposerDock`** (`source-of-truth.md` → Station composer dock). Do not hand-roll a second note surface. Enter commits; blur saves.
- **Honest absence** — a missing note renders `—` via the ledger fallback, never `"N/A"`.
- **Printed media is exempt from the type weight cap** (`lib/print/**`) — do not "fix" label typography to match screen rules.

## Out of scope

- The step machine and photo capture → **lane B**.
- Identity header rows → **lane A**.
- Any change to `receiving_lines.notes` semantics without an explicit decision on question 1.
- New note fields (blocked on question 1).

## Verification

- `npm run verify` green; no baseline raised.
- Printing a carton label and an item label from the same carton produces two visibly distinct faces, each matching its preview.
- `receiving-silent-print.spec.ts` and `receiving-zoho-notes-price.spec.ts` still pass; extend rather than orphan them.
- Bundle check: no new top-level `bwip-js` import reachable from a station route (`pnpm lighthouse:audit` if in doubt).
