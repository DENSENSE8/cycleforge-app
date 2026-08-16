# Unbox capture — unify the dock and the in-line row on ONE component set

> **Paste this whole file as the first message to a fresh session.** It is a
> self-contained handoff. Read the SoT files it names before editing.

---

## Goal (one line)

For each capture concern (**serial · condition · item photos**), the **bottom
dock** (Band 1) and the **in-line capture row** must render the **same exact
component**, composed once — not two different displays for the same job.
**Simplify** while doing it: retire the forked/older component, keep the one the
in-line row already uses (the operator has confirmed the in-line one is correct).

This is a **de-fork + compose** refactor, not a new feature. It obeys the dual-loci
law (**dock = input / wedge; in-line row = state visualizer / mouse go-back**) —
same *component*, single *wedge & scan-sink owner*.

---

## The problem (concrete — verified 2026-08-10, files read)

| Concern | Dock renders | In-line `PoLineCaptureRow` renders | Verdict |
|---|---|---|---|
| **Item photos** | `ItemPhotoDockControl` → `ItemPhotoCaptureStrip` → `PhotoStepDockStrip` | `ItemPhotoCaptureStrip` → `PhotoStepDockStrip` | **GOLDEN — already one component. Copy this shape for the other two.** |
| **Serial** | `serialSlot={<UnboxSerialStepSurface row c />}` → `SerialCard` (single-qty) / `ReceivingUnitRows` (multi-qty) | `SerialScanField` | **FORK** — `SerialCard` (older) vs `SerialScanField` (correct) |
| **Condition** | `conditionSlot={<ConditionPills collapsible={false} layout="barDistribute" />}` (always-expanded strip) | `ConditionPills` in **collapsed-Tags** grammar (default `USED_A`, hover → expand, pick → collapse + advance) | **FORK** — same component, **different variant/props** → different display |

**Why it looks wrong to the operator:** when the `serial` step is active, the dock
Band 1 shows a `SerialCard`-style field while the in-line row shows a
`SerialScanField`; when `condition` is active, the dock shows an always-expanded
A·B·C·Used bar while the in-line shows the collapsed Tags-that-expand-on-hover.
Two surfaces, two grammars, one job.

---

## The golden pattern to follow (photos — already correct)

- `ItemPhotoCaptureStrip` (`line-edit/ItemPhotoCaptureStrip.tsx`) is the ONE photo
  capture component. It internally composes `PhotoStepDockStrip` (Link | Upload |
  Send to phone).
- The **dock** mounts it via a thin control `ItemPhotoDockControl`
  (`steps/dock/ItemPhotoDockControl.tsx`) — a ~1-import wrapper.
- The **in-line row** mounts the *same* `ItemPhotoCaptureStrip` directly.
- Result: identical display in both loci, one source, no drift.

**Do the same for serial and condition:** one shared capture component per concern,
mounted by both the dock slot AND the in-line row.

---

## SoT laws to respect (read these first)

- `.claude/rules/pattern-evolution.md` — **compose the shared component; never fork
  a page-local / per-locus twin for the same job.** This task is literally deleting
  a fork. A retirement is not done until the old path is **deleted** or a guard
  names the exact surviving call sites (shrink-only).
- `.claude/rules/display/unbox-station.md` — the Unbox golden walk. **Dual edit
  loci:** dock owns wedge/scanner; every editable line mounts the capture face for
  mouse go-back. Capture trio order **Serial → Condition → Photos**.
- `.claude/rules/display/station-workbench.md` → *"The dock's LEADING zone is the
  step's ACTION surface"* and *"The card reads; the dock acts."* The dock Band 1 is
  a **flush two-band floor** (`h-11`, `gap-0`, `items-stretch`, full-height abutting
  segments — never a content-sized chip floating in air). **Serial dominance:** the
  serial field owns ≥80% of the floor band while `activeKey === 'serial'`.
- `.claude/rules/source-of-truth.md` → **Unbox centre (main)** · **Unbox dock flush
  floor** · **Active-step outline** (Phase 1, below).

---

## Ground truth — the exact files and fork points

