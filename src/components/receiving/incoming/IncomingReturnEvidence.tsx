'use client';

import { EvidenceTitle } from '@/design-system/components/record-ledger/RecordEvidence';
import { IncomingAddInboundForm } from '@/components/sidebar/receiving/incoming/IncomingAddInboundForm';

export function IncomingReturnEvidence({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EvidenceTitle sub="Creates the inbound return and files its linked support ticket">
        Add return
      </EvidenceTitle>
      <IncomingAddInboundForm
        receivingType="RETURN"
        autoFocus
        onClose={onClose}
      />
    </div>
  );
}
