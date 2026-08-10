import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * Kind keys produced by STATION_TERMINAL_REGISTRY for unbox.
 *
 * There is exactly one live kind: the Unbox dock is carton-terminal, so it does
 * not vary with the selected display (see `unbox-terminal.tsx`). `none` stays so
 * the registry can still hide the dock.
 */
export type UnboxTerminalKind = 'mode-default' | 'none';

/**
 * Bags the unbox terminal resolver needs. Just the receive surface now —
 * the per-tab bridges (checklist / units / support) existed only to feed a
 * tab-aware dock and were deleted with it.
 */
export interface UnboxTerminalContext {
  row: ReceivingLineRow;
  receive: UnboxReceiveTerminalInput;
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
  /** Pre-disable when shipment missing or outbound serials would 409. */
  unreceiveMenuDisabled?: boolean;
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
  /** Open the label editor for the active kind (Unbox overview popovers). */
  requestLabelEditor?: () => void;
  handleReceive: (
    mode: 'scan_only' | 'zoho_receive' | 'local_receive' | 'unreceive',
  ) => void | Promise<boolean | void>;
}
