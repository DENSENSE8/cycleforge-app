# Carton read surface (`/carton/[id]`)

Recipe for the durable **read** record of a carton — observe-first with a work **escape**, not Station Workbench and not a Monitor KPI rollup.

**SoT rows:** `source-of-truth.md` → Photo gallery viewer · Carton read surface.  
**Sharing boundary:** `pattern-evolution.md` Always #5 (D6) — read model + atoms only; never Unbox layout panels / `CartonContextCard` / lobotomized work chrome.  
**Guard:** `src/components/receiving/inspector/carton-inspector.guard.test.ts`.

## Anatomy

```
┌─ DispositionBar ──────────────────────────────────────────────┐
│ ● Disposition · Carton {id} · chips · flags     [utils] [⚒]  │
├─ Photo thumbnail strip (PhotoLauncher) ───────────────────────┤
│ [thumb] [thumb] … → shared PhotoViewerPortal                  │
└───────────────────────────────────────────────────────────────┘
┌─ Col 1 (left) ──────────────┬─ Col 2 (right) ────────────────┐
│ CONTENTS · ACTIVITY · RECORD│ PROGRESS · HISTORY · FINDINGS   │
│ Lines first · activity ·    │ Compact LinearWorkflowStepper   │
│ sparse facts / notes        │ · Units|Tracking · exceptions   │
└─────────────────────────────┴─────────────────────────────────┘
```

- **≥xl:** two columns — contents first, progress/history second.  
- **Mobile:** stack col1 then col2.  
- **Photos:** slim thumbnail strip under disposition → `usePhotoGallery` + `PhotoViewerPortal`. Never a hand-rolled “N photos” count button, EvidenceStage, or page-local lightbox.  
- **Progress:** shared `LinearWorkflowStepper` (Scanned → Unboxed → Received) via `deriveCartonReadiness` — never a hand-rolled HANDLING provenance strip.  
- **Work escape:** one quiet control using `openInUnboxHref` (icon / secondary). Zero visible `"Open in Unbox"` strings on findings or header.  
- **Empty ≠ fetch error** for photos — branch copy; never swallow failure into `[]`.  
- **Read-only gallery:** `{ url }` only (no numeric `id` / upload targets).  
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
