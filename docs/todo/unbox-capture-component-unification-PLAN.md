# Unbox capture unification — phased build PLAN

> **Paste this whole file as the first message to a fresh session.** Self-contained.
> Companion docs: the implementation
> [`unbox-capture-component-unification-HANDOFF.md`](unbox-capture-component-unification-HANDOFF.md)
> (ground-truth fork points) and the industry-benchmark
> [`unbox-capture-component-unification-GEMINI-RESEARCH-BRIEFING.md`](unbox-capture-component-unification-GEMINI-RESEARCH-BRIEFING.md)
> (Discord/WMS comparable + the D1–D8 verdicts this plan operationalizes).

---

## Goal (one line)

For each capture concern — **serial · condition · item photos** — the **bottom
dock** (Band 1) and the **in-line capture row** must render the **same exact
component**, composed once (as **photos already does**). De-fork the other two;
**simplify** the dock's per-concern control down to a thin `ItemPhotoDockControl`-
shaped context→props mapper.

This is a **de-fork + compose** refactor, not a feature. It obeys the dual-loci
law (**dock = input / wedge; in-line row = state visualizer / mouse go-back**):
same *component*, single *wedge & scan-sink owner*.

---

## Decisions locked (do not re-litigate)

| Concern | Keeper | Retire from Unbox-dock path | Notes |
|---|---|---|---|
| **Item photos** | `ItemPhotoCaptureStrip` → `PhotoStepDockStrip` | — (already unified — **reference**) | Dock via thin `ItemPhotoDockControl`; in-line mounts the same strip |
| **Serial** | `SerialScanField` | `SerialCard` wrapper + `ReceivingUnitRows` explosion | Shared leaf already exists; the fork is the **wrapping** + the **multi-qty N-row explosion** |
| **Condition** | `ConditionPills` `collapsible={false} layout="barDistribute" labelVariant="full"` | the collapsed-Tags in-line variant | **DECIDED 2026-08-10 (operator): full condition pills in BOTH loci** — dock stays expanded, the in-line row becomes the full bar too |

**Condition grammar — the ruling.** Gemini D4 (always-expanded bar) was chosen
over the earlier handoff preference (collapsed-Tags in-line). Operator words:
*"display the full condition pills same from the inline rows but the bottom dock
should be expanded for this use case."* → one variant, full names, both loci.

---

## Corrections to Gemini's D3/D7 (consumer-verified 2026-08-10)

Gemini recommended deleting `SerialCard.tsx` and `ReceivingUnitRows.tsx`. **Both
are shared components with live consumers** and must NOT be deleted — retire only
their **Unbox-dock mount**, pinned by a guard (`pattern-evolution.md` §6).

| Component | Real consumers (non-test, non-docstring) | Verdict |
|---|---|---|
| `SerialCard` | `InlineSerialAdder`, `ReturnScanCard`, `MultiSkuBarcodeWorkspace`, `UnitsExplosionDisplay`, `StationWorkspaceSkeleton`, `UnboxSerialStepSurface` | Keep; retire the **Unbox-dock** use only |
| `ReceivingUnitRows` | `TestingUnitSlots`, `PoLineRow`, `PoLineUnitCaptureList`, `useUnboxLineController`, `ActiveLineConditionSerial`; **exports `ConditionBadge`** (imported by `SerialCard` + `TestingUnitSlots`) | Keep; retire the **Unbox-dock** mount only |

**Moving outline is in-line-only.** globals.css lights
`[data-capture-row][data-active-step=…] [data-capture-segment='serial|photos']` /
`[data-capture-condition]` (L785–788); the **dock carries no outline**. So the
serial dock de-fork does not touch it, and Gemini's D8 "port the marker to
`SerialScanField`" is a no-op. The only obligation: **keep the in-line
`data-capture-condition` / `data-capture-row` / `data-active-step` markers**.

---

## Sequencing

