'use client';

import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import type { ClaimModalProps } from './claim/hooks/useReceivingClaimController';
import { ReceivingClaimPanel } from './ReceivingClaimPanel';

/**
 * Make-a-claim centered overlay — Testing / dashboard / triage hosts.
 * Unbox mounts the same wizard body in {@link ReceivingClaimStack} (push column).
 *
 * Posts to /api/receiving/zendesk-claim (create) or /link (existing ticket).
 * Wizard state lives in {@link useReceivingClaimController}.
 */
export function ReceivingClaimModal(props: ClaimModalProps) {
  return (
    <RightPaneOverlay
      open={props.open}
      onClose={props.onClose}
      align="center"
      resizable
      storageKey="receiving-claim-modal-size"
      minWidth={460}
      minHeight={420}
      className="-mt-8 h-[min(86vh,44rem)] w-[min(94vw,52rem)]"
      aria-label="File a claim"
    >
      <ReceivingClaimPanel {...props} />
    </RightPaneOverlay>
  );
}
