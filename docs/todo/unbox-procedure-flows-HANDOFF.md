# Unbox procedure flows — Found · Unfound · Return

**Status:** implemented (model + bench) · **Date:** 2026-08-04
**Supersedes:** boolean `ProcedureVariant` (`isUnfound` · `isLocalPickup` · `isReturn`) as the
primary Unbox procedure selector.

## Decision

Three **named flows** selected by intake / pairing:

| Flow | When | Capture shape |
|---|---|---|
| `found` | Matched PO | Base list; condition before serial |
| `unfound` | No matched PO | Prepends `classify` |
| `return` | Return intake | Serial before condition; `classify` when still unpaired |

**Not a named flow:** local pickup — modifier that omits carrier dunnage photo steps
(`shipping_label_photo` · `box_photo` · `packing_material`).

## Precedence

1. `return` if `isReturnIntake`
2. else `unfound` if no `zoho_purchaseorder_id`
3. else `found`

Unfound return → `return` + `needsClassify`.

## SoT

- Step catalog + flows: `src/lib/stations/procedure.ts`
- Context from row: `resolveUnboxProcedureContext` / `resolveContextFromFlags`
- Resolver: `resolveProcedureSteps(proc, ctx, phase?)`
- Bench: `useUnboxProcedureSteps` → one derivation, two views
- **Capture order (dogfood):** org setting `receiving.unboxFlowCaptureOrder`
  (JSON `{ found?: string[]; unfound?: string[]; return?: string[] }`), edited via
  right-rail checklist drag-handle reorder. Override is applied inside
  `resolveProcedureSteps` (`captureOrderOverride`) so ProcedureDeck + checklist
  stay aligned. Sanitize: drop unknown keys; append missing allowed keys.

## Out of scope (still)

- Named pickup flow, per-platform procedure trees, Studio authoring, waiver store
- Per-staff personal capture orders; historical versioning of SOP at carton close
- Paused scan-station platform lanes (`docs/todo/scan-station-procedure/`)
