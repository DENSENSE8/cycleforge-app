# Carton read surface (`/carton/[id]`)

Recipe for the durable **read** record of a carton — observe-first with a work **escape**, not Station Workbench and not a Monitor KPI rollup.

**SoT rows:** `source-of-truth.md` → Photo gallery viewer · Carton read surface.  
**Sharing boundary:** `pattern-evolution.md` Always #5 (D6) — read model + atoms only; never Unbox layout panels / `CartonContextCard` / lobotomized work chrome.  
**Guard:** `src/components/receiving/inspector/carton-inspector.guard.test.ts`.

## Anatomy

```
┌─ DispositionBar ──────────────────────────────────────────────┐
│ ● Disposition · Carton {id} · chips  [Photos·N] [utils] [⚒]  │
└───────────────────────────────────────────────────────────────┘
┌─ PHOTOS (in-flow band, ?photos=1) ────────────────────────────┐
│ Exact photo | Investigative · All|Box|Item (+Claim) · tiles   │
└───────────────────────────────────────────────────────────────┘
┌─ Col 1 — WHAT IS IN THE BOX ┬─ Col 2 — WHAT HAPPENED TO IT ──┐
│ CONTENTS · RECORD           │ PROGRESS · ACTIVITY · HISTORY   │
│ Lines first · sparse facts  │ Panel + ReceivingCartonPipeline │
│ / notes (white cards)       │ · events · Units · findings     │
└─────────────────────────────┴─────────────────────────────────┘
```

- **≥xl:** two columns split by QUESTION, not by weight — col 1 is the box's
  contents and its record; col 2 is its timeline. **ACTIVITY belongs to col 2**
  (moved 2026-08-02): it is an event stream and reads with the other two
  (pipeline milestones, unit journeys), not under a line list it does not
  describe.
- **Mobile:** stack col1 then col2.
- **Photos:** the DispositionBar's **primary CTA** (`Photos · N`) opening the
  in-flow `CartonPhotoTriage` band **above both columns** — never a mid-rail
  launcher card, never `EvidenceStage`, never a second lightbox. Recipe +
  measured rationale: `docs/todo/carton-photo-triage-RESEARCH-RULING.md`.
- **Contents rows are left-aligned**, title → meta, using shared ATOMS
  (`ProgressBadge` · `SkuScanRefChip` · `ConditionGradeChip` · `SerialChip`).
  **Never `PoLineMetaGrid`** — that is the Unbox accordion's fixed-track grid,
  and its whole job is holding one x-position across many stacked rows. There is
  no column to align with here, so it spread four chips across empty space and
  applied `META_COL.indentWide`, the dot-track indent of a queue this card has no
  dot track for. The row read as centered.  
- **Progress:** shared `ReceivingCartonPipeline` (Scanned → Unboxed → Received + `PipelineStageRow` details) on a white `Panel` surface — never a hand-rolled HANDLING provenance strip.  
- **Section cards:** contents lists, activity, facts/meta, photos, progress, and history sit on `bg-surface-card` / `Panel` — not bare canvas.  
- **Work escape:** one quiet control using `openInUnboxHref` (icon / secondary). Zero visible `"Open in Unbox"` strings on findings or header.  
- **Empty ≠ fetch error** for photos — `readOnly` section throws on fetch failure (distinct “Photos unavailable”).  
- **Disposition truth:** exceptions outrank lifecycle.done — never claim settled / “Work complete” while exceptions hold. Linked PO suppresses Unmatched / “No matched PO” even if `pairing_state` is still `UNFOUND`.  
- **Full width** — never `STATION_WORKBENCH_*` / station max-width caps.

## Mount

- Route: `src/app/carton/[id]/page.tsx` → `CartonInspector` (thin re-export).  
- Assembly: `src/components/receiving/inspector/inspection/CartonInspectionPage.tsx`.  
- Model: `carton-inspector-model.ts` (pure — no imports, no fetch).

## Never

- Import Unbox editors / `ReceivingDetailsStack` / station workbench shells.  
- Invent a second photo UI beside the gallery SoT.  
- Repeat Unbox marketing CTAs on every finding card.  
- Collapsed audit footer competing with findings for the lead job.
