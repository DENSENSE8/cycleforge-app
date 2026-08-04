# HANDOFF — Unbox step-1 photo capture redesign

**Written:** 2026-08-02 · **Updated:** 2026-08-02 (finish pass) · **Lane:** WS-DOGFOOD (`main`) · **Surface:** `/unbox`
**Supersedes the open questions in** [`ACTIVE-step1-photo-capture.md`](./ACTIVE-step1-photo-capture.md).

**Status:** photo-slice dock redesign **landed in the working tree** (uncommitted with other sessions' work — stage only the files in §3).

---

## 1. Decisions — locked, do not re-litigate

| # | Question | Answer |
|---|---|---|
| Q1 | Which steps in the slice | `arrival_check` + `shipping_label_photo` + `box_photo` + `packing_material`. **`item_photos` is out.** |
| Q2 | What the items panel is | **Static reference list.** It never ticks, never accumulates step facts. `contents` stays a step in the deck. |
| Q3 | History depth | **Windowed** — full history stays mounted in flow, ~2 rows visible, older scrolls above. |
| Q4 | Where it lives | **Edit the shipped deck in place**, on `/unbox`. |
| R1 | Dock is the only button surface | Step CTAs live in the dock. **Pager chips moved into the dock Panel** (finish pass). |
| R2 | No always-on notes / cue | Prose prompts stay out. Notes restored **behind a dock icon** (collapsed by default) — always available on every step, record-scoped (`receiving_line.notes`), never step-contextual. |
| R3 | Items pinned under carton header | `entityContext` + `mb-auto` on the `justify-end` workbench column. |
| Evidence | Region position | **Nested inside the active step card** (header + body). Hoisted sibling region above the list was reversed. |
| Contents body | Duplicate list | **Removed from centre.** `POUnboxingSection` stays as a component (Triage); Unbox centre no longer mounts it — `UnboxItemsPanel` is the only list. Dock acknowledge remains the step action. |
| Scan locus | Warehouse end state | Sidebar `StationScanBar` = new-carton ingestion; bottom dock = in-procedure input waist. Photo steps keep **pointer CTAs** (not a fake scan field). Serial/scan field in this dock is **next phase**, not this slice. |

---

## 2. The shape it is in now

```
┌─ StationContextBar — carton identity ────── absolute float, unchanged ─┐
├─ ITEMS  ×N ─────────────── entityContext slot, pinned top via mb-auto ─┤
│  [img] Title / SKU · ×qty · GRADE                                 $    │
├─ …free space… (the column is justify-end; items' mb-auto splits it) ───┤
├─ history rows (compact faces, full ink → one notch back) ──────────────┤
├─ ACTIVE (sticky bottom) ──────────────────────────────────────────────┤
│  eyebrow: step title (crossfades) · summary · mark  ← outside the card │
│  ┌ body card ───────────────────────────────────────────────────────┐  │
│  │ step evidence (photos / label / …) — no leading glyph             │  │
│  └───────────────────────────────────────────────────────────────────┘  │
├─ ~14px peek of the next queued card ──────────────────────────────────┤
╞═ dock band (floats over canvas) ══════════════════════════════════════╡
│  ┌ Panel (collapsed notes) ─────────────────────────────────────────┐  │
│  │ [< PREV]                                      [NEXT >]            │  │  ← pager IN Panel
│  │ [step CTA]                    [✉ note]  [▾ | Print · Receive]   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  — or when notes open —                                                │
│  ┌ Panel: pager + step CTA + [close note] ──────────────────────────┐  │
│  └ OmnichannelComposerDock (WorkspaceNotesCard) + terminal footer ──┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Structural notes that stay load-bearing

1. **Active step = Items-style eyebrow + body card** (`ProcedureDeck`): title outside the card and crossfades on advance; evidence inside; no leading glyph on the active chrome. Inactive rows stay one face height with icon · label · summary; covered contribute zero flow.
2. **Dock is one `Panel`** (or Panel + composer when notes open): pager, step CTA, notes toggle, carton terminal. Terminal stays carton-scoped.
3. **Items panel `mb-auto`** must be a **direct child** of the `bodyAlign="end"` column (`entityContext` from `LineEditPanel`), never inside `buildUnboxOverview`.

---

## 3. Files for this finish pass (stage these)

**Touched this finish pass**
- `src/components/receiving/workspace/LineEditPanel.tsx` — pager in Panel; collapsed notes toggle → `WorkspaceNotesCard`
- `src/components/receiving/workspace/line-edit/UnboxProcedurePager.tsx` — docblock; no outer `mb-1.5`
- `src/components/receiving/workspace/line-edit/UnboxProcedureDeck.tsx` — pager-location docblock
- `src/components/station/workbench/StationWorkbench.tsx` — clearance comment
- `src/components/station/terminal/StationTerminalDock.tsx` — clearance comment
- `docs/todo/scan-station-procedure/HANDOFF-step1-photo-capture.md` — this file

**Already in tree from the prior session (same redesign)**
- `src/components/receiving/workspace/line-edit/UnboxItemsPanel.tsx` (new)
- `src/design-system/components/procedure/ProcedureDeck.tsx`
- `src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx`
- `src/components/receiving/workspace/line-edit/UnboxStepDock.tsx`
- `steps/dock/CartonPhotoDockControl.tsx`, `AcknowledgeDockControl.tsx`, `SlotDockControls.tsx`

**Do not resurrect:** `UnboxStepCue.tsx`, per-row clearance variants, always-on notes textarea, `stepAction` on `LineNotesCard`.

---

## 4. Verification state

| Check | State |
|---|---|
| `npx tsc --noEmit` | ✅ clean after finish pass |
| `procedure-deck-order` + dock + coupling guards | ✅ pass |
| `station-workbench-guard` | ✅ pass |
| Browser / R3 visual | ⚠ **dev server was not listening on `:3050`** — not started (house rule). Structural `mb-auto` wiring reviewed; operator should confirm visually when the server is up. |
| `tests/e2e/unbox-procedure-deck.spec.ts` | ❌ not run (no server / QA session this pass) |
| Full `npm run verify` | ✗ **pre-existing only** — unit flake on concurrent `__guard_probe_GridView.tsx` ENOENT in unrelated DS ratchets; doc-catalog drift from other sessions' docs. Knip / typecheck / lint / route-auth green. **Do not raise knip baseline.** |

---

## 5. Next (not this slice)

1. **Operator look at R3** when `:3050` is up — items under header, deck bottom-pinned. Fallback: `flex-1` spacer between items and deck.
2. **Input-locus inversion** — dock hosts the in-procedure scan field for serial/scan steps; sidebar bar stays ingestion-only. See [`unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md`](../unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md).
3. **Evidence region** — only move above the active row if the bench finds the current split ambiguous.
4. **Run the deck E2E** against the QA org once geometry is stable.

## 6. Do not

- Re-add a prose prompt to a dock control, or a status line above the dock.
- Add a scroll port, a `min-h-*` floor, or an `overflow-hidden` in the deck's ancestry.
- Restore the note textarea as always-on chrome in the Unbox band.
- Relax a `procedure-*` guard to land a change.
- Raise the knip baseline for other sessions' dead code.
- Turn photo-step CTAs into a fake scan field.
