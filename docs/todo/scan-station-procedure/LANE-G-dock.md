# Lane G — the bottom dock, as a declared display region

**Index:** [`INDEX.md`](./INDEX.md) · inherits **S1 · S4 · S5 · S6**
**Owns:** `src/lib/station-terminal/**` · `src/design-system/primitives/SlicedActionDock.tsx` ·
`OmnichannelComposerDock.tsx` · `src/components/station/terminal/**` ·
`line-edit/UnboxStepDock.tsx` and the per-station dock registries
**Starts after:** A-1 (needs the dock fields) · **Blocks:** E-3 (dock authoring)

---

## The job

The bottom dock is the only chrome on a scan bench the operator's hand never leaves. Today
it is **three things stacked, assembled by hand in one panel file, per station**:

```
┌─ the dock, as it actually is on Unbox ─────────────────────────────┐
│  {terminalVm.disabledReason}          ← optional amber line        │
│  <UnboxStepDock/>                     ← the ACTIVE STEP's action   │  ← new 2026-08-02
│  <UnboxProcedurePager/>               ← prev / next step chips     │
│  ┌─ OmnichannelComposerDock ───────────────────────────────────┐   │
│  │  notes textarea → receiving_line.notes                      │   │
│  │  [+] … [sync]              [ ▾ | 🖨 Receive ]                │   │  ← StationTerminalDock embedded
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

Every other lane treats this band as a fixed backdrop. It is not: it is a **display region
with per-station and per-step composition**, and nothing declares it. `LineEditPanel`
assembles it in JSX; `STATION_TERMINAL_REGISTRY` declares only the trailing CTA's *kind*;
the notes composer is hardcoded to `receiving_line.notes`; the pager and step action are
Unbox components mounted by name.

That is why a second station cannot get this band for free — which is the INDEX §6
acceptance test. **This lane makes the dock declared, so it can be rendered generically and
later authored in Studio.**

---

## Why this is its own lane and not a section of B or E

- **B owns the deck's geometry**; the dock is the *other* half of the same vertical
  contract (S4: the card reads, the dock acts). They meet at exactly one number — the
  scroll clearance — and that number is B's. Everything else about the band is disjoint.
- **E authors it**; it cannot author a region nobody has declared. G is the declaration.
- The dock is also the one region with a **hard safety property** neither of them owns: the
  trailing terminal is the commit, and it must never move, re-label, or animate.

---

## G-1 — declare the dock

Four zones, named once, with their scope. The scope column is the whole rule:

| Zone | Scope | May change with the step? |
|---|---|---|
| **notice** | the carton | no — `disabledReason` only |
| **leading (step action)** | the **active step** | **yes** — that is its job |
| **pager** | the procedure | position only |
| **composer** | the record | placeholder may name the step; **its write target may not** |
| **trailing (terminal)** | the carton / the commit | **never** |

```ts
// station-terminal/types.ts — the shape G adds
interface StationDockDef {
  /** Which zones this station's dock mounts, in order. */
  zones: readonly DockZoneId[];
  /** Where the step-action zone gets its controls (per-station registry id). */
  stepActions: string | null;
  /** The composer's single write target, or null for a dock with no composer. */
  composer: { target: 'line.notes' | 'carton.support_notes' | null };
  /** Trailing CTA kind resolution — the existing ModeTerminalSliceDef, unchanged. */
  terminal: ModeTerminalSliceDef;
  /** Scroll clearance variant the host must reserve (B owns the values). */
  clearance: 'default' | 'pager' | 'step-action';
}
```

**The `clearance` field is the point of the whole declaration.** A dock row with no
matching clearance is not a cosmetic bug: the deck's peek slides under the band, and it
shipped exactly that way once as a 4px overlap that only a measurement caught. Declaring
the zones and the clearance **in one object** makes the pair impossible to change
independently — the same coupling discipline as
`unbox-procedure-checklist-coupling.guard.test.ts`.

### Guard

`station-dock-declaration.guard.test.ts` — every station that mounts a dock has a
`StationDockDef`; `zones` and `clearance` agree (a dock with `step-action` in `zones` must
not declare `clearance: 'pager'`); a station declaring `stepActions` has a registered
control map.

---

## G-2 — one dock renderer, N stations

`LineEditPanel` currently hand-assembles the band. Extract `StationDock`, which takes the
declaration plus the station's slots and renders the zones in order. Unbox becomes its first
consumer with **no visual change** — that is the acceptance test for the extraction.

**What must NOT be generalised away:**

- **The composer is ONE shell.** `OmnichannelComposerDock` already serves Unbox carton
  notes *and* every Support ticket reply. It is not Station property — it was renamed off
  `StationComposerDock` for exactly that reason. A second amber sticky composer beside it
  is already banned.
- **The trailing CTA rides INSIDE the composer footer** (`trailingAction`), not as a second
  dock row. One elevated shell per band. `SlicedActionDock embedded` renders only the pill
  track for this.
- **Enter in the composer commits the primary action.** That binding is load-bearing at a
  bench and survives the extraction.

### SoT delta (hand to F)

> A station's bottom dock is DECLARED (`StationDockDef`), not assembled in its panel file.
> The declaration names the zones, the composer's single write target, and the scroll
> clearance the host must reserve — zones and clearance travel together, because a dock row
> without its clearance puts the work surface under the band.

---

## G-3 — per-step editing of the dock (the operator's ask)

> *"ensuring that the bottom dock is included in the display as well for editing per scan
> stations and steps"*

Two different edits, and conflating them is how this goes wrong:

### (a) Per-step — which control the leading zone shows

Already built for Unbox (`UNBOX_STEP_DOCK_CONTROLS`, 2026-08-02) and already declared per
step in A-1 (`evidence`). What G adds is that the **binding is data**: a step names its dock
control by id, the station's control map resolves the id to a component. Today the map is
keyed on the step key directly, which works for one station and quietly assumes every
station's `condition` step wants the same control.

**Not every step has an action, and that absence stays declared**
(`UNBOX_STEPS_WITHOUT_DOCK_ACTION`, with a reason per entry). The dock band renders
*nothing* for those — never a disabled button. A step in neither map fails CI.

### (b) Per-station — which zones exist, and what the composer writes

This is the part that does not exist at all. Testing has no notes composer bound to a line;
Pack has no sticky dock by design; Shipping's dock is scan-driven with `none` on its active
tabs. Those are three *different dock shapes* and today each is a bespoke assembly.

`StationDockDef` makes them three declarations. **Pack's "no dock" becomes a declaration
(`zones: []`) rather than an absence** — which is the difference between a deliberate choice
and something nobody got to yet.

### The line

> **An org may author WHICH zones a station's dock mounts and WHICH control a step shows.
> It may never author what the composer WRITES, and it may never author the terminal.**

The composer's write target is a **grain** decision, not a layout one:
`receiving_line.notes` is the operator's item note and `label_note` is the printed face —
they were one column until a migration split them, precisely because one buffer doing both
jobs meant an operator could not record anything without it appearing on the sticker. An
authoring UI that lets an owner re-point the composer re-creates that by configuration.

The terminal is the **commit**. An authorable commit is an authorable state machine.

---

## G-4 — the notice zone, and saying *why* early

`disabledReason` renders as one amber line above the composer, and it is the only thing
that tells an operator why Receive is blocked. Two upgrades, both cheap and both
correctness rather than polish:

1. **A skip must say what it costs at the point of skipping** (S3 / Lane D). If the org
   requires an arrival photo, waiving that step leaves receive blocked — the operator must
   learn that when they waive, not at the end of the carton. The notice zone is where.
2. **`disabledReason` is currently right-aligned prose with no anchor.** It names a
   blocking condition that usually belongs to a *specific step*. Carry the step key so the
   surface can point at it — the checklist row, the deck card — rather than making the
   operator hunt.

---

## Requests to other lanes

- **A (A-1):** a step's dock-control **id** as a declared field, so the binding is data
  rather than a key-collision between stations.
- **B:** clearance values stay B's; G stores only the variant *name*. G must never define a
  `pb-*`.
- **D:** the blocking-condition payload behind G-4 — G renders it, D computes it.
- **E:** dock authoring (G-3b) is an E-3 surface. G ships the declaration; E ships the
  editor and the publish-time diagnostics (a station authored with a step-action zone and
  no control map is an un-actionable bench).
- **F:** merge G's two SoT deltas; own `station-dock-declaration.guard.test.ts` if it ends
  up spanning lanes.

---

## Do not re-open

- **The trailing terminal never re-labels with the step** — it is the carton's commit, and
  "Receive" must mean the same thing on every step. The leading zone is step-scoped
  precisely so the trailing one does not have to be.
- **One note target.** The placeholder may name the step; the column it writes may not. A
  step-scoped note store is forbidden.
- **The trailing terminal never animates.** It is the one thing on screen that must not
  move while a hand is going for it.
- **No second sticky composer** beside `OmnichannelComposerDock`.
- **A dock control hands focus back** (`receiving-focus-scan`, 60ms) — S5.
- **Pack's terminal exemption is deliberate**, not a gap: it has no sticky dock and
  `zones: []` records that.
