# Carton read surface (`/carton/[id]`)

Recipe for the durable **read** record of a carton — observe-first with a work **escape**, not Station Workbench and not a Monitor KPI rollup.

**SoT rows:** `source-of-truth.md` → Photo gallery viewer · Carton read surface.  
**Sharing boundary:** `pattern-evolution.md` Always #5 (D6) — read model + atoms only; never Unbox layout panels / `CartonContextCard` / lobotomized work chrome.  
**Guard:** `src/components/receiving/inspector/carton-inspector.guard.test.ts`.

## Anatomy

```
┌─ DispositionBar ──────────────────────────────────────────────┐
│ ● Disposition · Carton {id} · chips · flags   [Photos N] [⚒] │
└───────────────────────────────────────────────────────────────┘
┌─ Col 1 (left) ──────────────┬─ Col 2 (right) ────────────────┐
│ HANDLING · ACTIVITY · RECORD│ FINDINGS                        │
│ Provenance · activity ·     │ Exception cards (title + hint)  │
│ history · record meta       │ Contents · left-aligned facts   │
└─────────────────────────────┴─────────────────────────────────┘
```

- **≥xl:** two columns — handling first, findings second.  
- **Mobile:** stack col1 then col2.  
- **Photos:** header (or slim strip under disposition) control → `usePhotoGallery` + `PhotoViewerPortal`. Never a third photo column, EvidenceStage, or page-local lightbox.  
- **Work escape:** one quiet control using `openInUnboxHref` (icon / secondary). Zero visible `"Open in Unbox"` strings on findings or header.  
- **Empty ≠ fetch error** for photos — branch copy; never swallow failure into `[]`.  
- **Read-only gallery:** `{ url }` only (no numeric `id` / upload targets).  
- **Disposition truth:** exceptions outrank lifecycle.done — never claim settled / “Work complete” while exceptions hold.  
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
