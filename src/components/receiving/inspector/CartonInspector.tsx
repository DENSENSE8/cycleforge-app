'use client';

/**
 * Carton inspector — thin re-export of the read assembly.
 *
 * Route `/carton/[id]` mounts this; the assembly lives under `inspection/` so
 * the read job can evolve without dragging Unbox layout panels (D6).
 */

export { CartonInspectionPage as CartonInspector } from './inspection/CartonInspectionPage';
