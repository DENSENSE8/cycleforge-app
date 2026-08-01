# EXECUTION PROMPT — Lane C · Label + note grain

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`docs/todo/unbox-C-label-note-grain-PLAN.md`](./unbox-C-label-note-grain-PLAN.md) — the plan wins on conflict.
> **Parallel lane:** C. Do not touch files owned by lane A (entity-context) or lane B (capture stack, photo intent, step machine).

---

# Cycle Forge — Lane C: per-PO and per-item labels and notes

You are Claude Code in the Cycle Forge monorepo. This lane makes label and note **grain** explicit. It is mostly composition — the machinery exists.

## Mission

An operator can print **a label for the PO/carton** and **a label per item**, and can write **a note on the PO/carton** and **a note per item**, with the surface always making clear which grain they are acting on.

## Read first

1. `docs/todo/unbox-C-label-note-grain-PLAN.md` — SoT for this run, especially the four existing note fields.
2. `src/lib/print/labelFace.ts` — the label face SoT.
3. `.claude/rules/build-gotchas.md` — bundle altitude; `bwip-js` must stay lazily imported.
4. `.claude/rules/source-of-truth.md` — Station composer dock; honest absence.

## STOP — one decision to get from the human first

**`receiving_lines.notes` currently does two jobs:** it is the durable operator note **and** the printed label content (`WorkspaceNotesCard.tsx:11-16`). So there is no way today to write an item note that does not print.

Ask: **should the per-item note and the per-item label face be the same string, or separate?**

- Same → this lane is pure UI grain work, no schema change.
- Separate → it needs a migration on live data with printed history. That is **Ask-first** and probably its own lane.

Do not guess, and do not add a fifth note field before this is answered.

## Build rules

- **Compose the existing label kind system.** `WorkspaceLabelKind`, `resolveActiveLabelKind`, `labelOptionsForSelect`, `workspaceLabelToFace` are already wired (`useUnboxLineController.ts:406-426`, default `'carton'`). Surface the grain; do not rebuild the system.
- **Every face resolves through `labelFace.ts`.** Never hand-build a face object or inline a label layout.
- **Keep print engines lazy** — `await import('@/lib/print/printLabel')` inside the user action. A top-level `bwip-js` import in anything a station bundle reaches is a regression (~250 KB gz).
- **Notes compose `StationComposerDock`** — no second note surface. Enter commits, blur saves.
- **Multi-qty:** decide and state whether N items print N labels automatically or on demand. Silent N-label printing is a paper-waste failure — default to on-demand unless told otherwise.
- **Honest absence:** missing note → `—`, never `"N/A"`.
- **Do not restyle printed labels to match screen type rules.** `lib/print/**` is deliberately exempt from the weight cap — different substrate.

## Do NOT

- Touch `CartonContextCard` / `StationContextBar` (**lane A**).
- Touch the capture stack, photo intent, or step machine (**lane B**).
- Change `receiving_lines.notes` semantics without the decision above.
- Raise any ratchet baseline.
- Start, restart, or kill the dev server. It runs on **`:3050`** — attach.

## Done when

- `npm run verify` green, no baseline raised.
- Printing a carton label and an item label from the same carton yields two visibly distinct faces, each matching its preview.
- `receiving-silent-print.spec.ts` and `receiving-zoho-notes-price.spec.ts` pass; extended, not orphaned.
- No new top-level `bwip-js` import reachable from a station route.

## Report back

1. The answer you got on the note/label-buffer question, and what you built as a result.
2. The grain map you shipped: which surface owns PO-note, item-note, PO-label, item-label.
3. Your multi-qty printing decision.
4. Anything in the plan you believe is wrong.

Commit only when asked. Stage only files you changed.
