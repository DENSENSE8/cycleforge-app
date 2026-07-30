import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { ReceivingLineUnitView } from '@/components/station/receiving-line-row';

// `id` is optional to stay structurally compatible with the chip menu's
// `SavedSerial` (whose id is optional). Callbacks guard with `if (s.id == null)`.
export type ActiveRowSerial = {
  id?: number;
  serial_number: string;
  condition_grade?: string | null;
  _optimistic?: 'adding' | 'removing';
};

export interface PoLineSerialActions {
  editingSerialId?: number | null;
  /**
   * Edit a serial. `lineId` is the row the chip belongs to — NOT necessarily
   * the active row, since the menu is offered on every row. For a non-active
   * row the accordion activates that line first (so its scan input mounts);
   * the parent then targets the serial for in-place editing on that line.
   */
  onEdit?: (serial: ActiveRowSerial, lineId: number) => void;
  /**
   * Delete a serial from its own `lineId`. The scan-serial DELETE endpoint
   * only removes a unit that still points at the given line, so the parent
   * MUST route the delete to `lineId` (not the active row).
   */
  onDelete?: (serial: ActiveRowSerial, lineId: number) => void;
}

export interface ActiveRowSlotContext {
  /**
   * Authoritative list of saved serials for the active line, sourced from
   * this accordion's own query. Pass this into the inline serial adder so
   * the chip list below the input always matches the chip shown in the row
   * header — otherwise the two surfaces drift (the parent's `row.serials`
   * is fed from a different fetch cadence).
   */
  serials: ActiveRowSerial[];
  /**
   * Materialised `receiving_line_unit` rows for the active line — same
   * accordion SoT as `serials`. Drives the per-unit green-check no-serial
   * offer; the panel's outer `row.units` is usually unhydrated table data
   * and must not be used here (per-unit-no-serial Phase 3).
   */
  units: ReceivingLineUnitView[];
}

export type ActiveRowSlot =
  | React.ReactNode
  | ((ctx: ActiveRowSlotContext) => React.ReactNode);

export type { ReceivingLineRow };
