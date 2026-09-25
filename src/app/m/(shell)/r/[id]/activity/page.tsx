'use client';

import { Suspense } from 'react';
import { useCartonHub } from '@/components/mobile/receiving/useCartonHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { formatCartonStamp, plural, type CartonHubData, type CartonHubEvent } from '@/lib/receiving/carton-hub';

function eventTitle(event: CartonHubEvent): string {
  const what = event.event_type.replace(/_/g, ' ').toLowerCase();
  const subject = [event.sku, event.serial_number].filter(Boolean).join(' · ');
  const where = event.bin_name ? ` → ${event.bin_name}` : '';
  return `${what.charAt(0).toUpperCase()}${what.slice(1)}${subject ? ` · ${subject}` : ''}${where}`;
}

/** `/m/r/[id]/activity` — the carton's recent timeline, newest first, read-only. */
function CartonActivityInner() {
  const { id, data, loading, error, reload } = useCartonHub();
  return (
    <DetailRecordFrame<CartonHubData>
      record={data}
      state={{ loading, error, onRetry: () => void reload() }}
      bar={{
        title: `R-${id}`,
        mono: true,
        subtitle: 'Activity',
        backHref: `/m/r/${id}`,
        meta: (d) => plural(d.events.length, 'event'),
      }}
    >
      {(d) => (
        <div className="flex-1 space-y-4 px-mode-page py-mode-page">
          {d.events.length > 0 ? (
            <ol aria-label={`Activity on R-${id}`} className="overflow-hidden rounded-mode border border-mode-edge bg-mode-panel">
              {d.events.map((event) => (
                <li key={event.id} className="border-b border-mode-rule px-mode-page py-3 last:border-b-0">
                  <p className="text-mode-body font-semibold text-mode-ink">{eventTitle(event)}</p>
                  <p className="mt-0.5 text-role-caption text-mode-muted">
                    {[event.actor_name || 'System', formatCartonStamp(event.occurred_at), event.station]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {event.notes ? <p className="mt-0.5 text-role-caption text-mode-muted">{event.notes}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-10 text-center text-sm font-semibold text-text-soft">Nothing recorded on this carton yet.</p>
          )}
        </div>
      )}
    </DetailRecordFrame>
  );
}

export default function CartonActivityPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <CartonActivityInner />
    </Suspense>
  );
}
