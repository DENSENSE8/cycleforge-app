'use client';

import { TimelineSection } from '@/components/ui/TimelineSection';
import type { SupportContextBundle } from '@/lib/support/context-types';

export function SupportContextActivity({
  bundle,
  loading = false,
}: {
  bundle: SupportContextBundle;
  loading?: boolean;
}) {
  const items = bundle.timeline ?? [];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <TimelineSection
        title="Activity"
        items={items}
        loading={loading}
        emptyMessage="No activity yet — link a ticket or scan at the dock."
        headerRight={
          !loading && items.length > 0 ? (
            <span>{items.length} events</span>
          ) : undefined
        }
      />
    </div>
  );
}
