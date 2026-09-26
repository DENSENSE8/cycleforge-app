import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReceivingLineUnitView } from '@/lib/receiving/receiving-line-row';

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
  /** Edit a serial. */
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
   * The accordion sibling this body belongs to. Condition/serial editors mount
   * under every editable line (SKU→serial interleave); callers MUST bind
   * mutations to `line.id`, not the panel's controller-active row alone.
   */
  line: ReceivingLineRow;
  /** Authoritative list of saved serials for this line, sourced from this accordion's own query. */
  serials: ActiveRowSerial[];
  /** Materialised `receiving_line_unit` rows for this line — same accordion SoT as `serials`. */
  units: ReceivingLineUnitView[];
}

export type ActiveRowSlot =
  | React.ReactNode
  | ((ctx: ActiveRowSlotContext) => React.ReactNode);

export type { ReceivingLineRow };
