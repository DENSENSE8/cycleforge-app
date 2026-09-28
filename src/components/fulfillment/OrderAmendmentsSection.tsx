'use client';

import { TimelineSection } from '@/components/ui/TimelineSection';
import { amendmentsToTimeline, type AmendmentTimelineRow } from '@/lib/timeline';

/** The order's substitutions, rendered through the shared EventTimeline (via TimelineSection — header + skeleton + empty for free). */
interface OrderAmendmentsSectionProps {
  rows: AmendmentTimelineRow[];
  loading?: boolean;
  title?: string;
  density?: 'comfortable' | 'compact';
}

export function OrderAmendmentsSection({
  rows,
  loading = false,
  title = 'Substitutions',
  density = 'compact',
}: OrderAmendmentsSectionProps) {
  const pending = rows.filter((r) => r.status === 'PENDING').length;
  return (
    <TimelineSection
      title={title}
      items={amendmentsToTimeline(rows)}
      loading={loading}
      density={density}
      emptyMessage="No substitutions on this order."
      headerRight={
        pending > 0 ? (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-role-eyebrow text-amber-700 ring-1 ring-inset ring-amber-200">
            {pending} pending
          </span>
        ) : undefined
      }
    />
  );
}
