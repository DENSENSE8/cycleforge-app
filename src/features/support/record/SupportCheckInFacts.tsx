'use client';

/**
 * A post-purchase check-in's own facts, one ruled row each — what nothing
 * else on the record says: the products, when the order was delivered /
 * picked up, when the check-in is due, and the check-in's state. The order,
 * platform, customer and owners are the table's and the record header's; who
 * was contacted and who replied is the thread. Nothing for a conversation
 * that is not a check-in.
 */

import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import type { SupportItemView } from '@/lib/support/conversation/model';
import { formatMonthDayTimePST } from '@/utils/date';
import { supportCheckInFacts } from '@/lib/support/record/support-record-model';

export function SupportCheckInFacts({ item }: { item: Pick<SupportItemView, 'checkIn' | 'primaryOrder'> }) {
  const facts = supportCheckInFacts(item, formatMonthDayTimePST);
  if (facts.length === 0) return null;
  return (
    <section aria-label="Check-in" className="flex flex-col" data-testid="support-check-in-facts">
      {facts.map((f) => (
        <EvidenceFactRow key={f.id} label={f.label}>
          <span className="min-w-0 break-words text-role-caption text-text-default" data-testid={`support-check-in-${f.id}`}>
            {f.value}
          </span>
        </EvidenceFactRow>
      ))}
    </section>
  );
}
