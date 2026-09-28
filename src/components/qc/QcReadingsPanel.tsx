'use client';

import { useId, useState } from 'react';
import { Plus } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import type { DiagnosticReading, DiagnosticSeverity } from '@/lib/qc/contracts';
import { QC_SEVERITY_LABEL, qcBenchErrorText, qcReadingFace, type ManualReadingDraft } from '@/lib/qc/bench-client';
import { useQcCodes, type QcBench } from '@/lib/qc/use-qc-bench';
import { formatMonthDayTimePST } from '@/utils/date';

const SEVERITY_BADGE: Record<DiagnosticSeverity, 'secondary' | 'warning' | 'destructive'> = {
  INFO: 'secondary',
  WARNING: 'warning',
  CRITICAL: 'destructive',
};

const EMPTY_DRAFT: ManualReadingDraft = { kind: '', code: '', value: '' };

function ReadingRow({ reading }: { reading: DiagnosticReading }) {
  const face = qcReadingFace(reading.value);
  return (
    <li className="flex flex-col gap-0.5 border-b border-mode-rule px-3 py-2 last:border-b-0" data-testid="qc-reading-row">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate font-mono text-role-caption font-semibold text-mode-ink">
          {face.label ?? reading.kind}
          {reading.code ? <span className="text-mode-muted"> · {reading.code}</span> : null}
        </span>
        {reading.codeSeverity ? (
          <Badge variant={SEVERITY_BADGE[reading.codeSeverity]}>{QC_SEVERITY_LABEL[reading.codeSeverity]}</Badge>
        ) : null}
        {face.passed != null ? (
          <Badge variant={face.passed ? 'success' : 'destructive'}>{face.passed ? 'Passed' : 'Failed'}</Badge>
        ) : null}
        <span className="ml-auto shrink-0 text-role-micro text-mode-muted">
          {reading.source === 'HUB' ? 'Hub' : 'Manual'} ·{' '}
          <time dateTime={reading.readAt}>{formatMonthDayTimePST(reading.readAt)}</time>
        </span>
      </div>
      {face.text ? <p className="break-words font-mono text-role-caption text-mode-ink">{face.text}</p> : null}
      {reading.codeMeaning ? <p className="text-role-caption text-mode-muted">{reading.codeMeaning}</p> : null}
    </li>
  );
}

/** Manual reading entry — kind, optional catalog code, value; stamped into the open session when there is one. */
function ManualReadingForm({ bench, onDone }: { bench: QcBench; onDone: () => void }) {
  const [draft, setDraft] = useState<ManualReadingDraft>(EMPTY_DRAFT);
  const codes = useQcCodes(true);
  const codeListId = useId();
  const kindListId = useId();
  const kinds = [...new Set(bench.readings.map((r) => r.kind))];
  const { addReading } = bench;

  const submit = () => {
    if (!draft.kind.trim() || addReading.isPending) return;
    addReading.mutate(draft, {
      onSuccess: () => {
        setDraft(EMPTY_DRAFT);
        onDone();
      },
    });
  };

  return (
    <form
      className="flex flex-col gap-2 border-b border-mode-rule px-3 py-2.5"
      aria-label="Add manual reading"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Kind"
          value={draft.kind}
          onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
          list={kindListId}
          mono
          autoFocus
          required
        />
        <TextField
          label="Code (optional)"
          value={draft.code}
          onChange={(code) => setDraft((d) => ({ ...d, code }))}
          list={codeListId}
          mono
        />
      </div>
      <TextField label="Value" value={draft.value} onChange={(value) => setDraft((d) => ({ ...d, value }))} />
      <datalist id={kindListId}>
        {kinds.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <datalist id={codeListId}>
        {(codes.data ?? []).map((c) => (
          <option key={c.id} value={c.code}>
            {c.meaning}
          </option>
        ))}
      </datalist>
      {addReading.error ? (
        <Alert variant="destructive">
          <AlertDescription>{qcBenchErrorText(addReading.error)}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={addReading.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="primary" loading={addReading.isPending} disabled={!draft.kind.trim()}>
          Add reading
        </Button>
      </div>
    </form>
  );
}

/**
 * The unit's diagnostic readings (hub + manual), newest first, each with its catalog meaning and
 * severity. Refreshes every few seconds while a session is open (useQcBench polls).
 */
export function QcReadingsPanel({ bench }: { bench: QcBench }) {
  const [adding, setAdding] = useState(false);
  const { readings } = bench;

  return (
    <section aria-labelledby="qc-readings-heading" className="flex flex-col border-b border-mode-rule">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
        <h3 id="qc-readings-heading" className="mode-label text-mode-muted">
          Readings
        </h3>
        <span className="font-mono text-role-micro tabular-nums text-mode-muted">{readings.length}</span>
        {bench.open ? <span className="text-role-micro text-mode-muted">· live</span> : null}
        {!adding ? (
          <Button size="sm" variant="ghost" icon={<Plus />} className="ml-auto" onClick={() => setAdding(true)}>
            Add reading
          </Button>
        ) : null}
      </div>
      {adding ? <ManualReadingForm bench={bench} onDone={() => setAdding(false)} /> : null}
      {bench.readingsError ? (
        <div className="px-3 py-2">
          <Alert variant="destructive">
            <AlertDescription>{qcBenchErrorText(bench.readingsError)}</AlertDescription>
          </Alert>
        </div>
      ) : bench.readingsLoading ? (
        <p className="px-3 py-2 text-role-caption text-mode-muted">Loading readings…</p>
      ) : readings.length === 0 ? (
        <p className="px-3 py-2 text-role-caption text-mode-muted">No readings yet — plug the unit into the hub or add one.</p>
      ) : (
        <ul aria-label="Readings, newest first" className="max-h-80 overflow-y-auto">
          {readings.map((r) => (
            <ReadingRow key={r.id} reading={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
