'use client';

import { useParams } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { useMobileUnit } from '@/components/mobile/unit/useMobileUnit';
import { newestUnitEvents, unitEventLabel } from '@/components/mobile/unit/unitTimeline';
import { formatMonthDayTimePST } from '@/utils/date';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/**
 * `/m/u/[id]/history` — the unit's lifecycle events, newest first (last 25),
 * each stamped with the server's clock and actor. Read-only; shares the hub's
 * `useMobileUnit` cache entry, so opening it from the hub costs no fetch.
 */
export default function MobileUnitHistoryPage() {
  const params = useParams<{ id: string }>();
  const rawParam = String(params?.id ?? '');
  const { data, isLoading, error } = useMobileUnit(rawParam);
  const unit = data?.serial_unit ?? null;
  const events = newestUnitEvents(data?.events ?? []);

  return (
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        backHref={`/m/u/${rawParam}`}
        subtitle="History"
        title={unit?.serial_number ?? (isLoading ? 'Loading…' : 'Not found')}
        mono={Boolean(unit)}
      />

      <div className="flex-1 divide-y divide-mode-rule">
        {isLoading && <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>}
        {error && (
          <div className="bg-rose-50 px-mode-page py-3 text-mode-body font-semibold text-rose-700">
            Couldn&apos;t load unit — {error instanceof Error ? error.message : 'try again.'}
          </div>
        )}

        {unit ? (
          <section aria-labelledby="unit-events" className="divide-y divide-mode-rule">
            <DetailSectionHeading id="unit-events">Events</DetailSectionHeading>
            {events.length === 0 ? (
              <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-mode-muted">
                No events yet — pair an order or move into a bin to start the history.
              </p>
            ) : (
              <ol className="bg-mode-panel">
                {events.map((e) => (
                  <li key={e.id} className="border-b border-mode-rule px-mode-page py-2.5 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-mode-body font-semibold text-mode-ink">{unitEventLabel(e.event_type)}</span>
                      <time dateTime={e.occurred_at} className="shrink-0 text-role-caption text-mode-muted">
                        {formatMonthDayTimePST(e.occurred_at)}
                      </time>
                    </div>
                    {e.actor_name || e.station ? (
                      <p className="text-role-caption text-mode-muted">
                        {[e.actor_name, e.station].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    {e.prev_status && e.next_status && e.prev_status !== e.next_status ? (
                      <p className="font-mono text-role-caption text-mode-muted">
                        {e.prev_status} → {e.next_status}
                      </p>
                    ) : null}
                    {e.notes ? <p className="text-role-caption text-mode-ink">{e.notes}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}
      </div>
    </ModeRegion>
  );
}
