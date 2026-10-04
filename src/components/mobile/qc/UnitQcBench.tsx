'use client';

import { useEffect, useState } from 'react';
import { Cpu, Play, Plus } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { Button } from '@/design-system/primitives';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { TextField } from '@/design-system/primitives/TextField';
import { QC_OUTCOMES_BY_KIND, type DiagnosticSeverity, type QcSessionOutcome } from '@/lib/qc/contracts';
import {
  QC_OUTCOME_LABEL,
  QC_SESSION_KIND_LABEL,
  QC_SEVERITY_LABEL,
  defaultQcSessionKind,
  qcBenchErrorText,
  qcReadingFace,
  qcSessionElapsedMs,
  qcSessionHubId,
  type ManualReadingDraft,
} from '@/lib/qc/bench-client';
import { useQcBench, useQcClock, useQcCodes, type QcBench } from '@/lib/qc/use-qc-bench';
import { formatBenchClock, formatBenchDuration } from '@/lib/repair/bench-session';
import { formatMonthDayTimePST } from '@/utils/date';

const MESSAGE = 'bg-mode-panel px-mode-page py-3 text-mode-body text-mode-muted';
const ERROR = 'bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700';

const START_KINDS = [
  { id: 'TEST', label: QC_SESSION_KIND_LABEL.TEST },
  { id: 'REPAIR', label: QC_SESSION_KIND_LABEL.REPAIR },
];

const OUTCOME_VARIANT: Partial<Record<QcSessionOutcome, 'success' | 'dangerSoft'>> = {
  PASS: 'success',
  REPAIRED: 'success',
  FAIL: 'dangerSoft',
  NOT_REPAIRED: 'dangerSoft',
};

const SEVERITY_BADGE: Record<DiagnosticSeverity, 'secondary' | 'warning' | 'destructive'> = {
  INFO: 'secondary',
  WARNING: 'warning',
  CRITICAL: 'destructive',
};

const EMPTY_DRAFT: ManualReadingDraft = { kind: '', code: '', value: '' };

