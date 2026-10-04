'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, RotateCcw, ScanBarcode, X } from '@/components/Icons';
import { DetailAck, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { QcFailTicketPanel } from '@/components/ui/QcFailTicketPanel';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { serialStatusLabel } from '@/lib/inventory/serial-status-display';
import { qcUnitRecordState } from '@/lib/qc/qc-unit-record-model';
import { QC_VERDICTS, postQcVerdict } from '@/lib/qc/qc-verdict';
import { summarizeUnitQc, type UnitQcStep } from '@/lib/qc/unit-qc';
import type { QcUnitStage } from '@/lib/qc/unit-qc-stage';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { SerialUnitRead } from '@/lib/serial/use-serial-unit';
import type { TestVerdict } from '@/lib/tech/recordTestVerdict';
import { QcLabelPrintPanel } from './QcLabelPrintPanel';

const ERROR = 'bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700';

type VerdictDockVerb = TestVerdict | 'NEXT';

const VERDICT_ICON: Readonly<Record<TestVerdict, ReactNode>> = {
  PASS: <Check />,
  TEST_AGAIN: <RotateCcw />,
  TESTING_FAILED: <X />,
};

/**
 * The QC verdict at the bottom of a unit's V2 QC page — Pass / Test again /
 * Failed progress through one DetailDock. A pass replaces the verdict dock
 * with label printing; a fail opens the claim-ticket resolution.
 */
export function UnitQcVerdict({
  unit,
  steps,
  checklistState,
  onRecorded,
  onNext,
}: {
  unit: SerialUnitRead;
  steps: readonly UnitQcStep[];
  checklistState: 'missing' | 'loading' | 'error' | 'ready';
  onRecorded: () => void;
  onNext?: () => void;
}) {
  // Notes are progressive: Pass needs none; Test again is expressed by the
  // verdict; Failed collects a categorized reason in its resolution sheet.
  const note = '';
  const [busy, setBusy] = useState<TestVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [lastStage, setLastStage] = useState<QcUnitStage | null>(null);
  const [recorded, setRecorded] = useState<TestVerdict | null>(null);
  // A unit on an order keeps its status through a verdict, so the verdict just taken wins over it.
  const stage = lastStage ?? qcUnitRecordState(unit).stage;
  const summary = useMemo(() => summarizeUnitQc(steps), [steps]);
  const checklistUnavailable = checklistState === 'loading' || checklistState === 'error';
  const passBlocked = checklistUnavailable || (steps.length > 0 && (summary.open > 0 || summary.failed > 0));
  const passBlockMessage = checklistState === 'loading'
    ? 'Loading the product checklist before Pass is available.'
    : checklistState === 'error'
      ? 'The product checklist could not be loaded. Retry before passing this unit.'
      : summary.failed > 0
        ? `Resolve ${summary.failed} failed checklist ${summary.failed === 1 ? 'step' : 'steps'} before passing.`
        : summary.open > 0
          ? `Complete ${summary.open} open checklist ${summary.open === 1 ? 'step' : 'steps'} before passing.`
          : null;

  useEffect(() => {
    setLastStage(null);
    setRecorded(null);
    setError(null);
    setAck(null);
  }, [unit.id]);

  const record = async (verb: (typeof QC_VERDICTS)[number]) => {
    if (busy) return;
    setBusy(verb.verdict);
    setError(null);
    try {
      const { status } = await postQcVerdict(unit.id, verb.verdict, { notes: note.trim() || null, clientEventId: safeRandomUUID() });
      setLastStage(verb.stage);
      setRecorded(verb.verdict);
      setAck(status ? `${verb.ack} — unit ${serialStatusLabel(status).toLowerCase()}` : verb.ack);
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not recorded');
    } finally {
      setBusy(null);
    }
  };

  const awaitingVerdict = ['received', 'graded', 'testing'].includes(stage) && recorded == null;
  const nextOnly = recorded === 'TEST_AGAIN' || stage === 'putAway' || stage === 'past';
  const verdictVerbs: DetailDockVerb<VerdictDockVerb>[] = QC_VERDICTS.map((verb) => ({
    id: verb.verdict,
    label: verb.label,
    icon: VERDICT_ICON[verb.verdict],
    variant: verb.verdict === 'PASS' ? 'success' : verb.verdict === 'TESTING_FAILED' ? 'dangerSoft' : 'secondary',
    loading: busy === verb.verdict,
    disabled: Boolean(busy) || (verb.verdict === 'PASS' && passBlocked),
    testId: `qc-verdict-${verb.verdict.toLowerCase()}`,
    className: 'font-sans text-role-body',
  }));

  return (
    <>
      {awaitingVerdict || error || ack ? (
        <section aria-labelledby="qc-verdict" className="divide-y divide-mode-rule">
          <DetailSectionHeading id="qc-verdict">Verdict</DetailSectionHeading>
          {passBlocked && passBlockMessage ? (
            <p className="bg-amber-50 px-mode-page py-3 font-sans text-role-caption font-semibold text-amber-800" role="status">
              {passBlockMessage}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className={ERROR}>
              {error}
            </p>
          ) : null}
          {ack ? <DetailAck onDismiss={() => setAck(null)}>{ack}</DetailAck> : null}
        </section>
      ) : null}

      {stage === 'passed' || stage === 'labeled' ? (
        <QcLabelPrintPanel unit={unit} alreadyPrinted={stage === 'labeled'} onNext={onNext} />
      ) : null}
      {stage === 'failed' || stage === 'ticket' ? (
        <section aria-labelledby="qc-ticket" className="divide-y divide-mode-rule">
          <DetailSectionHeading id="qc-ticket">Ticket</DetailSectionHeading>
          <QcFailTicketPanel
            unit={unit}
            steps={steps}
            note={note}
            onFiled={() => {
              setLastStage('ticket');
              onRecorded();
            }}
          />
        </section>
      ) : null}

      {awaitingVerdict ? (
        <DetailDock<VerdictDockVerb>
          label="Quality control verdict"
          verbs={verdictVerbs}
          onVerb={(id) => {
            const verb = QC_VERDICTS.find((candidate) => candidate.verdict === id);
            if (verb) return record(verb);
          }}
        />
      ) : nextOnly && onNext ? (
        <DetailDock<VerdictDockVerb>
          label="Quality control actions"
          verbs={[{ id: 'NEXT', label: 'Next unit', icon: <ScanBarcode />, primary: true, className: 'font-sans text-role-body' }]}
          onVerb={() => onNext()}
        />
      ) : stage === 'ticket' && onNext ? (
        <DetailDock<VerdictDockVerb>
          label="Quality control actions"
          verbs={[{ id: 'NEXT', label: 'Next unit', icon: <ScanBarcode />, primary: true, className: 'font-sans text-role-body' }]}
          onVerb={() => onNext()}
        />
      ) : null}
    </>
  );
}
