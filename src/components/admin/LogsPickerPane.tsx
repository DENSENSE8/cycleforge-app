'use client';

/**
 * The event list beside the event record on /operations?mode=logs. It was
 * the old rail (`LogsSidebarPanel`); the contextual sidebar now owns its
 * filters (Find → `?search=`, Log → `?logKind=`, Actor → `?actorStaffId=`),
 * so this is the list — in the stage, left of the record it opens. Picking a
 * row writes `?eventId=`; the page (`offset`) is the stage's.
 */

import { useMemo } from 'react';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AdminPickerRow, useAdminUrlState } from './shared';
import { ADMIN_LOGS_PAGE_LIMIT, useAdminLogsPage, type UnifiedLogRow } from './admin-logs-query';

const KIND_DOT: Record<UnifiedLogRow['kind'], string> = {
  AUDIT: 'bg-blue-500',
  SAL: 'bg-purple-500',
};

/** `Today` · `Yesterday` · `Mon, Sep 28` — the heading over one day's events. */
function dayLabel(d: Date): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function LogsPickerPane({ offset, onOffsetChange }: { offset: number; onOffsetChange: (next: number) => void }) {
  const { searchParams, setParam } = useAdminUrlState();
  const selected = searchParams.get('eventId') ?? '';
  const query = useAdminLogsPage(offset);
  const hasMore = query.data?.hasMore ?? false;

  const days = useMemo(() => {
    const map = new Map<string, { label: string; rows: UnifiedLogRow[] }>();
    for (const row of query.data?.rows ?? []) {
      const d = new Date(row.created_at);
      const valid = !Number.isNaN(d.getTime());
      const key = valid ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : row.created_at;
      const day = map.get(key);
      if (day) day.rows.push(row);
      else map.set(key, { label: valid ? dayLabel(d) : row.created_at, rows: [row] });
    }
    return [...map.entries()].map(([key, day]) => ({ key, ...day }));
  }, [query.data]);

  return (
    <nav
      aria-label="Log events"
      aria-busy={query.isFetching || undefined}
      data-testid="operations-logs-picker"
      className="flex h-full w-72 shrink-0 flex-col border-r border-border-soft bg-surface-card"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {query.isLoading ? (
          <p className="px-2 py-6 text-center text-xs text-text-faint">Loading logs…</p>
        ) : days.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-text-faint">No logs.</p>
        ) : (
          days.map((day) => (
            <div key={day.key} className="mb-2">
              <p className="px-1 pb-1.5 pt-2 text-role-eyebrow text-text-faint">{day.label}</p>
              <ul className="space-y-1.5">
                {day.rows.map((row) => {
                  const d = new Date(row.created_at);
                  const time = Number.isNaN(d.getTime())
                    ? '-'
                    : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                  const actor = row.actor_name?.trim()
                    ? row.actor_name
                    : row.actor_staff_id != null
                      ? `#${row.actor_staff_id}`
                      : 'System';
                  return (
                    <li key={row.event_id}>
                      <AdminPickerRow
                        selected={selected === row.event_id}
                        onPick={() => setParam((p) => p.set('eventId', row.event_id))}
                        title={row.action}
                        subtitle={`${time} · ${actor}`}
                        trailing={
                          <HoverTooltip label={row.kind} asChild focusable={false}>
                            <span className={`h-2 w-2 rounded-full ${KIND_DOT[row.kind] ?? 'bg-border-emphasis'}`} />
                          </HoverTooltip>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-soft px-2 py-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOffsetChange(Math.max(0, offset - ADMIN_LOGS_PAGE_LIMIT))}
          disabled={offset <= 0}
        >
          Prev
        </Button>
        <span className="text-role-micro tabular-nums text-text-soft">
          {offset + 1}–{offset + (query.data?.rows.length ?? 0)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOffsetChange(offset + ADMIN_LOGS_PAGE_LIMIT)}
          disabled={!hasMore}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