**Dock registry + slot controls**
- `line-edit/steps/dock/index.ts` — `UNBOX_STEP_DOCK_CONTROLS`: `condition →
  ConditionDockControl`, `serial → SerialDockControl`, `item_photos →
  ItemPhotoDockControl`.
- `line-edit/steps/dock/SlotDockControls.tsx` — `ConditionDockControl` /
  `SerialDockControl` are **slot hosts**: they render whatever `conditionSlot` /
  `serialSlot` the adapter hands them (flush `h-11` framing only). **These are fine
  — the fork is in what the adapter puts in the slot.**
- `line-edit/terminal/unbox-tabs.tsx` `buildUnboxStepDock` (~L253-270) — **the fork
  origin**:
  - `conditionSlot={<ConditionPills collapsible={false} layout="barDistribute" />}`
  - `serialSlot={<UnboxSerialStepSurface row={row} c={c} />}`
- `line-edit/steps/UnboxSerialStepSurface.tsx` — the dock's serial fork: single-qty
  → `SerialCard`; multi-qty → `ReceivingUnitRows`. Owns the wedge (autofocus +
  `useRegisterScanSink({ id: 'po-line:<lineId>' })`).

**In-line row (the "correct" set)**
- `line-edit/PoLineCaptureRow.tsx` — composes `ConditionPills` (collapsed-Tags),
  `SerialScanField`, `ItemPhotoCaptureStrip`. Carries the `data-capture-segment` /
  `data-capture-condition` / `data-capture-row` markers.
- `line-edit/PoLineUnitCaptureList.tsx` → `ActiveLineConditionSerial.tsx` →
  `LinePoItemsSection.tsx` is the mount chain (Unbox centre, `dockOwnsCapture`).
- `line-edit/SerialScanField.tsx` — the in-line serial field (the keeper).
- `ConditionPills.tsx` — supports both `collapsible` (Tags) and `barDistribute`.

**Phase 1 dependency (do NOT break)**
- The **moving outline** keys off `data-active-step` (on `data-capture-row`) →
  lighting `[data-capture-segment="serial|photos"]` / `[data-capture-condition]`
  via unlayered CSS in `src/styles/globals.css`. Token:
  `line-edit/active-step-ring.ts`. Guard: `active-step-ring.guard.test.ts`.
  **Whatever shared component you compose in the dock/in-line must keep these
  markers** (segment/condition data-attrs) so the outline still finds its target.

---

## Recommended approach

**Extract one shared capture component per concern; both the dock slot and the
in-line row compose it.** Mirror the photos shape.

1. **Serial — converge on `SerialScanField`; retire the `SerialCard` dock path.**
   - Make the dock `serialSlot` render the **same** `SerialScanField` the in-line
     row uses (single-qty), and the same multi-qty surface the in-line uses
     (`PoLineUnitCaptureList` already handles multi under the row — reconcile the
     dock's `ReceivingUnitRows` path against it; there should be **one** multi-qty
     serial component, not two).
   - Keep the wedge/sink wiring (`useRegisterScanSink`, autofocus, `receiving-focus-
     scan`) on the **dock** instance only; the in-line instance stays a go-back
     editor that does **not** fight for the wedge (`autoFocusSerial={false}` there).
     This is the "same component, single wedge owner" nuance — do not create two
     scan sinks under the same `po-line:<id>`.
   - Delete `UnboxSerialStepSurface`'s bespoke `SerialCard` branch once nothing
     mounts it. If `SerialCard` has no other consumers, retire it (knip will not
     see it while both doors are imported — add a shrink-only guard or delete).

2. **Condition — one variant.** Decide the single grade grammar both loci show
   (recommended: the in-line **collapsed-Tags** grammar the operator confirmed).
   Make the dock `conditionSlot` compose `ConditionPills` with the **same props**
   as the in-line row (collapsed Tags, hover-expand, pick→collapse→advance) instead
   of `collapsible={false} layout="barDistribute"`. If the dock genuinely needs
   always-expanded on Band 1 for reach, that is a **product decision** — get sign-
   off; do not silently keep two variants.

3. **Photos — leave as-is** (already shared). Use it as the guard's reference.

4. **Simplify.** After convergence, the dock's per-concern control should be as thin
   as `ItemPhotoDockControl` (mount the shared component + flush framing). Remove
   dead props/branches surfaced by the merge.