`P1` (serial single-qty) and `P2` (condition) are independent, low-risk de-forks —
**land together, dogfood once**. `P3` (serial multi-qty) is the risky one —
**gated behind P1 dogfood sign-off**. `P4` closes out.

```
P0 guard+markers ─┬─▶ P1 serial single-qty ─┐
                  └─▶ P2 condition full-bar ─┴─▶ dogfood ─▶ P3 multi-qty ─▶ P4 close-out
```

---

## Phase 0 — Guard scaffold + marker audit (no behavior change)

- **Goal:** land the anti-fork guard pinning **photos** (already unified) as the
  reference; record the marker contract so later phases can't silently break the
  outline.
- **Deliverables:**
  - `unbox-capture-shared-component.guard.test.ts` — asserts, per concern, that the
    dock slot and the in-line row reach the **same** component. Photos passes today
    (`ItemPhotoCaptureStrip` both loci); serial + condition assertions land as
    `.todo`, flipped on in P1/P2.
  - Test-header note pinning the globals.css contract (L785–788) + "dock has no
    outline."
- **Files:** new guard; read-only `active-step-ring.ts`, `styles/globals.css`.
- **Exit:** guard green (photos live); `npx tsc --noEmit` clean on the new file.

---

## Phase 1 — Serial single-qty de-fork (safe win)

- **Goal:** dock single-qty serial and the in-line row both render bare
  `SerialScanField`; retire the `SerialCard` wrapper from the dock.
- **Deliverables:**
  - `line-edit/steps/UnboxSerialStepSurface.tsx` single-qty branch (~L224–286):
    drop `SerialCard`; mount **`SerialScanField` directly** (`appearance="flush"`,
    `externalInputRef={c.serialRef}`, `autoFocusInput`, `focusKey={lineId}`,
    `onAdd`, `onReplaceSerial`, `onMarkNoSerial`, `noSerialActive`, `noSerialSlot`,
    `editingSerial`/`onEditingSerialChange`) + render `SerialMatchResult` as a
    **sibling** node (the one thing `SerialCard` added).
  - Wedge owner unchanged: keep the existing
    `useRegisterScanSink({ id: 'po-line:<lineId>' })` + autofocus in
    `UnboxSerialStepSurface`. In-line stays `autoFocusSerial={false}` (no competing
    sink).
- **Guards kept green:** `unbox-dock-one-shell` (SerialDockControl wrapper already
  carries `min-w-[80%]` — ≥80% serial dominance) · `po-line-capture-entry` (still
  one sink) · `per-unit-no-serial-ui` (waiver still the single `serial_absent`
  store via `NoSerialControl`) · `active-step-ring` (in-line untouched).
- **Guard extended:** serial (single-qty) both loci → `SerialScanField`;
  `UnboxSerialStepSurface` no longer imports `SerialCard`.
- **Exit:** dogfood single-qty Found carton — dock serial === in-line serial
  display; RETURN match still shows; wedge lands once; no-serial check works.

---

## Phase 2 — Condition full-bar in both loci (operator decision)

- **Goal:** both loci show the **full `barDistribute` `ConditionPills`** — one
  variant, no collapsed-Tags path.
- **Deliverables:**
  - `line-edit/PoLineCaptureRow.tsx`: swap the `ConditionPills` props from
    `collapsible startCollapsed expanded={condExpanded}…` →
    **`collapsible={false} layout="barDistribute" labelVariant="full"`**. Remove
    `condExpanded` state, hover-expand handlers, `data-capture-condition-expanded`,
    and the `condExpanded ? flex-1 : shrink-0` branch. **Keep** the
    `data-capture-condition` wrapper (outline) and `handleConditionPick`
    (grade → advance to serial).
  - `line-edit/terminal/unbox-tabs.tsx` `buildUnboxStepDock` (~L258–264): add
    **`labelVariant="full"`** so the dock bar is byte-identical to the in-line bar.
