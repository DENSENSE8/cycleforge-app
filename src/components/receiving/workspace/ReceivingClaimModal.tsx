'use client';

import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import type { ClaimModalProps } from './claim/hooks/useReceivingClaimController';
import { ReceivingClaimPanel } from './ReceivingClaimPanel';

/** Make-a-claim right slide-over — Testing / dashboard / triage hosts. */
export function ReceivingClaimModal(props: ClaimModalProps) {
  return (
    <RightPaneOverlay
      open={props.open}
      onClose={props.onClose}
      align="right"
      anchor="viewport"
      resizable
      width={560}
      minWidth={420}
      storageKey="receiving-claim-drawer-width"
      aria-label="File a claim"
    >
      <ReceivingClaimPanel {...props} />
    </RightPaneOverlay>
  );
}
