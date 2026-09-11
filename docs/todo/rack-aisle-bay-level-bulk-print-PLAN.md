# PLAN — Ragged rack bulk print (aisle ack → bays 1–16 → per-bay levels)

**Status:** plan of record · **Written:** 2026-09-10 · **Lane:** prod  
**Rulings:** Gemini Deep Research D1–D12 (operator paste 2026-09-10)  
**Briefing:** [`rack-aisle-bay-level-bulk-print-GEMINI-RESEARCH-BRIEFING.md`](./rack-aisle-bay-level-bulk-print-GEMINI-RESEARCH-BRIEFING.md)

**Verify protocol:** tick a box only when **you** can reproduce the check in this worktree (grep, test command, or Inventory → Locations → Racks). Do not tick from the agent claiming it.

---

## 0. Mission (P0)

On **Racks**, in **Bulk**, after **room + zone letter + aisle** (no bay required):

1. See freeze copy `{room} · Zone {L} · Aisle {NN}`.
2. Check **I am standing in this room and aisle** (D1). Until then Print is dead.
3. Multi-select any subset of **bays 1–16**.
4. Set **levels 1…N** per selected bay (default `config.maxLevels`, **copy-down**).
5. Preview coordinate-only 2×1 faces in **bay ascending, then level ascending** (D4).
6. Sticky bar: `Print N · Aisle NN`. Confirm still `printRackLabelRun` → register → `printLocationLabelsJob`.

Paper stays coordinate-only (no room name, no HRI, no Left/Right). Left/Right only in the sheet (D12).

---

## 1. Ground truth (this worktree, 2026-09-10)

Do **not** rebuild these. The briefing still mentions `LabelPrintRunSheet`; that host is gone.

| Already true | Where | Do not redo |
|---|---|---|
| Bulk is inline, not a BottomSheet | `LabelPrintRunPanel` + Single\|Bulk `TabSwitch` | Do not resurrect `LabelPrintRunSheet` |
| Racks bulk unlocks at aisle (no bay) | `RackLabelPrinter` `canOpenRun` | Already matches D11 for **opening** bulk |
| Odd/even **two-height** expander | `expandOddEvenBayLevelsPrintRun` | Keep; it is **not** per-bay ragged |
| Parts drawers preset (bins) | `expandPartsDrawersPrintRun` | D10 — keep; racks never show it |
| One-axis vary (levels on one frozen bay) | `expandPrintRun` + panel `axis` mode | Keep for “this column only” |
| Print pipe | `printRackLabelRun` → `/api/locations/register` → `printLocationLabelsJob` | No second face / HTML shell |
| Coordinate sticker | `locationLabelToFace` `kind: 'location'`, no `hri` | Do not paint room on paper |
| Default picker `maxBays: 12` | `rack-printer-config.ts` | D3: picker tiles; ragged chips still 1–16 |

**Still missing vs this plan:**

- `expandRaggedBayLevelsPrintRun` (arbitrary `BayLevelRange[]`, `rack: true` → `position: 0`)
- Bay **multi-select** (non-contiguous 1,2,5,8) vs today’s contiguous `bay from–through`
- Per-bay numeric **through** (not only odd=N / even=M)
- Blocking **ack checkbox** + button copy that **names the aisle**
- Copy-down
- Tripwire tests (no `expand-print-run.test.ts` in this tree — re-add beside the expander)
- `Printing 12/47` (D6) — **P1**, not P0

---

## 2. Locked rulings (do not re-litigate)

| ID | Ruling |
|---|---|
| D1 | Checkbox + Print button copy carries aisle. No type-back. |
| D2 | P0 = Racks only. Labels / qty bins = P1 (`position: 1` frozen). |
| D3 | Ragged chips cap **16**. `config.maxBays` only sizes Single picker. Expander clamp 1–99. |
| D4 | Expand order: bay ↑ then level ↑ (left-to-right, bottom-up). |
| D5 | Default each bay to `config.maxLevels`; copy-down applies that N to all selected. |
| D6 | USB-if-paired unchanged in P0. Progress string P1. |
| D7 | One register POST. Chunk 50 only if the API fails. |
| D8 | No localStorage recall in P0. |
| D9 | Odds/evens **shortcuts** are P1. Odd/even **mode** already exists — leave it. |
| D10 | Parts preset stays on Labels; ragged matrix is a **new** Racks mode chip. |
| D11 | Bulk: no bay required. Single: Print one still needs full address. |
| D12 | `formatLocationBayFace` / Left\|Right in the matrix UI only. |

