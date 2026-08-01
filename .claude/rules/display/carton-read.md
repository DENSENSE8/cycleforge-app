# Carton read surface (`/carton/[id]`)

Recipe for the durable **read** record of a carton — observe-first with a work **escape**, not Station Workbench and not a Monitor KPI rollup.

**SoT rows:** `source-of-truth.md` → Photo gallery viewer · Carton read surface.  
**Sharing boundary:** `pattern-evolution.md` Always #5 (D6) — read model + atoms only; never Unbox layout panels / `CartonContextCard` / lobotomized work chrome.  
**Guard:** `src/components/receiving/inspector/carton-inspector.guard.test.ts`.

## Anatomy

```
┌─ DispositionBar ──────────────────────────────────────────────┐
│ ● Disposition · Carton {id} · chips · flags     [utils] [⚒]  │
└───────────────────────────────────────────────────────────────┘
┌─ Col 1 (left) ──────────────┬─ Col 2 (right) ────────────────┐
│ CONTENTS · ACTIVITY · RECORD│ PHOTOS · PROGRESS · HISTORY     │
│ Lines first · activity ·    │ ReceivingPhotosSection readOnly │
│ sparse facts / notes        │ Panel + ReceivingCartonPipeline │
│ (white cards)               │ · Units|Tracking · findings     │
└─────────────────────────────┴─────────────────────────────────┘
```

- **≥xl:** two columns — contents first, progress/photos/history second.  
- **Mobile:** stack col1 then col2.  
- **Photos:** same `ReceivingPhotosSection` as ReceivingDetailsStack Progress, mounted **above** the pipeline with `readOnly` + neutral (white) launcher tone. Never EvidenceStage or a hand-rolled “N photos” count button.  
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
