'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Phone } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { SearchField } from '@/design-system/primitives/SearchField';
import { TimelineSection } from '@/components/ui/TimelineSection';
import { FilterMenu, FilterMenuGroupLabel, FilterMenuRow } from '@/components/ui/FilterMenu';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { DATA_TABLE_TOOLBAR_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { callEventsToTimeline } from '@/lib/timeline';
import {
  parseCallDirection,
  CALL_DIRECTION_ITEMS,
} from '@/components/sidebar/support/support-sidebar-shared';
import { isNotConfigured, useCallEvents } from './useVoiceQueries';

/**
 * Calls mode — the Monitor body. A newest-first org call stream rendered through
 * the shared {@link EventTimeline} (via `callEventsToTimeline`).
 *
 * Direction is a compact filter beside the Calls find field — not a second
 * page-chrome band or a status tab. `all` omits `?direction=`.
 */
export function CallLogView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [directionMenuOpen, setDirectionMenuOpen] = useState(false);
  const direction = parseCallDirection(searchParams.get('direction'));
  const query = searchParams.get('q') ?? '';

  const setParam = useCallback(
    (key: 'direction' | 'q', value: string, dropWhenDefault: string | null = null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('mode', 'calls');
      if (!value || value === dropWhenDefault) params.delete(key);
      else params.set(key, value);
      router.replace(`/support?${params.toString()}`);
    },
    [router, searchParams],
  );

  const { data, isLoading, error } = useCallEvents({ direction, query: query.trim() });
  const notConfigured = isNotConfigured(error);

  const items = useMemo(() => callEventsToTimeline(data?.items ?? []), [data?.items]);

  const directionLabel = CALL_DIRECTION_ITEMS.find((item) => item.id === direction)?.label ?? 'All';

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
      <div
        className={cn(
          'flex min-w-0 shrink-0 items-center gap-2 border-b border-border-soft bg-surface-card pl-0 pr-2',
          PRIMARY_CHROME_ROW_FACE,
        )}
      >
        <FilterMenu
          open={directionMenuOpen}
          onOpenChange={setDirectionMenuOpen}
          hot={direction !== 'all'}
          label="Direction"
          hotActiveLabel={directionLabel}
        >
          <FilterMenuGroupLabel>Direction</FilterMenuGroupLabel>
          {CALL_DIRECTION_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <FilterMenuRow
                key={item.id}
                label={item.label}
                active={direction === item.id}
                leading={Icon ? <Icon className="h-3.5 w-3.5" /> : undefined}
                onClick={() => {
                  setParam('direction', item.id, 'all');
                  setDirectionMenuOpen(false);
                }}
              />
            );
          })}
        </FilterMenu>
        <SearchField
          value={query}
          onChange={(v) => setParam('q', v)}
          placeholder="Search caller or number…"
          className={cn('min-w-0 max-w-[22rem] flex-1 overflow-hidden', DATA_TABLE_TOOLBAR_CORNER)}
          tone="neutral"
          hideUnderline
          fillHost
        />
      </div>
      <div className="min-h-0 w-full flex-1 overflow-y-auto">
        <TimelineSection
          title="Calls"
          loading={isLoading}
          items={items}
          emptyMessage={query ? 'No calls match this search.' : 'No calls recorded yet.'}
          className="px-6 py-6"
        />
      </div>
    </div>
  );
}
