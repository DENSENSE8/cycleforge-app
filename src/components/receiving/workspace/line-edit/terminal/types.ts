import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { PoNoteTabState } from './usePoNoteTabState';
import type { UnboxTabBridges } from './unbox-tab-bridges';

export type UnboxView =
  | 'overview'
  | 'classify'
  | 'units'
  | 'checklist'
  | 'po-note'
  | 'tracking'
  | 'listings'
  | 'timeline'
  | 'support';

/** Kind keys produced by STATION_TERMINAL_REGISTRY for unbox tabs. */
export type UnboxTerminalKind =
  | 'mode-default'
  | 'po-note'
  | 'checklist'
  | 'units'
  | 'tracking'
  | 'listings'
  | 'classify'
  | 'timeline'
  | 'support'
  | 'none';

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
  /**
   * Line already reached DONE (`received_done_at` stamped). Collapses the dock
   * primary to print-only; re-receive stays in the split menu. Optional so the
   * legacy `LineReceiveActionBar` adapter keeps its current behaviour.
   */
  isReceived?: boolean;
  /**
   * Line has qty received or a DONE stamp — Unreceive is available even when
   * primary has collapsed to Print label. Optional for legacy adapters.
   */
  canUnreceive?: boolean;
  receiveMenuLabel: string;
  receiveMenuTitle?: string;
  /** Unreceive / Unreceive all — mirrors Receive all scope. */
  unreceiveMenuLabel?: string;
  unreceiveMenuTitle?: string;
  handlePrintAndReceive: () => void | Promise<void>;
  /** Print the currently selected label kind. */
  runPrintLabel: () => void;
  /** Print a specific workspace label kind (dock pre-select). */
  printKind?: (kind: string) => boolean;
  /** Available label kinds for the split-menu pre-select. */
  labelSelectOptions?: ReadonlyArray<{ key: string; name: string }>;
  selectedLabelKind?: string;
  setSelectedLabelKind?: (key: string) => void;
  activeLabelKind?: string;
  handleReceive: (
    mode: 'scan_only' | 'zoho_receive' | 'local_receive' | 'unreceive',
  ) => void | Promise<void>;
}
