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

/**
 * How a picked row on this surface reaches its RECORD plane.
 *
 * ## Why this is DECLARED rather than left to each mount
 *
 * "Open a row" had **eight** implementations across the eighteen registered
 * tables — `DetailStackRailRegistrar` on eight of them, two different custom DOM
 * events, three flavours of `router.push`, a URL param that only highlights, a
 * page-local `useState` beside a private panel, and three surfaces where a click
 * did nothing at all. One job, eight answers, and no way to ask a table which
 * one it had picked.
 *
 * Declaring it here does two things a page-local wiring block cannot. The HOST
 * can read it at the mount (which is what lets the gesture — click vs
 * double-click — be derived once from `capabilities.multiSelect` instead of
 * hand-wired per row component), and **absence becomes a claim the surface makes
 * out loud** rather than a silence that reads identically to an oversight.
 *
 * ## Absence is a legitimate answer, and it carries its reason
 *
 * Three of these surfaces are ruled honest-absence and must NOT grow a peek to
 * make the family look symmetrical — the reasons live in
 * `band3-find-only.guard.test.ts`'s `NO_DESK_PEEK_SURFACES` and are restated on
 * the binding so the next agent reads them at the mount they are about. The
 * `reason` string is the whole point of the non-`inspector` arms: a bare
 * `kind: 'none'` would be a silence with a type annotation.
 */
export type TableRecordPlane =
  /** A `RightRailHost` occupant — the house desk peek. */
  | {
      readonly kind: 'inspector';
      /**
       * The occupant id, or its stable PREFIX when {@link keyedByRecord} is set.
       */
      readonly occupantId: `detail:${string}`;
      /**
       * Why this surface may key its occupant id per RECORD. `RightRailHost`
       * keys its `AnimatePresence` on the occupant id, so a per-record id plays
       * exit → empty → enter on every prev/next step — tolerable only on a
       * surface with no queue walk. Stating the reason is what keeps that a
       * decision instead of a default.
       */
      readonly keyedByRecord?: string;
    }
  /** The row opens a station work surface (scan bench), not a desk peek. */
  | { readonly kind: 'station'; readonly reason: string }
  /** The row navigates to a route — a page, not a panel. */
  | { readonly kind: 'navigate'; readonly reason: string }
  /** The row opens a modal / dialog. */
  | { readonly kind: 'dialog'; readonly reason: string }
  /** Honest absence — this surface has no record plane at all. */
  | { readonly kind: 'none'; readonly reason: string };

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
  /**
   * What a picked row opens. See {@link TableRecordPlane} — every registered
   * binding declares one, and the non-`inspector` arms state why.
   */
  readonly recordPlane: TableRecordPlane;
}
