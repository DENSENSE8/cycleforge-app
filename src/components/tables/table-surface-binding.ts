/**
 * A table SURFACE BINDING — the pairing of a validated {@link TableDefinition}
 * (data) with the two things about a grid that genuinely cannot be data: its
 * typed column model and its descriptor factory.
 *
 * Plan: `docs/todo/nonlinear-data-table-engine-PLAN.md` (Phase 1).
 *
 * ## Why this is two halves and not one object
 *
 * The definition is authorable — Phase 2 has Studio emitting it as JSON, so it
 * must survive `JSON.parse` with no functions in it. `makeDescriptor` carries
 * `isSortable` / `isLocked` / `sortDescFirst` and the TanStack column defs; it
 * is code, and it stays code. Keeping them adjacent but distinct is what lets a
 * guard assert that the authored half and the typed half describe the same
 * grid (`definition.columns` deep-equals `columns`) instead of hoping.
 *
 * ## Why the host takes a binding rather than an id
 *
 * A registry keyed by id would have to erase `Row` and `C` to hold families of
 * different row shapes in one map, and every mount would then need a cast that
 * nothing checks — the id would *look* like it guaranteed the row type while
 * guaranteeing nothing. Passing the binding keeps the mount fully typed at
 * compile time; the id stays the enumeration/lookup key for the registry, the
 * guards, and (Horizon C) a DB-backed definition that resolves onto the same
 * family binding.
 */

import type {
  GridSurfaceDescriptor,
  LedgerGridColumnModel,
} from '@/design-system/components/grid';
import type { TableDefinition } from '@/lib/tables/table-definition';

export interface TableSurfaceBinding<Row, C extends LedgerGridColumnModel> {
  /** The authored, Zod-validated half. Owns identity, shell + column data. */
  readonly definition: TableDefinition;
  /**
   * The family's FULL canonical column model, typed. Must describe the same
   * columns as `definition.columns` — pinned by the registry guard.
   */
  readonly columns: readonly C[];
  /**
   * Module-level `make*GridDescriptor` **reference** (never an inline arrow):
   * `LedgerGridSurface` memoizes the descriptor on `[makeDescriptor, visible]`
   * and it carries the TanStack column defs, so a fresh identity every render
   * would rebuild the state engine's column list every render.
   */
  readonly makeDescriptor: (visible: readonly C[]) => GridSurfaceDescriptor<Row, C>;
}