**Anti-patterns:** FilterRefinementBar, hunt tiles, slot-table/funnel, overlay `visibility` / `zIndex.panel` deletes, new print HTML, three-axis Cartesian in `expandPrintRun`, room name / HRI on the sticker, lowering lighthouse floors.

---

## 3. P0 slices (check in order)

Each slice is independently greppable. Tick when the **Verify** column is true.

### Slice A — Domain expander + tests

**Files:** `src/lib/locations/expand-print-run.ts` (or `expand-bay-levels.ts` + re-export), `src/lib/locations/expand-print-run.test.ts`

**Build:**

```ts
expandRaggedBayLevelsPrintRun({
  zone, aisle,
  bays: BayLevelRange[],  // levelStart default 1, levelEnd = N
  rack: true,             // position 0 + rackCode
})
```

Empty `bays` → `[]`. Invalid zone/aisle → `[]`. Order: bay then level.

**Verify (worktree):**

```bash
npx tsx --test src/lib/locations/expand-print-run.test.ts
```

- [ ] **A1** Test: zone `C`, aisle `1`, bays `{1, N=3}`, `{2, N=1}`, `{16, N=2}` → codes `C-01-01-1`, `C-01-01-2`, `C-01-01-3`, `C-01-02-1`, `C-01-16-1`, `C-01-16-2` in that order; `segments.position === 0`.
- [ ] **A2** Test: `rack: false` is **not** required in P0 (omit or skip). Do not emit five-part codes from the rack call.
- [ ] **A3** `rg expandRaggedBayLevelsPrintRun src/lib/locations` hits the export. `expandPrintRun` still refuses a 3-axis cube (existing one-axis tests restored if missing).

---

### Slice B — Ragged mode in `LabelPrintRunPanel`

**Files:** `src/components/labels/LabelPrintRunPanel.tsx`  
**Design-mcp** before the tsx write: `ds.mjs contract "racks bulk ragged bay multi-select per-bay levels ack"` + `ds.mjs tokens` (control / type) + critique after.

**Build:** new `RunMode` `'ragged'` (name in code: `ragged` or `bayMatrix`). Chip **visible for `freeze.rack`**. Odd/even and “Levels on bay” stay.

UI:

1. Freeze line already `{room} · {zone} · Aisle NN` — keep.
2. **16** bay toggles (1–16). Selected = on. Show Left/Right via `formatLocationBayFace` on the chip, not on the face.
3. For each selected bay: numeric **levels** 1–99, default `seedThrough` (`maxLevels`).
4. **Copy-down** control: set every selected bay’s N to the first selected bay’s N (or to `seedThrough` — pick one and document in the button label).
5. Expand via `expandRaggedBayLevelsPrintRun`. Existing face grid + per-face exclude checkboxes.
6. Lift `acked: boolean` (default **false**) through `onAckChange` / `onSelectionChange` so the action bar can disable Print.

**Verify:**

- [ ] **B1** Inventory → Locations → Racks → pick room with zone letter → pick aisle → **Bulk**. Chip **Ragged** / **Per bay** (exact label TBD in implement, must be distinct from Odd / even).
- [ ] **B2** Selecting bays **1, 2, 16** only (not 3–15) produces **only** those columns in the face grid.
- [ ] **B3** Bay 1 levels `3`, bay 2 levels `1`, bay 16 levels `2` → six faces, codes match A1.
- [ ] **B4** Copy-down: set bay 1 to `4`, copy-down → bay 2 and 16 also `4`; grid count = 4+4+4.
- [ ] **B5** Face preview: large code only; **no** room string, **no** `C` kicker, **no** HRI under matrix, **no** `Left`/`Right` on paper (`LocationLabelFacePreview`).
- [ ] **B6** Odd / even mode still works (contiguous from–through + two heights). Parts chip **absent** on Racks.

---

### Slice C — Ack + Print copy (D1)

**Files:** `LabelPrintRunPanel.tsx`, `RackLabelPrinter.tsx` (`handlePrintRun` / StickyActionBar)

