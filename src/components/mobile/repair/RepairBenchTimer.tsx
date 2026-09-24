'use client';

import { Button } from '@/design-system/primitives';
import { Check, Play } from '@/components/Icons';
import {
  benchSessionElapsedMs,
  formatBenchClock,
  formatBenchDuration,
  summarizeBenchSessions,
  type RepairBenchSessionRecord,
} from '@/lib/repair/bench-session';
import { formatMonthDayTimePST } from '@/utils/date';
import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { useBenchTick } from './useRepairBenchSession';

interface Props {
  sessions: RepairBenchSessionRecord[];
  /** The caller's own open session. */
  open: RepairBenchSessionRecord | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  serverNowMs: () => number;
  onStart: () => void;
  onStop: () => void;
}

/**
 * The bench timer: Start / Stop the caller's session on this repair. The
 * clock face is `server now − server started_at`; both stamps are the
 * server's, so there is nothing to type and nothing a phone clock can skew.
 */
export function RepairBenchTimer({ sessions, open, loading, busy, error, serverNowMs, onStart, onStop }: Props) {
  const now = useBenchTick(open != null, serverNowMs);
  const summary = summarizeBenchSessions(sessions, now);
  const closed = sessions.filter((s) => s.ended_at);

  return (
    <section aria-labelledby="rs-bench-timer" className="space-y-2">
      <DetailSectionHeading id="rs-bench-timer">Bench timer</DetailSectionHeading>
      <div className="rounded-mode border border-mode-edge bg-mode-panel">
        <div className="flex items-center gap-3 px-mode-page py-3">
          <div className="min-w-0 flex-1">
            {open ? (
              <>
                <p
                  className="font-mono text-2xl font-semibold tabular-nums text-mode-ink"
                  aria-live="off"
                  data-testid="bench-clock"
                >
                  {formatBenchClock(benchSessionElapsedMs(open, now))}
                </p>
                <p className="text-role-caption text-mode-muted">
                  Started <time dateTime={open.started_at}>{formatMonthDayTimePST(open.started_at)}</time>
                </p>
              </>
            ) : (
              <>
                <p className="text-mode-body font-semibold text-mode-ink">
                  {loading ? 'Loading…' : 'Not running'}
                </p>
                <p className="text-role-caption text-mode-muted">
                  {summary.count > 0
                    ? `${formatBenchDuration(summary.totalMs)} on the bench across ${summary.count} session${summary.count === 1 ? '' : 's'}`
                    : 'Start the timer when the unit is on your bench.'}
                </p>
              </>
            )}
          </div>
          {open ? (
            <Button variant="secondary" size="lg" icon={<Check />} loading={busy} onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" size="lg" icon={<Play />} loading={busy} disabled={loading} onClick={onStart}>
              Start
            </Button>
          )}
        </div>

        {closed.length > 0 ? (
          <ul className="border-t border-mode-rule">
            {closed.slice(0, 5).map((s) => (
              <li
                key={s.id}
                className="flex items-baseline justify-between gap-3 border-b border-mode-rule px-mode-page py-2 text-role-caption last:border-b-0"
              >
                <span className="min-w-0 truncate text-mode-muted">
                  <time dateTime={s.started_at}>{formatMonthDayTimePST(s.started_at)}</time>
                  {s.staff_name ? ` · ${s.staff_name}` : ''}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-mode-ink">
                  {formatBenchDuration(benchSessionElapsedMs(s, now))}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-role-caption font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
