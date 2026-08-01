'use client';

import { StationTerminalDock } from '@/components/station/terminal';
import { resolveUnboxReceiveTerminal } from './terminal/unbox-terminal';
import type { UnboxReceiveTerminalInput } from './terminal/types';

/**
 * Thin adapter around {@link StationTerminalDock} for the unbox Print · Receive
 * dock. Prefer resolving via `resolveUnboxTerminal` + `useStationTerminalAction`
 * in the panel. This wrapper exists for any call site that still wants the
 * receive dock without the full terminal registry hook.
 */
export function LineReceiveActionBar({
  assignedTechId,
  primaryLabel,
  primaryTitle,
  primaryDisabled,
  disabledReason,
  splitMenuAriaLabel,
  splitMenuHoverTitle,
  canPrint,
  canReceive,
  canZohoReceive,
  isLocalReceive = false,
  receiveMenuLabel,
  receiveMenuTitle,
  maxWidthClass = 'max-w-[720px]',
  onPrintAndReceive,
  onPrintOnly,
  onReceive,
  onLocalReceive,
}: {
  assignedTechId: number | null | undefined;
  primaryLabel: string;
  primaryTitle: string;
  primaryDisabled: boolean;
  disabledReason?: string | null;
  splitMenuAriaLabel: string;
  splitMenuHoverTitle: string;
  canPrint: boolean;
  canReceive: boolean;
  canZohoReceive: boolean;
  isLocalReceive?: boolean;
  receiveMenuLabel: string;
  receiveMenuTitle?: string;
  maxWidthClass?: string;
  onPrintAndReceive: () => void;
  onPrintOnly: () => void;
  onMarkScanned: () => void;
  onReceive: () => void;
  onLocalReceive: () => void;
}) {
  const receive: UnboxReceiveTerminalInput = {
    printReceivePrimaryLabel: primaryLabel,
    printThenReceiveTitle: primaryTitle,
    combinedReviewDisabled: primaryDisabled,
    combinedReviewDisabledReason: disabledReason,
    splitMenuAriaLabel,
    splitMenuHoverTitle,
    canPrintReview: canPrint,
    canReceiveReview: canReceive,
    canZohoReceive,
    isUnfound: isLocalReceive,
    receiveMenuLabel,
    receiveMenuTitle,
    handlePrintAndReceive: onPrintAndReceive,
    runPrintLabel: onPrintOnly,
    handleReceive: (mode) => {
      if (mode === 'local_receive') onLocalReceive();
      else if (mode === 'zoho_receive') onReceive();
      // scan_only was never wired into the prior menu — no-op here.
    },
  };

  const vm = resolveUnboxReceiveTerminal({
    row: { id: 0 } as never,
    receive,
  });

  return (
    <StationTerminalDock
      vm={{ ...vm, maxWidth: maxWidthClass }}
      assignedTechId={assignedTechId}
    />
  );
}
