import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { PoNoteTabState } from './usePoNoteTabState';
import type { UnboxTabBridges } from './unbox-tab-bridges';

export type UnboxView =
  | 'overview'
  | 'units'
  | 'checklist'
  | 'po-note'
  | 'tracking'
  | 'ticket'
  | 'conversation';

/** Kind keys produced by STATION_TERMINAL_REGISTRY for unbox tabs. */
export type UnboxTerminalKind =
  | 'mode-default'
  | 'po-note'
  | 'checklist'
  | 'units'
  | 'tracking'
  | 'ticket'
  | 'conversation';

/**
 * Bags the unbox terminal resolver needs — controller surface + PO-note state
 * + per-tab imperative bridges.
 */
export interface UnboxTerminalContext {
  row: ReceivingLineRow;
  poNote: PoNoteTabState;
  receive: UnboxReceiveTerminalInput;
  bridges: UnboxTabBridges;
  /** Focus the serial scan input (units → overview handoff). */
  focusSerialScan: () => void;
  /** Switch workspace tab (e.g. units Add serial → overview). */
  setUnboxView: (view: UnboxView) => void;
  /** Open linked support ticket reply surface when possible. */
  focusTicketReply?: () => void;
}

/** Subset of useUnboxLineController fields that drive the Print · Receive dock. */
export interface UnboxReceiveTerminalInput {
  printReceivePrimaryLabel: string;
  printThenReceiveTitle: string;
  combinedReviewDisabled: boolean;
  combinedReviewDisabledReason?: string | null;
  splitMenuAriaLabel: string;
  splitMenuHoverTitle: string;
  canPrintReview: boolean;
  canReceiveReview: boolean;
  canZohoReceive: boolean;
  isUnfound: boolean;
  receiveMenuLabel: string;
  receiveMenuTitle?: string;
  handlePrintAndReceive: () => void | Promise<void>;
  runPrintLabel: () => void;
  handleReceive: (mode: 'scan_only' | 'zoho_receive' | 'local_receive') => void | Promise<void>;
}
