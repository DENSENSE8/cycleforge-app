/** A table SURFACE BINDING — the pairing of a validated {@link TableDefinition} (data) with the two things about a grid that genuinely… */

import type { ComponentType, RefObject } from 'react';
import type {
  GridSurfaceDescriptor,
  LedgerGridColumnModel,
} from '@/design-system/components/grid';
import type { TableDefinition } from '@/lib/tables/table-definition';

/** How a picked row on this surface reaches its RECORD plane. */
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
   * Existing `detail:*` occupants (orders, repair, …) are migration debt.
   */
  | {
      readonly kind: 'inspector';
      /**
       * The occupant id, or its stable PREFIX when {@link keyedByRecord} is set.
       */
      readonly occupantId: `detail:${string}`;
      /** Why this surface may key its occupant id per RECORD. */
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
  /** Module-level `make*GridDescriptor` **reference** (never an inline arrow): */
  readonly makeDescriptor: (visible: readonly C[]) => GridSurfaceDescriptor<Row, C>;
  /**
   * What a picked row opens. See {@link TableRecordPlane} — every registered
   * binding declares one. New desks use `stage-overlay`; `inspector` is legacy debt.
   */
  readonly recordPlane: TableRecordPlane;
  /** The ROW action plane — sticky in-flow guest under the column header when a row is picked in the select gutter (To-ship's CYC-82 assign… */
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
