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

import type { ComponentType, RefObject } from 'react';
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
 * Some of these surfaces are ruled honest-absence and must NOT grow a peek to
 * make the family look symmetrical — the `reason` on the binding is what you
 * read at the mount. A bare `kind: 'none'` would be a silence with a type
 * annotation.
 */
export type TableRecordPlane =
  /**
   * Center Lock L2 — multi-field record form stacked on the desk stage (or the
   * scan-station 720 center). The table stays mounted underneath. **This is the
   * only record plane for new desk bindings** (law Q5).
   */
  | {
      readonly kind: 'stage-overlay';
      /** Why this surface opens a record overlay (optional audit trail). */
      readonly reason?: string;
    }
  /**
   * Legacy `RightRailHost` peek — **forbidden on new master-nav desk bindings.**
   * Existing `detail:*` occupants (orders, incoming, repair, …) are migration debt.
   */
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
   * binding declares one. New desks use `stage-overlay`; `inspector` is legacy debt.
   */
  readonly recordPlane: TableRecordPlane;
  /**
   * The ROW action plane — sticky in-flow guest under the column header when a
   * row is picked in the select gutter (To-ship's CYC-82 assign manifold).
   * It does not cover or replace the column labels.
   *
   * ## Why it is declared HERE
   *
   * The plane is the last thing that forced a family to own a row component.
   * The shared {@link CompoundRow} paints every cell, but it had nowhere to put
   * a panel that is anchored to the row and painted beside it — so To-ship
   * mapped the columns itself and mounted the panel by hand, which is
   * `OrdersQueueTableRow`, 1300 lines of shell the engine already had.
   *
   * Declaring it on the BINDING keeps invariant 2 (`REGISTER_ENTITY_NOT_PAGE`):
   * one entity, one plane, every mount. It is not a mount parameter, not a page
   * prop, and not per-row JSX — a page cannot introduce a plane, and two lanes
   * of the same entity cannot disagree about what picking a row opens.
   *
   * A component reference is admissible on the binding for the same reason
   * {@link makeDescriptor} is: the binding is the family's registration, not the
   * Zod-validated pure-data {@link definition}. What invariant 3 forbids is
   * behaviour in the DESCRIPTOR that varies per mount — this varies per ENTITY,
   * exactly once.
   *
   * Omit it and the row simply has no plane; nothing else changes.
   */
  readonly rowPlane?: TableRowPlane<Row>;
}

/** Props the engine hands a registered {@link TableRowPlane}. */
export interface TableRowPlaneProps<Row> {
  row: Row;
  open: boolean;
  onClose: () => void;
  /**
   * The ROW element. The plane uses it to find the table overlay host and to
   * ignore gutter clicks when dismissing the sticky action row.
   */
  anchorRef: RefObject<HTMLElement | null>;
}

export interface TableRowPlane<Row> {
  /** Why this entity opens a plane off the gutter (audit trail, like recordPlane). */
  readonly reason: string;
  /** Mounted by the engine as the row's last child. */
  readonly Component: ComponentType<TableRowPlaneProps<Row>>;
}
