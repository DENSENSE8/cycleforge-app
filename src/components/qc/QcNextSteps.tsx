'use client';

import type { ReactNode } from 'react';
import { Sparkles, ThumbsDown, ThumbsUp } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/design-system/primitives';
import type { TriageSuggestion } from '@/lib/qc/triage/contracts';
import { TRIAGE_KIND_LABEL, qcBenchErrorText, triageConfidenceText } from '@/lib/qc/bench-client';
import type { QcTriage } from '@/lib/qc/use-qc-bench';

const KIND_BADGE: Record<TriageSuggestion['kind'], 'secondary' | 'warning' | 'default'> = {
  CHECK: 'secondary',
  FIX: 'warning',
  RETEST: 'default',
};

function StepRow({
  step,
  triage,
  retestActions,
}: {
  step: TriageSuggestion;
  triage: QcTriage;
  retestActions: ReactNode;
}) {
  const decided = triage.decisions[step.id] ?? null;
  const busy = triage.deciding === step.id;
  return (
    <li
      className="flex flex-col gap-1 border-b border-mode-rule px-3 py-2.5 last:border-b-0"
      data-testid="qc-triage-step"
      data-decision={decided ?? undefined}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="shrink-0 font-mono text-role-caption tabular-nums text-mode-muted">{step.rank}.</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={KIND_BADGE[step.kind]}>{TRIAGE_KIND_LABEL[step.kind]}</Badge>
            <span className="text-role-caption font-semibold text-mode-ink">{step.step}</span>
          </div>
          <p className="mt-0.5 text-role-caption text-mode-muted">{step.why}</p>
        </div>
        <span
          className="shrink-0 font-mono text-role-micro tabular-nums text-mode-muted"
          title="Confidence from resolution history"
        >
          {triageConfidenceText(step.confidence)}
        </span>
      </div>
      {step.evidence.length > 0 ? (
        <ul aria-label="Evidence" className="flex flex-wrap gap-1 pl-5">
          {step.evidence.map((e) => (
            <li key={`${e.type}:${e.id}`}>
              <Badge variant="outline" title={e.type}>
                {e.label}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-1.5 pl-5">
        <Button
          size="sm"
          variant={decided === 'ACCEPTED' ? 'success' : 'secondary'}
          icon={<ThumbsUp />}
          disabled={busy}
          aria-pressed={decided === 'ACCEPTED'}
          onClick={() => triage.decide(step.id, 'ACCEPTED')}
        >
          {decided === 'ACCEPTED' ? 'Accepted' : 'Accept'}
        </Button>
        <Button
          size="sm"
          variant={decided === 'REJECTED' ? 'secondary' : 'ghost'}
          icon={<ThumbsDown />}
          disabled={busy}
          aria-pressed={decided === 'REJECTED'}
          onClick={() => triage.decide(step.id, 'REJECTED')}
        >
          {decided === 'REJECTED' ? 'Rejected' : 'Reject'}
        </Button>
      </div>
      {step.kind === 'RETEST' && retestActions ? <div className="pl-5 pt-1">{retestActions}</div> : null}
    </li>
  );
}

/**
 * Next steps (triage) for the unit and its open session: ranked CHECK / FIX / RETEST steps with the
 * why, confidence and evidence; Accept / Reject each. A RETEST step carries the unit's verdict
 * actions (`retestActions`). When the AI pass failed the deterministic order stands, with a note.
 */
export function QcNextSteps({ triage, retestActions }: { triage: QcTriage; retestActions?: ReactNode }) {
  const { result } = triage;
  return (
    <section aria-labelledby="qc-next-heading" className="flex flex-col border-b border-mode-rule">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
        <h3 id="qc-next-heading" className="mode-label text-mode-muted">
          Next steps
        </h3>
        {result ? (
          <span className="text-role-micro text-mode-muted">
            {result.rankedBy === 'AI' ? 'AI ranked' : 'History ranked'}
          </span>
        ) : null}
        <Button
          size="sm"
          variant={result ? 'ghost' : 'secondary'}
          icon={<Sparkles />}
          className="ml-auto"
          loading={triage.asking}
          onClick={triage.ask}
        >
          {result ? 'Refresh' : 'Get next steps'}
        </Button>
      </div>
      {triage.askError ? (
        <div className="px-3 py-2">
          <Alert variant="destructive">
            <AlertDescription>{qcBenchErrorText(triage.askError)}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {result?.aiError ? (
        <p className="px-3 pb-1 text-role-micro text-mode-muted" data-testid="qc-triage-ai-note">
          AI ranking unavailable — showing the history order.
        </p>
      ) : null}
      {triage.decideError ? (
        <div className="px-3 py-2">
          <Alert variant="destructive">
            <AlertDescription>{qcBenchErrorText(triage.decideError)}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {result ? (
        result.steps.length === 0 ? (
          <p className="px-3 py-2 text-role-caption text-mode-muted">No suggested steps for this unit.</p>
        ) : (
          <ol aria-label="Ranked next steps">
            {result.steps.map((step) => (
              <StepRow key={step.id} step={step} triage={triage} retestActions={retestActions} />
            ))}
          </ol>
        )
      ) : null}
    </section>
  );
}
