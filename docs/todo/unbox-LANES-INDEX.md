# Unbox rework — lane index

**Date:** 2026-07-31 · `main` @ `1c226847d`

Four lanes. A, C, and the capture-stack foundation run in parallel; **B is the restructure and lands last.**

| Lane | Scope | Plan | Prompt |
|---|---|---|---|


Sibling-pattern survey (what else shares these defects): [`unbox-SIBLING-PATTERNS.md`](./unbox-SIBLING-PATTERNS.md).

Research basis: [`unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md`](./unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md).

## File ownership — no two lanes touch the same file

| Lane | Owns |
|---|---|
| Foundation | `components/mobile/feed/**` → `design-system/components/capture-stack/**`; `sidebar/receiving/useSerialScan.ts` |
| A | `station/entity-context/**`; `line-edit/LineCartonContextSection.tsx` |
| C | `print/**`; `*LabelPreview*`; `LineNotesCard` / `WorkspaceNotesCard` / `LinePoNoteCard` |
| B | capture-stack step machine; `photos/stages.ts` + `photo-intent.ts`; `LineEditPanel.tsx`; `tests/e2e/**` |
| D | `components/studio/**`; `lib/stations/contract.ts` + `data-sources.ts` + `actions.ts`; `app/studio/**` |
| E2 | `UnboxPushColumn.tsx`; `ReceivingDisplaysPushStack.tsx`; `line-edit/unbox-side-tabs.ts`; `line-edit/terminal/unbox-tabs.tsx` — **plus `LineEditPanel.tsx`, which is why it cannot run beside B** |

Lane D is fully independent — it owns `/studio`, A/B/C own `/unbox`. It can start immediately and in parallel with all three.

**`LineEditPanel.tsx` is lane B's alone.** A and C mount through their own components; neither restructures the panel. That is what makes them parallel-safe.

## Sequencing

```
Foundation P0 → P1 ─┐
A ──────────────────┼→ B (P2 read-only → bench trial → P3 restructure → P4+)
C ──────────────────┘
```

A and C are additive and can land in any order. B Phase 3 moves capture out of the accordion and restructures the panel — anything landing after it rebases onto a moving target.


```
Foundation P0 → P1 ─┐
A ──────────────────┼→ E ─→ B (P2 → bench trial → P3 → P4+)
C ──────────────────┘
D ─────────────────────────────────────────  (independent, /studio)
```

## Blocking decisions

| # | Lane | Question | Status |
|---|---|---|---|
| 1 | B | "Packing material" — fold into `unbox_carton`, or add a stage? | **DECIDED: fold into `unbox_carton`.** No new stage, no schema change. `arrival_package` stays untouched — it gates receive. |
| 2 | B | Desktop item camera (`unbox_item`) does not exist. In scope? | **DECIDED (operator, 2026-08-01): no desktop CAMERA — desktop is upload-from-computer.** The phone keeps the existing capture components as *the* capture device; the desktop step card gets a `+` control that uploads files from the computer, scoped to that step's stage. Mechanically this is still `ReceivingPhotoButton` with `receivingLineId` + `photoStage="unbox_item"` (`:5-8, 88-93`) — the mode exists, no call site uses it — but the affordance is upload, not a viewfinder. Scope is smaller than Plan B assumed; update Plan B §B1. |
| 3 | B | Feed accumulates per carton or per shift? | **DECIDED: per carton.** Ledger clears on carton open; cross-carton history stays in the recent rail + `EventTimeline`. Keeps `station.md` §5 act-and-clear intact and bounds the scroll region. |
| 4 | C | Is the per-item note the same string as the item label face? | **DECIDED (operator, 2026-08-01): SEPARATE, per line item — and lane C shipped it.** `receiving_line.notes` is the operator's item note and **never prints**; `receiving_line.label_note` is the printed face center. Migration `2026-07-31b_receiving_lines_label_note.sql` is **applied**, backfilled `label_note := notes` (331/331 faces, 0 drift), so pre-split cartons reprint an identical face. The split stays at LINE grain — never hoist `label_note` to the carton, or every line on a multi-line PO prints the same face. Law: `source-of-truth.md` → Note vs label grain; guard: `label-note-grain.guard.test.ts`. |
| 5 | A | Density variant name | Decided in-lane |
| — | all | All stations migrate onto the capture stack | **Answered: yes** |

**No blocking decisions remain open.** Lane C is shipped (note/label grain split + label-kind
grain in the picker); A, B, D, E sequence as above.

## Standing rules for every lane

- `npm run verify` green per phase. **Never raise a ratchet baseline** — baselines only shrink.
- Dev server on **`:3050`** — attach; never start, restart, or kill it.
- E2E on the **QA org** (`qa-desktop`), never the dogfood tenant.
- Motion from `motion-framer.ts` through `useMotionPresence` / `useMotionTransition`. **No GSAP / `motion/react` / Moti** — `motion-major.guard.test.ts` fails CI.
- Commit only when asked; stage only your own files — sessions share this tree.
