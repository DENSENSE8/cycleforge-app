# Unbox rework — lane index

**Date:** 2026-07-31 · `main` @ `1c226847d`

Four lanes. A, C, and the capture-stack foundation run in parallel; **B is the restructure and lands last.**

| Lane | Scope | Plan | Prompt |
|---|---|---|---|
| **Foundation** | `CaptureStack` primitive (P0 dead-tail, P1 promote) | [capture-stack](./unbox-capture-stack-PLAN.md) | [P0+P1](./unbox-capture-stack-P0-P1-EXECUTION-PROMPT.md) |
| **A** | Two-row station identity header | [A](./unbox-A-identity-density-PLAN.md) | [A](./unbox-A-identity-density-EXECUTION-PROMPT.md) |
| **C** | Per-PO / per-item labels + notes | [C](./unbox-C-label-note-grain-PLAN.md) | [C](./unbox-C-label-note-grain-EXECUTION-PROMPT.md) |
| **B** | Step procedure + Playwright | [B](./unbox-B-step-procedure-PLAN.md) | [B](./unbox-B-step-procedure-EXECUTION-PROMPT.md) |
| **D** | Canvas Procedure lens (`/studio`) | [D](./unbox-D-canvas-procedure-PLAN.md) | [D](./unbox-D-canvas-procedure-EXECUTION-PROMPT.md) |
| **E** | Tab strip → right details panel | [E](./unbox-E-tabs-to-right-rail-PLAN.md) | [E](./unbox-E-tabs-to-right-rail-EXECUTION-PROMPT.md) |
| **F** | DS primitive motion bridge (reduced-motion) | [F](./unbox-F-motion-bridge-PLAN.md) | [F](./unbox-F-motion-bridge-EXECUTION-PROMPT.md) |

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

Lane D is fully independent — it owns `/studio`, A/B/C own `/unbox`. It can start immediately and in parallel with all three.

**`LineEditPanel.tsx` is lane B's alone.** A and C mount through their own components; neither restructures the panel. That is what makes them parallel-safe.

## Sequencing

```
Foundation P0 → P1 ─┐
A ──────────────────┼→ B (P2 read-only → bench trial → P3 restructure → P4+)
C ──────────────────┘
```

A and C are additive and can land in any order. B Phase 3 moves capture out of the accordion and restructures the panel — anything landing after it rebases onto a moving target.

**Lane E is the exception: it shares `LineEditPanel.tsx` with B, so E and B can never run at once.** Run **E before B Phase 3** — E is a pure relocation, it shrinks the panel before B restructures it, and it ships the simplified center immediately.

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
| 4 | C | Is the per-item note the same string as the item label face? | **Open** |
| 5 | A | Density variant name | Decided in-lane |
| — | all | All stations migrate onto the capture stack | **Answered: yes** |

Only decision 4 remains open; it blocks lane C's implementation, not its start.

## Standing rules for every lane

- `npm run verify` green per phase. **Never raise a ratchet baseline** — baselines only shrink.
- Dev server on **`:3050`** — attach; never start, restart, or kill it.
- E2E on the **QA org** (`qa-desktop`), never the dogfood tenant.
- Motion from `motion-framer.ts` through `useMotionPresence` / `useMotionTransition`. **No GSAP / `motion/react` / Moti** — `motion-major.guard.test.ts` fails CI.
- Commit only when asked; stage only your own files — sessions share this tree.