### Decision gate (ask the user before building)

- **D1 — Condition grammar in the dock:** collapsed-Tags (match in-line, recommended)
  vs always-expanded barDistribute (current dock). Same component either way; the
  question is one shared variant.
- **D2 — Serial multi-qty:** one shared multi-qty component for both loci
  (recommended) vs keep dock `ReceivingUnitRows` / in-line `PoLineUnitCaptureList`
  as two. If two, state why in the SoT and pin it with a guard.

---

## Constraints — must NOT break

- **Flush floor geometry** — `unbox-dock-one-shell.guard.test.ts` (Band 1 `h-11`,
  `gap-0`, full-height abutting segments; serial dominance ≥80%; no soft pill; no
  co-mounted terminal + step studio).
- **Wedge / scan sink** — exactly one owner per `po-line:<lineId>` at a time. Dock
  owns the wedge while its step is active; the in-line go-back editor does not
  autofocus or register a competing sink.
- **Moving outline (Phase 1)** — keep `data-capture-segment` / `data-capture-condition`
  markers on the shared components; `active-step-ring.guard.test.ts` must stay green.
- **Either-or dock registry** — `procedure-step-dock.guard.test.ts` (every step has
  a dock control OR a declared reason) and `scan-cockpit.guard.test.ts` (step→railLeaf)
  stay green.
- **Capture entry** — `po-line-capture-entry.guard.test.ts` (`the capture gate has
  exactly one owner` — a coarse `dockOwnsCapture && is<Capital>` regex; keep any
  new conjunction from tripping it, or narrow the guard deliberately).
- **No-serial waiver** — the `serial_absent` store is the ONE waiver; do not grow a
  second one on either locus (`per-unit-no-serial-ui.guard.test.ts`).
- **Multi-qty / roll-up** — `units-explosion.guard.test.ts`, `bulk-qty-display.guard.test.ts`.

---

## Guards to add / update

- **New `unbox-capture-shared-component.guard.test.ts`** — the anti-fork pin. Assert
  the dock slot and the in-line row compose the **same** component per concern:
  - photos: both reach `ItemPhotoCaptureStrip` (reference — already true);
  - serial: both reach `SerialScanField` (after convergence) — the dock no longer
    imports `SerialCard` for the serial step;
  - condition: both compose `ConditionPills` with the **same** variant flags
    (or a shared wrapper) — no `collapsible={false} layout="barDistribute"` fork
    in `buildUnboxStepDock` unless D1 explicitly kept it (then assert the
    documented single exception, shrink-only).
- **Update** the guards above as call sites move; **shrink** baselines only, never
  raise.

---

## Verify

- `npx tsx --test` on: the new guard + `unbox-dock-one-shell` · `procedure-step-dock`
  · `scan-cockpit` · `active-step-ring` · `po-line-capture-entry` · `po-line-flat-chrome`
  · `units-explosion` · `bulk-qty-display` · `per-unit-no-serial-ui`.
- `npx tsc --noEmit -p tsconfig.json` — 0 errors on touched files (report any
  pre-existing red from concurrent lanes separately; do not inherit it).
- `npm run verify` before calling it done.
- **Dogfood on `:3050` (attach, never start):** open a Found carton, walk
  Serial → Condition → Photos, and confirm the dock Band 1 and the in-line row show
  the **identical** component at each step, the wedge lands once, and the Phase 1
  moving outline still tracks.

---

## SoT deltas (land with the code)

- `source-of-truth.md` → **Unbox centre (main)** / **Unbox dock flush floor**: state
  that serial · condition · photos each have **one** shared capture component composed
  by both the dock slot and the in-line row (photos is the reference); dock and
  in-line never fork the same capture concern.
- `display/unbox-station.md` → Layers table: name the shared component per concern.
- If D1/D2 keep any documented exception, write the reason + the shrink-only guard.

---

## Out of scope / do not touch

- The **moving outline** behavior (Phase 1) — only preserve its markers.
- The **KNOW cockpit rail** (`railLeaf`) / Displays leaves.
- Re-timing / re-theming the two-band dock floor.
- Porting to sibling stations (Testing / Arrival) — separate port, after Unbox
  dogfood sign-off.
