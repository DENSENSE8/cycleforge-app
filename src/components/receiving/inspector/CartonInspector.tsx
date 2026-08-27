'use client';

/**
 * Carton inspector — thin re-export of the read assembly.
 *
 * Route `/carton/[id]` and `/search?sel=receiving:` mount this.
 *
 * **D6 retired 2026-08-20.** This docblock used to say the assembly lives under
 * `inspection/` "so the read job can evolve without dragging Unbox layout
 * panels". That ruling was reversed with the order station port — a read
 * surface now composes the SAME station assembly in a declared `preview`
 * stance (`.claude/rules/pattern-evolution.md` law 5). The carton read job has
 * not been ported yet; it is a follow-up, not an exemption.
 */

export { CartonInspectionPage as CartonInspector } from './inspection/CartonInspectionPage';
