# Instrument panel — the procedure-cockpit sub-identity

**A Cycle Forge operator surface is a mission-control instrument panel, not a document and not a
chat app** — chrome that reads live facts back to someone whose hands are on product.

This is a **sub-identity of Kinetic Ledger** ([`../kinetic-ledger.md`](../kinetic-ledger.md)), not a
second visual language. Every rule here resolves through existing semantic tokens, the three type
cuts, and the four region contracts. It adds **no** new palette, no fourth typeface, and no new
right-edge grammar.

Ratified 2026-08-02 from
[`engineering-instrument-panel-UX-GEMINI-RESEARCH-BRIEFING.md`](../../../docs/todo/engineering-instrument-panel-UX-GEMINI-RESEARCH-BRIEFING.md).

**Applies to:** Station procedure cockpits (Unbox golden; Testing / Triage port targets), the
Station Displays push column, and right-rail record inspectors. **Does not apply to** Monitor
rollups or Canvas.

---

## The seven principles

| # | Principle | Operator question | Chrome expression |
|---|---|---|---|
| **P1** | State is telemetry | "What is true right now?" | Chips, rings, step faces bound to server / realtime evidence |
| **P2** | Procedure is the product | "What step am I on?" | **`ProcedureDeck` is the hero centre surface** — checklist map on the edge + ring entry; slow layout feedback on advance |
| **P3** | Identifiers are instruments | "Can I retype this serial?" | Mono + `CopyChip`; end-aligned in grids |
| **P4** | Headers are labels, not stories | "What subsystem am I in?" | Eyebrow + short truncated key |
| **P5** | One commit per beat | "What advances the work?" | Terminal dock / step composer — never competing primaries |
| **P6** | Live or silent | "Did my scan land?" | Realtime-subscribed checklist; a laggy display is worse than none |
| **P7** | Calm instrument stroke | "Procedure, or my daily goal?" | Slate progress ring — **not** `GoalRing` semantic hues |

**P6 is the one that fails silently.** A display that lags a scan is worse than no display, because
the operator trusts it and re-shoots the photo. That is why the procedure hook subscribes to the
carton's photo realtime channel — a capture taken on the **phone** must appear on the bench without
a refocus.

---

## Composition map — job → module

| Job | Module | Law |
|---|---|---|
| Derived step vocabulary | `deriveProcedureSteps` (per station) | Never hardcode the step list — it varies by unfound / pickup / return / multi-qty |
| Which step is active | `resolveActiveStep` (`src/lib/receiving/procedure-pointer.ts`) | One pointer, shared with the receipt read model |
| Single derivation (Unbox) | `useUnboxProcedureSteps` | Both views read this; never a second computation |
| Ephemeral focus | `src/lib/receiving/procedure-focus-store.ts` | Carton-keyed, never a URL param — Station selection is ephemeral |
| Centre work surface | `ProcedureDeck` (`@/design-system/components/procedure`) | **Primary, most prominent region** on the bench. Slow layout settle on step advance: `motionRole.procedure.advance`. Law: [`../source-of-truth.md`](../source-of-truth.md) → Scan-station procedure focus deck · [`station-workbench.md`](station-workbench.md) |
| Edge map | `ProcedureChecklist` (same barrel) | A **display the operator picks**, never a pinned region |
| Progress chrome | `ScanStationProgressControl` + `ScanStationProgressRing` | Dock-anchored under the terminal, open or closed |
| Inspector body facts | `OrderFactList` / `OrderFactRow` (`@/components/order-record`) | [`right-rail-inspector.md`](right-rail-inspector.md) → Body |
| Inspector header | `PaneHeader` blocks / `RecordPaneHeader` | Eyebrow + short key; no hero title |

Registered in [`src/design-system/DESIGN_SYSTEM.md`](../../../src/design-system/DESIGN_SYSTEM.md)
→ *Procedure & scan progress*.

---

## Metaphor translation — what "Iron Man" actually becomes

The metaphor is a **reasoning aid, not a style target**. Each tempting move below fails a house law;
the third column is what ships instead.

| Tempting move | Why it fails here | Correct expression |
|---|---|---|
| Glowing circular HUD with numerals | Second visual language; fights `floor` density | Bare 16px slate ring, **no numeral inside** |
| Holographic card stacks | The card-soup ban | Smart Stack focus deck — one readable card, slow layout settle on advance |
| Chat with the machine | Chat-primary is rejected for ops records | Grounded suggestion strip, **Workbench only** |
| Hand-checkable todo list | False completion; deleted 2026-08-01 | Evidence-derived step states |
| Hero product title in the header | Right-rail law | Eyebrow + short key; title in body fact rows |
| Always-visible procedure column | Would be a third right-edge grammar | Checklist as an operator-picked display, opened by the ring |
| Sci-fi monospace everywhere | Mono is for **retypable identifiers** only | `text-role-*` sans + `font-mono` on IDs |
| Neon arcs / faux-3D glass / decorative telemetry | Decoration untied to live state violates P1 | Nothing — cut it |

---

## Always / Never

| Always | Never |
|---|---|
| Bind every state mark to server or realtime evidence | Paint chrome from a client guess or a local tick |
| Keep ONE derivation behind however many views | Let a mirror surface compute its own answer |
| Put the active step adjacent to the control that commits it | Float the work surface at the top of an empty canvas |
| Render identifiers in mono, end-aligned, non-ligating | Set a serial in the sans cut, or let `fi`/`fl` ligate |
| Name a `motionRole.*` for procedure motion | Snap the deck pile in one frame on step advance, spring a push width, or animate layout outside `procedure.advance` |
| Let the wedge own focus — re-dispatch after any click | Ship an `autoFocus` or a `.focus()` on procedure chrome |
| Treat `skipped` as a waiver | Render `skipped` with a check mark |
| Keep the ring the ONLY checklist entry | Add a checklist cell to the Displays strip |

---

## Anti-patterns (each has a real incident behind it)

- **A third right-edge grammar.** Exactly two exist — app push column (`RightRailHost`) and station
  push column (`UnboxPushColumn`). An always-on procedure region was built and retired within a day.
  Full reasoning: [`../source-of-truth.md`](../source-of-truth.md) → Right-rail modality.
- **A second progress ring.** `GoalRing` is daily-goal pace in GlobalHeader; the scan ring is
  procedure completion at a bench. Copying one to the other's surface is the most-repeated mistake
  this file exists to stop.
- **Reserved height on a dynamic body.** A `min-h-*` floor renders as an empty white box at a bench,
  which reads as *"this step is broken"* — [`../ui-design-system.md`](../ui-design-system.md).
- **A nested scroll port.** One port per region; an operator with a scanner in one hand cannot be
  asked which of two scrollers they are in.

---

Indexed by [`../contextual-display.md`](../contextual-display.md)
