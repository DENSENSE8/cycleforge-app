'use client';

/**
 * Unbox Claim — station-scoped right-edge **push** column.
 *
 * Composes {@link UnboxPushColumn}, the same shell as {@link ReceivingTicketStack}:
 * squeezes the Unbox workbench in-flow, reuses detail-stack surface tokens,
 * resizable, Escape / collapse close. Mutually exclusive with Displays, Ticket
 * (`?ticketView=1`) and receiving More details (`detail:receiving`) via URL +
 * close-details events.
 *
 * Gutter is {@link TICKET_PUSH_HOST_PAD_CLASS} on the LineEditPanel host —
 * not margin on this aside (overflow-hidden clips trailing margins).
 *
 * Opened via Make claim / Link ticket / `?claimView=1`.
 */

import type { ClaimModalProps } from './claim/hooks/useReceivingClaimController';
import { ReceivingClaimPanel } from './ReceivingClaimPanel';
import { UnboxPushColumn } from './UnboxPushColumn';

const CLAIM_PUSH_STORAGE_KEY = 'unbox-claim-push-width';
/**
 * Absolute ceiling for the claim wizard column — slightly wider than Ticket
 * chat (480) so photos/compose stay usable.
 */
const CLAIM_PUSH_MAX_WIDTH_PX = 560;

type ReceivingClaimStackProps = Omit<ClaimModalProps, 'open'> & {
  onClose: () => void;
};

export function ReceivingClaimStack({ onClose, ...panelProps }: ReceivingClaimStackProps) {
  return (
    <UnboxPushColumn
      ariaLabel="File a claim"
      testId="receiving-claim-push"
      storageKey={CLAIM_PUSH_STORAGE_KEY}
      maxWidthPx={CLAIM_PUSH_MAX_WIDTH_PX}
      resizeLabel="Resize claim panel"
      resizeTestId="unbox-claim-push-resize"
      resizeTooltip="Drag to resize claim · double-click for default"
      collapseLabel="Hide claim"
      onClose={onClose}
    >
      <ReceivingClaimPanel {...panelProps} open onClose={onClose} />
    </UnboxPushColumn>
  );
}
