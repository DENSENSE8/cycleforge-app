import type { SerialMatchedOrder } from '@/components/receiving/workspace/SerialMatchResult';
import type {
  ActiveRowSlot,
  PoLineSerialActions,
} from '@/components/receiving/workspace/po-lines-accordion-types';
import type { LineCollapseController } from '@/components/station/collapse';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export interface UnfoundLine {
  id: number;
  sku: string | null;
  item_name: string | null;
  quantity_expected: number | null;
  quantity_received: number | null;
  condition_grade: string;
  workflow_status: string | null;
  listing_reference: string | null;
  location_code: string | null;
  image_url?: string | null;
  /** `/api/receiving/[id]` populates this when the carton has serials saved against any line. */
  serials?: Array<{
    id: number;
    serial_number: string;
    condition_grade?: string | null;
    _optimistic?: 'adding' | 'removing';
  }>;
}

export interface UnmatchedItemsSectionProps {
  receivingId: number;
  /** Staff id for serial scans (POST /api/receiving/scan-serial). */
  staffId?: string;
  sourcePlatformHint?: string;
  receivingTypeHint?: string;
  listingUrlHint?: string;
  /**
   * RETURN flow: a per-line serial that matched a shipped order fires this so
   * the parent can pair the order with the carton + open a prefilled claim.
   */
  onFileReturnClaim?: (matchedOrder: SerialMatchedOrder | null, serial: string) => void;
  /** RETURN match → Displays Timeline (full serial genealogy). */
  onOpenReturnHistory?: () => void;
  /** Fired whenever a condition grade is picked on this carton (per-line pill or the carton-level serial-scan card). */
  onActiveConditionChange?: (condition: string) => void;
  /**
   * No-serial waiver state, owned by the unbox controller (whose receive runs the
   * carton commit). Threaded so an unfound carton can be received with an explicit
   * "no serial" reason instead of a blank serial.
   */
  serialAbsent?: boolean;
  serialAbsentReason?: string | null;
  requireSerialConfirmation?: boolean;
  onSerialAbsentChange?: (next: { absent: boolean; reason: string | null }) => void;
  /**
   * Optional active-row leaf override (Testing verdict pills). When omitted,
   * the surface uses {@link ActiveLineConditionSerial} — Unbox / Arrival default.
   */
  activeRowSlot?: ActiveRowSlot;
  /**
   * Cold-open seed for the accordion siblings key (never-blank). Testing /
   * workspace hosts pass the known selected line so frame 1 paints before
   * `GET /api/receiving/:id` returns.
   */
  placeholderActiveRow?: ReceivingLineRow;
  /**
   * Testing only: hide needs_test=false lines (matched accordion parity).
   */
  hideNoTestLines?: boolean;
  /**
   * Share the host's per-line collapse controller (`useLineCollapse`) so an
   * Items-band "Collapse all" reaches the unfound lane's lines too. Omit and the
   * accordion owns its own — the lines still collapse, just not from above.
   */
  lineCollapse?: LineCollapseController;
  /**
   * Optional header serial chip actions. When omitted and unit chrome is on,
   * the surface wires unfound scan-serial CRUD. Testing passes its controller.
   */
  activeSerialActions?: PoLineSerialActions;
  /** "Scan a serial number" card. Hidden in triage — serials are an unbox step. */
  showSerialScan?: boolean;
  /**
   * Accordion interactivity. Decoupled from {@link showSerialScan} so Arrival
   * can keep editable unfound lines while unit capture stays off.
   * Defaults to `!showSerialScan` when omitted (legacy callers).
   */
  readOnly?: boolean;
  /**
   * When false (Arrival door flow), unit editors / serial stamp stay off;
   * PoLineRow still paints Unbox five-track meta. Defaults true.
   */
  unitsChrome?: boolean;
  /**
   * Triage only: header CTA that re-opens this carton in unbox mode (deep
   * link `/receiving?recvId=…`). Omitted in the unbox workspace itself.
   */
  onOpenInUnbox?: () => void;
  /** Render bare (no own WorkspaceCard chrome, no add pencil) — used when composed inside the unified {@link POUnboxingSection} wrapper,… */
  embedded?: boolean;
  /**
   * Embedded-only: node rendered at the right of the "PO items · N" header row
   * (e.g. the wrapper's shared edit pencil), so the unified wrapper can place
   * its single control on the same row as the item count.
   */
  headerRight?: React.ReactNode;
  /** Hide the embedded "PO items · N" eyebrow — the tab slider owns the label. */
  suppressHeader?: boolean;
  onViewAllUnits?: (line: ReceivingLineRow) => void;
  /** Fired after an Ecwid/repair pairing flips the carton off the Unfound queue. */
  onLinked?: (result: {
    carton: {
      zoho_purchaseorder_number: string | null;
      source: string | null;
      source_platform: string | null;
      intake_type?: string | null;
    };
    line?: {
      id: number;
      sku: string | null;
      item_name: string | null;
      quantity_expected: number | null;
      quantity_received: number;
      condition_grade: string | null;
      listing_url: string | null;
      source_platform_pill: string | null;
    } | null;
  }) => void;
  /**
   * Fired after a full order/PO unpair — host clears header chips immediately.
   */
  onUnlinked?: () => void;
  /**
   * Seed linkage display before GET /api/receiving/:id returns (workspace row).
   */
  linkedOrderHint?: {
    source: string | null;
    zoho_purchaseorder_id: string | null;
    zoho_purchaseorder_number: string | null;
  };
  /** Workspace row id for optimistic patch after unpair. */
  activeLineId?: number;
  /** Unbox dual loci: */
  dockOwnsCapture?: boolean;
}

export interface CartonResponse {
  success: boolean;
  lines?: UnfoundLine[];
  /**
   * Carton header — used to seed the door-classification pill row from the
   * stored intake columns (GET /api/receiving/[id] returns this). The
   * intake_type column maps onto `columnsToClassification`'s `receiving_type`.
   */
  receiving?: {
    source?: string | null;
    zoho_purchaseorder_id?: string | null;
    zoho_purchaseorder_number?: string | null;
    is_return?: boolean | null;
    return_platform?: string | null;
    source_platform?: string | null;
    intake_type?: string | null;
  } | null;
  error?: string;
}

/**
 * Infer the sales platform from an order number's shape — Amazon 3-7-7,
 * eBay 2-5-5. Anything else returns null (the operator keeps whatever pill
 * they set). The order # itself is the authoritative link; listing URL is not.
 */
export { inferMarketplaceFromOrderId as inferPlatformFromOrderId } from '@/lib/marketplace-order-id';