- **⚠ Primary risk (sign-off gate):** the in-line row is
  `[ condition bar │ serial (open, flex-1) │ photos ]` in an `h-11` band on the
  compressed center. Six **full-name** pills + an open serial field may not fit
  narrow widths (the overflow Gemini flagged in its own D8). Try `barDistribute`
  stretch + condition `shrink` w/ min + serial `flex-1 min-w`. **If full names
  overflow at the ~720 center floor, escalate to the user** (full names vs
  abbreviated `labelVariant="pill"`) — the operator asked for full pills; do not
  silently switch.
- **Guards kept green:** `active-step-ring` (wrapper kept) · `unbox-dock-one-shell`.
- **Guard extended:** condition both loci compose `ConditionPills` with the same
  `collapsible={false} layout="barDistribute" labelVariant="full"`; no
  `buildUnboxStepDock` variant fork remains.
- **Exit:** dogfood condition beat — dock === in-line; one-tap grade both places;
  row not overflowing (else → gate above).

---

## Phase 3 — Serial multi-qty convergence (gated, higher risk)

- **Goal:** the action floor never explodes into N unit rows (WMS single-sink
  law). Multi-qty dock uses the same **one `SerialScanField`** (N sequential
  scans); per-unit review lives in the in-line face + Units Displays.
- **Pre-check (before editing):** read `units-explosion.guard.test.ts` +
  `bulk-qty-display.guard.test.ts` and confirm they permit this (units browse in
  Displays, not on the floor). If either pins the floor explosion, this phase
  changes shape — surface first.
- **Deliverables:**
  - `UnboxSerialStepSurface.tsx`: remove the
    `if (isMultiQty) return <ReceivingUnitRows…/>` branch (~L154–222); multi-qty
    falls through to the single bare-field path.
  - Rollup/progress stays on in-line `PoLineUnitCaptureList` (`BulkQuantityPanel`
    for `qtyRollup`) + Units Displays.
  - **Do not delete** `ReceivingUnitRows.tsx`; retire only the dock mount.
- **⚠ Product consequence (sign-off gate):** per-unit **grade granularity leaves
  the action floor** — grade is line-level (condition bar) + `BulkQuantityPanel`
  split + Units Displays for per-unit. If a *different grade per individual unit
  from the floor* is a hard requirement, this phase needs a different design →
  flag before building.
- **Guards:** `units-explosion` · `bulk-qty-display` · `per-unit-no-serial-ui`
  green; guard: Unbox dock serial path no longer imports `ReceivingUnitRows`.
- **Exit:** dogfood a multi-qty carton — scan N serials sequentially into one
  floor field, field resets after each (no silent overwrite), rollup + Units
  Display correct.

---

## Phase 4 — Thin the dock controls, close retirement, SoT deltas

- **Goal:** serial/condition dock controls as thin as `ItemPhotoDockControl`;
  retirement pinned; docs updated.
