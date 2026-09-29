'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Phone } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { TimelineSection } from '@/components/ui/TimelineSection';
import { TableTabs } from '@/components/tables/TableStatusBar';
import { callEventsToTimeline } from '@/lib/timeline';
import {
  parseCallDirection,
  CALL_DIRECTION_ITEMS,
} from '@/components/sidebar/support/support-sidebar-shared';
import { isNotConfigured, useCallEvents } from './useVoiceQueries';

/**
 * Calls mode — the Monitor body. A newest-first org call stream rendered through
 * the shared {@link EventTimeline} (via `callEventsToTimeline`), reacting to the
 * ephemeral `?direction=` / `?q=` URL filters. Read-only: no durable selection.
 */
export function CallLogView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const direction = parseCallDirection(searchParams.get('direction'));
  const query = searchParams.get('q') ?? '';

  const setDirection = useCallback(
    (value: string, dropWhenDefault: string | null = null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('mode', 'calls');
      if (!value || value === dropWhenDefault) params.delete('direction');
      else params.set('direction', value);
      router.replace(`/support?${params.toString()}`);
    },
    [router, searchParams],
  );

  const { data, isLoading, error } = useCallEvents({ direction, query: query.trim() });
  const notConfigured = isNotConfigured(error);

  const items = useMemo(() => callEventsToTimeline(data?.items ?? []), [data?.items]);

  const tabs = useMemo(
    () => CALL_DIRECTION_ITEMS.map((item) => ({ id: item.id, label: item.label })),
    [],
  );

  if (notConfigured) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<Phone className="h-6 w-6 text-text-faint" />}
          title="Call log isn’t connected"
          description="Connect your phone system in Settings → Integrations to watch inbound, outbound, and missed calls stream in here."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
          <p className="text-role-caption font-semibold text-rose-700">Could not load the call log.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-border-soft bg-surface-card px-2 py-1">
        <TableTabs
          tabs={tabs}
          activeTab={direction}
          onTabChange={(id) => setDirection(id, 'all')}
          className="shrink-0 border-0 bg-transparent"
        />
      </div>
      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-6 py-6">
        <TimelineSection
          title="Calls"
          loading={isLoading}
          items={items}
          emptyMessage={query ? 'No calls match this search.' : 'No calls recorded yet.'}
        />
      </div>
    </div>
  );
}
