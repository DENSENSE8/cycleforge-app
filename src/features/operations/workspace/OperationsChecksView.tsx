'use client';

/**
 * Operations → Checks — the daily-check roster report.
 *
 * Home Daily is the list you run. This is who still owes it. Same live query
 * (`GET /api/daily-checks`); not a stored report, not a second door on Home.
 */

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { MonitorPageShell } from '@/design-system/components/monitor';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  addDaysToDateKey,
  formatDateKeyShort,
  getCurrentPSTDateKey,
  parseDateKey,
} from '@/utils/date';
import { useDailyChecks } from '@/features/home/useDailyChecks';
import { DailyCheckReportPanel } from '@/features/daily-checks/DailyCheckReportPanel';

export function OperationsChecksView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const todayKey = getCurrentPSTDateKey();
  const rawDate = searchParams.get('date');
  const dateKey = rawDate && parseDateKey(rawDate) ? rawDate : todayKey;
  const isToday = dateKey === todayKey;

  const stepDay = useCallback(
    (delta: number) => {
      const next = addDaysToDateKey(dateKey, delta);
      const params = new URLSearchParams(searchParams.toString());
      params.set('mode', 'checks');
      if (next === todayKey) params.delete('date');
      else params.set('date', next);
      router.replace(`/operations?${params.toString()}`);
    },
    [dateKey, router, searchParams, todayKey],
  );

  const { data, isLoading, isError } = useDailyChecks(dateKey);

  return (
    <MonitorPageShell>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => stepDay(-1)}
          icon={<ChevronLeft className="h-4 w-4" />}
          aria-label="Previous day"
        />
        <div className="min-w-0 flex-1">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Daily checks</p>
          <h1 className="truncate text-lg font-semibold text-text-strong">
            {isToday ? "Today's roster" : formatDateKeyShort(dateKey)}
          </h1>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={isToday}
          onClick={() => stepDay(1)}
          icon={<ChevronRight className="h-4 w-4" />}
          aria-label="Next day"
        />
        <Link
          href="/"
          className={cn(
            'shrink-0 text-role-caption font-medium text-text-muted hover:text-text-default',
            focusRing('control'),
          )}
        >
          Run the list
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-role-caption text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption font-semibold text-rose-700">
          Could not load the daily-check report. Try refreshing.
        </div>
      ) : data ? (
        <DailyCheckReportPanel
          report={data}
          heading={isToday ? "Today's report" : `Report · ${formatDateKeyShort(dateKey)}`}
        />
      ) : null}
    </MonitorPageShell>
  );
}