- **Deliverables:**
  - Simplify `SlotDockControls` / `buildUnboxStepDock` to "mount shared component +
    flush frame." Keep `UnboxSerialStepSurface` only for the sink/match wiring it
    legitimately owns, or inline if trivial.
  - Anti-fork guard names surviving Unbox surfaces clean; `SerialCard` /
    `ReceivingUnitRows` remain for other lanes.
  - **SoT deltas (land with code):** `source-of-truth.md` → *Unbox centre (main)* /
    *Unbox dock flush floor* ("serial · condition · photos each have **one** shared
    capture component composed by both the dock slot and the in-line row — photos
    is the reference; dock and in-line never fork the same capture concern");
    `display/unbox-station.md` Layers table names the shared component per concern;
    one-line `pattern-evolution.md` note if warranted.
- **Exit:** `npm run verify` green; guard suite green; dogfood walk
  Serial → Condition → Photos shows identical components at each step, wedge once,
  moving outline tracks.

---

## Constraints — must NOT break (map in every phase)

- **Flush floor geometry** — Band 1 `h-11`, host `gap-0` / `items-stretch`,
  full-height abutting segments; serial dominance ≥80%; no soft pill; no
  co-mounted terminal + step studio (`unbox-dock-one-shell.guard.test.ts`).
- **Wedge / scan sink** — exactly ONE owner per `po-line:<lineId>`; dock owns while
  its step is active; in-line go-back editor does not autofocus or register a
  competing sink.
- **Moving outline (Phase 1)** — keep `data-capture-segment` /
  `data-capture-condition` / `data-capture-row` / `data-active-step` markers
  (`active-step-ring.guard.test.ts`).
- **Either-or dock registry** — `procedure-step-dock.guard.test.ts` +
  `scan-cockpit.guard.test.ts` stay green.
- **No-serial waiver** — single `serial_absent` store on either locus
  (`per-unit-no-serial-ui.guard.test.ts`).
- **Multi-qty / roll-up** — `units-explosion.guard.test.ts`,
  `bulk-qty-display.guard.test.ts`.

---

## Files (open before editing)

**Golden (photos — reference):** `line-edit/ItemPhotoCaptureStrip.tsx` ·
`line-edit/steps/dock/PhotoStepDockStrip.tsx` ·
`line-edit/steps/dock/ItemPhotoDockControl.tsx`.

**Serial:** `SerialScanField.tsx` *(keeper leaf)* ·
`line-edit/steps/UnboxSerialStepSurface.tsx` *(dock fork origin)* ·
`SerialCard.tsx` *(keep; retire dock use)* · `ReceivingUnitRows.tsx` *(keep; retire
dock mount)* · `line-edit/PoLineUnitCaptureList.tsx` *(in-line multi-qty)*.

**Condition:** `ConditionPills.tsx`.

**Row + wiring:** `line-edit/PoLineCaptureRow.tsx` ·
`line-edit/ActiveLineConditionSerial.tsx` ·
`line-edit/steps/dock/SlotDockControls.tsx` ·
`line-edit/steps/dock/index.ts` ·
`line-edit/terminal/unbox-tabs.tsx` → `buildUnboxStepDock` (~L240–271, the fork
origin).

**Law + guards:** `.claude/rules/pattern-evolution.md` ·
`.claude/rules/display/unbox-station.md` ·
`.claude/rules/display/station-workbench.md` · `.claude/rules/source-of-truth.md`
→ *Unbox centre (main)* / *Unbox dock flush floor* / *Active-step outline*.

---

## Verify (every phase)

- `npx tsx --test` on the new guard + `unbox-dock-one-shell` ·
  `procedure-step-dock` · `scan-cockpit` · `active-step-ring` ·
  `po-line-capture-entry` · `po-line-flat-chrome` · `units-explosion` ·
  `bulk-qty-display` · `per-unit-no-serial-ui`.
- `npx tsc --noEmit -p tsconfig.json` — 0 errors on touched files (report
  pre-existing red from concurrent lanes separately; never inherit or raise a
  baseline).
- `npm run verify` before calling it done.
- **Dogfood on `:3050` (attach, never start):** open a Found carton, walk
  Serial → Condition → Photos, confirm the dock Band 1 and the in-line row show the
  **identical** component at each step, the wedge lands once, and the moving
  outline still tracks.

---

## Open sign-off gates (surface before building past them)

1. **Phase 2 in-line width** — full condition names vs abbreviated fallback if the
   six-pill bar overflows the compressed in-line row at the ~720 center floor.
2. **Phase 3 per-unit grade** — confirm dropping per-unit grade *from the action
   floor* (moving it to BulkQuantityPanel split + Units Displays) is acceptable.

---

## Out of scope / do not touch

- The moving-outline *behavior* (only preserve markers).
- The KNOW cockpit rail (`railLeaf`) / Displays leaves.
- Re-timing / re-theming the two-band dock floor.
- Deleting `SerialCard` / `ReceivingUnitRows` (other consumers) — retire the dock
  path only.
- Porting to Testing / Arrival (separate port, after Unbox dogfood sign-off).
