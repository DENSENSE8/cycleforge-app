'use client';

import { useState } from 'react';
import { DetailAck, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { QcFailTicketPanel } from '@/components/ui/QcFailTicketPanel';
import { Button } from '@/design-system/primitives';
import { serialStatusLabel } from '@/lib/inventory/serial-status-display';
import { qcUnitRecordState } from '@/lib/qc/qc-unit-record-model';
import { QC_VERDICTS, postQcVerdict } from '@/lib/qc/qc-verdict';
import type { UnitQcStep } from '@/lib/qc/unit-qc';
import type { QcUnitStage } from '@/lib/qc/unit-qc-stage';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { SerialUnitRead } from '@/lib/serial/use-serial-unit';
import type { TestVerdict } from '@/lib/tech/recordTestVerdict';
import { QcLabelPrintPanel } from './QcLabelPrintPanel';

const PANEL = 'flex flex-col gap-3 bg-mode-panel px-mode-page py-3';
const ERROR = 'bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700';

const VARIANT: Readonly<Record<TestVerdict, 'success' | 'secondary' | 'danger'>> = {
  PASS: 'success',
  TEST_AGAIN: 'secondary',
  TESTING_FAILED: 'danger',
};

/**
 * The QC verdict at the top of a unit's QC page — Pass / Test again / Failed
 * (`QC_VERDICTS`, the desk record's header verbs), one tap each, through the
 * unit verdict route (`recordTestVerdict`). A pass opens the QC label print
 * (prepack); a fail opens the claim ticket with the return / partial refund
 * suggestion — the desk record's Failed panel.
 */
export function UnitQcVerdict({
  unit,
  steps,
  onRecorded,
}: {
  unit: SerialUnitRead;
  steps: readonly UnitQcStep[];
  onRecorded: () => void;
}) {
  // Notes are progressive: Pass needs none; Test again is expressed by the
  // verdict; Failed collects a categorized reason in its resolution sheet.
  const note = '';
  const [busy, setBusy] = useState<TestVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [lastStage, setLastStage] = useState<QcUnitStage | null>(null);
  // A unit on an order keeps its status through a verdict, so the verdict just taken wins over it.
  const stage = lastStage ?? qcUnitRecordState(unit).stage;

  const record = async (verb: (typeof QC_VERDICTS)[number]) => {
    if (busy) return;
    setBusy(verb.verdict);
    setError(null);
    try {
      const { status } = await postQcVerdict(unit.id, verb.verdict, { notes: note.trim() || null, clientEventId: safeRandomUUID() });
      setLastStage(verb.stage);
      setAck(status ? `${verb.ack} — unit ${serialStatusLabel(status).toLowerCase()}` : verb.ack);
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not recorded');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section aria-labelledby="qc-verdict" className="divide-y divide-mode-rule">
        <DetailSectionHeading id="qc-verdict">Verdict</DetailSectionHeading>
        <div className={PANEL}>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="QC verdict">
            {QC_VERDICTS.map((verb) => (
              <Button
                key={verb.verdict}
                variant={VARIANT[verb.verdict]}
                size="lg"
                className="min-h-mode-hit w-full"
                loading={busy === verb.verdict}
                disabled={!!busy}
                aria-pressed={stage === verb.stage || (verb.stage === 'failed' && stage === 'ticket')}
                onClick={() => void record(verb)}
                data-testid={`qc-verdict-${verb.verdict.toLowerCase()}`}
              >
                {verb.label}
              </Button>
            ))}
          </div>
        </div>
        {error ? (
          <p role="alert" className={ERROR}>
            {error}
          </p>
        ) : null}
        {ack ? <DetailAck onDismiss={() => setAck(null)}>{ack}</DetailAck> : null}
      </section>

      {stage === 'passed' || stage === 'labeled' ? <QcLabelPrintPanel unit={unit} /> : null}
      {stage === 'failed' || stage === 'ticket' ? (
        <section aria-labelledby="qc-ticket" className="divide-y divide-mode-rule">
          <DetailSectionHeading id="qc-ticket">Ticket</DetailSectionHeading>
          <QcFailTicketPanel unit={unit} steps={steps} note={note} onFiled={onRecorded} />
        </section>
      ) : null}
    </>
  );
}