function SessionSection({ bench, unitStatus }: { bench: QcBench; unitStatus: string }) {
  const { open, start, end } = bench;
  const suggested = defaultQcSessionKind(unitStatus);
  const [kind, setKind] = useState<'TEST' | 'REPAIR'>(suggested);
  useEffect(() => setKind(suggested), [suggested]);
  const now = useQcClock(open != null, bench.offsetMs);
  const hubId = open ? qcSessionHubId(open, bench.readings) : null;
  const last = open ? null : (bench.sessions.find((s) => s.endedAt != null) ?? null);
  const error = start.error ?? end.error ?? bench.sessionsError;

  return (
    <section aria-labelledby="qc-session" className="divide-y divide-mode-rule">
      <DetailSectionHeading id="qc-session">Bench session</DetailSectionHeading>
      {open ? (
        <div className="flex flex-col gap-3 bg-mode-panel px-mode-page py-3">
          <div className="flex items-center gap-3">
            <p
              className="font-mono text-2xl font-semibold tabular-nums text-mode-ink"
              aria-live="off"
              data-testid="qc-session-clock"
            >
              {formatBenchClock(qcSessionElapsedMs(open, now))}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{QC_SESSION_KIND_LABEL[open.kind]}</Badge>
              {hubId ? (
                <Badge variant="outline" data-testid="qc-session-hub">
                  <Cpu aria-hidden />
                  {hubId}
                </Badge>
              ) : null}
            </div>
          </div>
          <p className="text-role-caption text-mode-muted">
            Started <time dateTime={open.startedAt}>{formatMonthDayTimePST(open.startedAt)}</time>
          </p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="End session with outcome">
            {QC_OUTCOMES_BY_KIND[open.kind].map((outcome) => (
              <Button
                key={outcome}
                size="lg"
                className="w-full"
                variant={OUTCOME_VARIANT[outcome] ?? 'secondary'}
                loading={end.isPending && end.variables?.outcome === outcome}
                disabled={end.isPending}
                onClick={() => end.mutate({ sessionId: open.id, outcome })}
              >
                End · {QC_OUTCOME_LABEL[outcome]}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 bg-mode-panel px-mode-page py-3">
          <div className="flex items-center gap-3">
            <TabSwitch tabs={START_KINDS} activeTab={kind} onTabChange={(id) => setKind(id as 'TEST' | 'REPAIR')} />
            <Button
              size="lg"
              variant="primary"
              icon={<Play />}
              className="ml-auto"
              loading={start.isPending}
              disabled={bench.sessionsLoading}
              onClick={() => start.mutate(kind)}
            >
              Start
            </Button>
          </div>
          <p className="text-role-caption text-mode-muted">
            {bench.sessionsLoading
              ? 'Loading sessions…'
              : last
                ? `Last: ${QC_SESSION_KIND_LABEL[last.kind]} · ${formatBenchDuration(qcSessionElapsedMs(last, now))}${
                    last.outcome ? ` · ${QC_OUTCOME_LABEL[last.outcome]}` : ''
                  }${last.staffName ? ` · ${last.staffName}` : ''}`
                : 'Start a session when the unit is on your bench.'}
          </p>
        </div>
      )}
      {error ? (
        <p role="alert" className={ERROR}>
          {qcBenchErrorText(error)}
        </p>
      ) : null}
    </section>
  );
}

/** Manual reading entry, inline under the list — kind, optional catalog code, value. */
function ManualReadingForm({ bench, onDone }: { bench: QcBench; onDone: () => void }) {
  const [draft, setDraft] = useState<ManualReadingDraft>(EMPTY_DRAFT);
  const codes = useQcCodes(true);
  const { addReading } = bench;

  const submit = () => {
    if (!draft.kind.trim() || addReading.isPending) return;
    addReading.mutate(draft, { onSuccess: onDone });
  };

  return (
    <form
      aria-label="Add manual reading"
      className="flex flex-col gap-3 bg-mode-panel px-mode-page py-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextField
        label="Kind"
        value={draft.kind}
        onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
        mono
        required
        autoFocus
        autoCapitalize="characters"
      />
      <TextField
        label="Code (optional)"
        value={draft.code}
        onChange={(code) => setDraft((d) => ({ ...d, code }))}
        list="qc-mobile-codes"
        mono
        autoCapitalize="characters"
      />
      <datalist id="qc-mobile-codes">
        {(codes.data ?? []).map((c) => (
          <option key={c.id} value={c.code}>
            {c.meaning}
          </option>
        ))}
      </datalist>
      <TextField label="Value" value={draft.value} onChange={(value) => setDraft((d) => ({ ...d, value }))} />
      {addReading.error ? (
        <p role="alert" className="text-role-caption font-semibold text-rose-700">
          {qcBenchErrorText(addReading.error)}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="lg" variant="ghost" className="w-full" onClick={onDone} disabled={addReading.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="lg"
          variant="primary"
          className="w-full"
          loading={addReading.isPending}
          disabled={!draft.kind.trim()}
        >
          Add
        </Button>
      </div>
    </form>
  );
}

function ReadingsSection({ bench }: { bench: QcBench }) {
  const [adding, setAdding] = useState(false);
  const { readings } = bench;
  return (
    <section aria-labelledby="qc-readings" className="divide-y divide-mode-rule">
      <DetailSectionHeading id="qc-readings">
        Readings · {readings.length}
        {bench.open ? ' · live' : ''}
      </DetailSectionHeading>
      {bench.readingsError ? (
        <p role="alert" className={ERROR}>
          {qcBenchErrorText(bench.readingsError)}
        </p>
      ) : bench.readingsLoading ? (
        <p className={MESSAGE}>Loading readings…</p>
      ) : readings.length === 0 ? (
        <p className={MESSAGE}>No readings yet.</p>
      ) : (
        <ul aria-label="Readings, newest first" className="divide-y divide-mode-rule bg-mode-panel">
          {readings.map((r) => {
            const face = qcReadingFace(r.value);
            return (
              <li key={r.id} className="flex flex-col gap-0.5 px-mode-page py-2.5" data-testid="qc-reading-row">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="min-w-0 truncate font-mono text-role-caption font-semibold text-mode-ink">
                    {face.label ?? r.kind}
                    {r.code ? <span className="text-mode-muted"> · {r.code}</span> : null}
                  </span>
                  {r.codeSeverity ? (
                    <Badge variant={SEVERITY_BADGE[r.codeSeverity]}>{QC_SEVERITY_LABEL[r.codeSeverity]}</Badge>
                  ) : null}
                  {face.passed != null ? (
                    <Badge variant={face.passed ? 'success' : 'destructive'}>{face.passed ? 'Passed' : 'Failed'}</Badge>
                  ) : null}
                </div>
                {face.text ? <p className="break-words font-mono text-mode-body text-mode-ink">{face.text}</p> : null}
                {r.codeMeaning ? <p className="text-role-caption text-mode-muted">{r.codeMeaning}</p> : null}
                <p className="text-role-caption text-mode-muted">
                  {r.source === 'HUB' ? `Hub${r.hubDeviceId ? ` ${r.hubDeviceId}` : ''}` : 'Manual'} ·{' '}
                  <time dateTime={r.readAt}>{formatMonthDayTimePST(r.readAt)}</time>
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <ManualReadingForm bench={bench} onDone={() => setAdding(false)} />
      ) : (
        <div className="bg-mode-panel px-mode-page py-3">
          <Button size="lg" variant="secondary" icon={<Plus />} className="w-full" onClick={() => setAdding(true)}>
            Add reading
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * The phone's QC bench for one unit: start / end a session and record live or
 * manual readings. Product checklist execution and the bottom verdict dock are
 * owned by UnitQcRunner; ranked "next steps" do not belong on the V2 phone job.
 */
export function UnitQcBench({
  unitId,
  unitStatus,
}: {
  unitId: number;
  unitStatus: string;
}) {
  const bench = useQcBench(unitId);

  return (
    <>
      <SessionSection bench={bench} unitStatus={unitStatus} />
      <ReadingsSection bench={bench} />
    </>
  );
}
