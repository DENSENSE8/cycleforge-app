# Instrument panel — the procedure-cockpit sub-identity

**A Cycle Forge operator surface is a mission-control instrument panel, not a document and not a
chat app** — chrome that reads live facts back to someone whose hands are on product.

This is a **sub-identity of Kinetic Ledger** ([`../kinetic-ledger.md`](../../../.claude/rules/kinetic-ledger.md)), not a
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
| **P2** | Procedure is the product | "What step am I on?" | **`ProcedureDeck` is the hero centre surface** — checklist map on the edge + ring entry; step advance is **immediate** (content crossfade only) |
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
| Centre work surface | `ProcedureDeck` (`@/design-system/components/procedure`) | **Primary, most prominent region** on the bench. Step advance is **immediate** — content crossfade only, no layout motion (`ProcedureDeck.tsx:10`). Law: [`../source-of-truth.md`](../source-of-truth.md) → Scan-station procedure focus deck · [`station-workbench.md`](station-workbench.md) |
| Edge map | `ProcedureChecklist` (same barrel) | A **display the operator picks**, never a pinned region |
| Progress chrome | `ScanStationProgressControl` + `ScanStationProgressRing` | Under the dock, Band 2 right (`UnboxDockHost.progress`); opens the Checklist Displays leaf; closed Displays via `←|` |
| Inspector body facts | `OrderFactList` / `OrderFactRow` (`@/components/order-record`) | [`right-rail-inspector.md`](right-rail-inspector.md) → Body |
| Inspector header | `PaneHeader` blocks / `DeskRailChromeRow` (+ Unbox Displays plate on desk `detail:order`) | Eyebrow + short key; no hero title |

Registered in [`src/design-system/DESIGN_SYSTEM.md`](../../../src/design-system/DESIGN_SYSTEM.md)
→ *Procedure & scan progress*.

---

## Metaphor translation — what "Iron Man" actually becomes

The metaphor is a **reasoning aid, not a style target**. Each tempting move below fails a house law;
the third column is what ships instead.

| Tempting move | Why it fails here | Correct expression |
|---|---|---|
| Glowing circular HUD with numerals | Second visual language; fights `floor` density | Bare 16px slate ring, **no numeral inside** |
| Holographic card stacks | The card-soup ban | Flat focus deck — every step a full face, one expanded body, immediate advance |
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
| Name a `motionRole.*` for the motion you do keep | Wire `procedure.advance` / `layout` / `layoutId` onto the deck — the role is deferred and the deck is flat |
| Let the wedge own focus — re-dispatch after any click | Ship an `autoFocus` or a `.focus()` on procedure chrome |
| Treat `skipped` as a waiver | Render `skipped` with a check mark |
| Open the checklist from the under-dock ring or its Root Index leaf | Mount the ring on a Displays `rightSlot`, or add a Lucide checklist strip cell |

---

## Motion on a bench — immediate by default

A scan bench is **immediate**. Two roles survive, and both are *acknowledgement*, not travel:

| Role | Dur | Why it stays |
|---|---|---|
| `swap.scan` | 0.12s, **exit `duration: 0`** | The carton actually changed. The zero exit is the station-cadence contract — a `wait`-mode crossfade cost ~0.6s of empty canvas per scan. |
| `feedback.pulse` | 0.15s | The surface confirming a scan registered (P6). Removing it takes away the confirmation, not the delay. |

**Immediate means no TRAVEL, not no ACKNOWLEDGEMENT.** Deleting the pulse in the name of speed
removes the only signal that the wedge landed — which is the failure P6 exists to prevent.

`procedure.advance` (0.55s) is **deferred and unused**; the deck is flat and advances by content
crossfade. `push.rail` (0.24s) is legal only on an explicit operator toggle. `gesture.press` and
`swap.focus` on scan-adjacent surfaces are open review items — both are pointer-shaped physics on a
surface with no pointer.

---

## Anti-patterns (each has a real incident behind it)

- **Multi-column fact grids on Displays Information.** A 3×N label-above-value
  grid on Inventory Information (2026-08-08) broke WMS muscle memory — operators
  read facts as **stacked horizontal rows** (label start · value end), not a
  card grid. Compose `StationDenseFactStrip layout="rows"`; never `grid-cols-*`
  / `layout="strip"` inside a Displays leaf.
- **Inventory Information golden (SoT).** Unbox Displays → Inventory →
  Information is `InventoryPoHeader` `variant="instrument"` over
  `StationDenseFactStrip layout="rows"` (PO # · status chip · total · vendor ·
  dates · Last pulled). Sibling stations compose the same strip — never a
  page-local fact twin. Mutators (Refresh · Save) live in
  `setLeafTrailing` on the sticky leaf header, not under the facts.
- **Gray canvas/sunken wash behind Displays Information facts.** Read telemetry
  sits on the white Displays card (hairlines only). A full-bleed
  `bg-surface-canvas` or `bg-surface-sunken` block behind PO # / Status / Total
  rows is debt — sunken depth-indent is exclusive to `DenseComposeBodyBand`
  (notes · ticket/claim create/edit).
- **A third right-edge grammar.** Exactly two exist — app push column (`RightRailHost`) and station
  push column (`StationDisplaysPushColumn`). An always-on procedure region was built and retired within a day.
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