**Build:**

- Checkbox label: **I am standing in this room and aisle** (or equivalent; must name the job, not “I agree”).
- Unchecked: `Print` disabled even if faces > 0.
- Checked: primary label `Print {N} label(s) · Aisle {pad2(aisle)}` (D1 + D3 copy).
- Ack is UI-only (no expander param). Uncheck after room/aisle change (reset with freeze deps).

**Verify:**

- [ ] **C1** Bulk + ragged faces selected, ack **off** → Print disabled.
- [ ] **C2** Ack **on** → Print enabled; button text includes `Aisle 01` (or the picked aisle).
- [ ] **C3** Change aisle (or Reset then re-pick) → ack returns to **off**.
- [ ] **C4** Single mode unchanged: still needs bay+level; Print one; no ack checkbox.

---

### Slice D — Wire confirm (no new pipe)

**Files:** `RackLabelPrinter.tsx` only if selection payload changes; `useRackLabelPrinter.printRun` unchanged.

**Build:** `handlePrintRun` maps selected rows → `RackSegments` → `c.printRun`. Do not print if `!acked`.

**Verify:**

- [ ] **D1** `rg printRackLabelRun src/components/barcode/RackLabelPrinter.tsx src/components/barcode/rack-printer` still the bulk path.
- [ ] **D2** Network: one `POST /api/locations/register` then thermal (USB or iframe). No new `/api/.../print`.
- [ ] **D3** Printed / previewed codes are four-part `C-01-01-1` (rack), not `C-01-01-1-01`.

---

### Slice E — Machine eval

- [ ] **E1** `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast` → `.cursor/eval-session.json` `"ok": true`.
- [ ] **E2** `ds.mjs critique` on every edited `*.tsx` is clean enough to ship (no new primitive forks).
- [ ] **E3** No edits to `DataTable.tsx`, Unbox Queue/Viewed/History, overlay `visibility` / `zIndex.panel`, `lighthouse-baseline.json` floors.

---

## 4. Operator walk (manual QA script)

Use a room that has `zone_letter` (e.g. dogfood Parts / `C`). Thermal optional; preview is enough for B/C.

1. Inventory → Locations → **Racks**.
2. Single: pick room, aisle, bay, level → **Print bay label** still works.
3. Switch **Bulk** before picking a bay → panel appears (aisle only).
4. Freeze line shows room name + zone letter + aisle.
5. Ack off → cannot print.
6. Ragged: tick bays 1–16 subset; set uneven heights; confirm count = Σ Nᵢ.
7. Ack on → Print N · Aisle NN.
8. Faces walk bay 1 L1…Ln, then bay 2, … (D4).
9. Un-tick a face in the grid → N drops; that code is not printed.

---

## 5. P1 / P2 (do not mix into P0 PRs)

| ID | Item | Verify later |
|---|---|---|
| P1 | Ragged on **Labels** (`position: 1`) | Five-part codes; Parts preset still available |
| P1 | Odds/evens **select** shortcuts (tick odd chips / even chips) | Distinct from odd/even **height** mode |
| P1 | `Printing 12/47` on USB sequential | Sticky bar while `isPrinting` |
| P2 | Server-side per-aisle height maps | Not localStorage (D8) |

---

## 6. File map (P0)

| File | Change |
|---|---|
| `src/lib/locations/expand-print-run.ts` | Add `expandRaggedBayLevelsPrintRun` |
| `src/lib/locations/expand-print-run.test.ts` | **Create** A1–A3 |
| `src/components/labels/LabelPrintRunPanel.tsx` | Ragged mode, 16 chips, per-bay N, copy-down, ack out |
| `src/components/barcode/RackLabelPrinter.tsx` | Gate Print on ack; button copy includes aisle |
| `src/lib/print/printLocationLabel.ts` | **No change** |
| `src/lib/print/printLabelRun.ts` | **No change** unless register chunking (only if API 413) |

---

## 7. Implementer prompt (P0, after you tick nothing yet)

Same as Gemini §5 / operator paste: ragged expander, unlock already done, sheet = panel, ack, 1–16 multi-select, per-bay N, copy-down, existing print pipe, design-mcp, `cursor-eval --fast`. Do not implement P1 progress or Labels ragged in the same PR.
