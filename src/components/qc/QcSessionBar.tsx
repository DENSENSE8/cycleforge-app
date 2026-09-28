'use client';

import { useEffect, useState } from 'react';
import { Cpu, Play } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/design-system/primitives';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { QC_OUTCOMES_BY_KIND, type QcSessionOutcome } from '@/lib/qc/contracts';
import {
  QC_OUTCOME_LABEL,
  QC_SESSION_KIND_LABEL,
  defaultQcSessionKind,
  qcBenchErrorText,
  qcSessionElapsedMs,
  qcSessionHubId,
} from '@/lib/qc/bench-client';
import { useQcClock, type QcBench } from '@/lib/qc/use-qc-bench';
import { formatBenchClock, formatBenchDuration } from '@/lib/repair/bench-session';
import { formatMonthDayTimePST } from '@/utils/date';

const START_KINDS = [
  { id: 'TEST', label: QC_SESSION_KIND_LABEL.TEST },
  { id: 'REPAIR', label: QC_SESSION_KIND_LABEL.REPAIR },
];

/** Outcome fills: the verdict-shaped ones keep their verdict tones; the rest stay neutral. */
const OUTCOME_VARIANT: Partial<Record<QcSessionOutcome, 'success' | 'dangerSoft'>> = {
  PASS: 'success',
  REPAIRED: 'success',
  FAIL: 'dangerSoft',
  NOT_REPAIRED: 'dangerSoft',
};

/**
 * Bench session for the selected unit — Start (TEST, or REPAIR when the unit came from repair),
 * the running clock, the hub it rides on, and End with an outcome. The outcome summarizes bench
 * time; the unit verdict stays on the verdict pills.
 */
export function QcSessionBar({ bench, unitStatus }: { bench: QcBench; unitStatus: string | null | undefined }) {
  const { open, sessions, start, end } = bench;
  const suggested = defaultQcSessionKind(unitStatus);
  const [kind, setKind] = useState<'TEST' | 'REPAIR'>(suggested);
  useEffect(() => setKind(suggested), [suggested]);
  const now = useQcClock(open != null, bench.offsetMs);
  const hubId = open ? qcSessionHubId(open, bench.readings) : null;
  const last = open ? null : (sessions.find((s) => s.endedAt != null) ?? null);
  const error = start.error ?? end.error ?? bench.sessionsError;

  return (
    <section aria-labelledby="qc-session-heading" className="flex flex-col gap-2 border-b border-mode-rule px-3 py-2.5">
      <h3 id="qc-session-heading" className="mode-label text-mode-muted">
        Bench session
      </h3>

      {open ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className="font-mono text-xl font-semibold tabular-nums text-mode-ink"
              aria-live="off"
              data-testid="qc-session-clock"
            >
              {formatBenchClock(qcSessionElapsedMs(open, now))}
            </span>
            <Badge variant="secondary">{QC_SESSION_KIND_LABEL[open.kind]}</Badge>
            {hubId ? (
              <Badge variant="outline" title="Diagnostic hub" data-testid="qc-session-hub">
                <Cpu aria-hidden />
                {hubId}
              </Badge>
            ) : null}
            <span className="ml-auto text-role-micro text-mode-muted">
              Started <time dateTime={open.startedAt}>{formatMonthDayTimePST(open.startedAt)}</time>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="End session with outcome">
            <span className="text-role-micro font-semibold text-mode-muted">End as</span>
            {QC_OUTCOMES_BY_KIND[open.kind].map((outcome) => (
              <Button
                key={outcome}
                size="sm"
                variant={OUTCOME_VARIANT[outcome] ?? 'secondary'}
                loading={end.isPending && end.variables?.outcome === outcome}
                disabled={end.isPending}
                onClick={() => end.mutate({ sessionId: open.id, outcome })}
              >
                {QC_OUTCOME_LABEL[outcome]}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <TabSwitch
              tabs={START_KINDS}
              activeTab={kind}
              onTabChange={(id) => setKind(id as 'TEST' | 'REPAIR')}
              size="sm"
              fit="hug"
            />
            <Button
              size="sm"
              variant="primary"
              icon={<Play />}
              className="ml-auto"
              loading={start.isPending}
              disabled={bench.sessionsLoading}
              onClick={() => start.mutate(kind)}
            >
              Start session
            </Button>
          </div>
          <p className="text-role-micro text-mode-muted">
            {bench.sessionsLoading
              ? 'Loading sessions…'
              : last
                ? `Last: ${QC_SESSION_KIND_LABEL[last.kind]} · ${formatBenchDuration(qcSessionElapsedMs(last, now))}${
                    last.outcome ? ` · ${QC_OUTCOME_LABEL[last.outcome]}` : ''
                  }${last.staffName ? ` · ${last.staffName}` : ''}`
                : 'No session on this unit yet.'}
          </p>
        </>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{qcBenchErrorText(error)}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
