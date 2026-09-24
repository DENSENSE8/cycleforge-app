'use client';

import { useState } from 'react';
import { Check, Plus, X } from '@/components/Icons';
import { Button, TextField } from '@/design-system/primitives';
import type { QcResultInput } from '@/lib/schemas/qc-checks';
import {
  bandDecides,
  isNumericKind,
  needsValueInput,
  passBandLabel,
  stepValueFields,
  stepValueUnit,
} from '@/lib/qc/qc-step';
import { unitQcStamp, type UnitQcStep } from '@/lib/qc/unit-qc';
import { useRecordUnitQcStep } from './useUnitQc';

/** The recorded verdict as the server holds it — a reading can be stored without one. */
function verdictFace(step: UnitQcStep): { label: string; className: string } | null {
  if (step.passed === true) return { label: 'Passed', className: 'text-emerald-700' };
  if (step.passed === false) return { label: 'Failed', className: 'text-rose-700' };
  return step.verified_at ? { label: 'No verdict', className: 'text-mode-muted' } : null;
}

function recordedReading(step: UnitQcStep): string | null {
  if (step.value_num != null) {
    const unit = stepValueUnit(step);
    return unit ? `${step.value_num} ${unit}` : String(step.value_num);
  }
  return step.value_text;
}

/**
 * One checklist step on the phone, compact: the label with the server's
 * verdict + who/when beside it, then one row of controls — Fail on the left,
 * Add note in the middle, Pass on the right (operator 2026-09-24). The
 * recorded answer is the filled button. A numeric step with a band sends only
 * its reading (the server judges it), so it gets Record in Pass's place. The
 * host keys this row by the step's server stamp, so a successful write
 * remounts it with the recorded values.
 */
export function UnitQcStepRow({ unitId, step }: { unitId: number; step: UnitQcStep }) {
  const record = useRecordUnitQcStep(unitId);
  const kind = step.value_kind;
  const hasReading = needsValueInput(kind);
  const byBand = bandDecides(step);
  const band = passBandLabel(step);
  const reading = recordedReading(step);

  const [raw, setRaw] = useState(
    step.value_num != null ? String(step.value_num) : (step.value_text ?? ''),
  );
  const [noteOpen, setNoteOpen] = useState(Boolean(step.notes));
  const [note, setNote] = useState(step.notes ?? '');
  const [inputError, setInputError] = useState<string | null>(null);

  const submit = (passed?: boolean) => {
    setInputError(null);
    // The POST replaces the stored note, so the current one always rides along.
    const body: QcResultInput = { stepId: step.step_id, passed, notes: note.trim() || null };
    if (hasReading) {
      if (raw.trim() === '') {
        setInputError('Enter a reading first');
        return;
      }
      const value = stepValueFields(step, raw);
      if (!value.ok) {
        setInputError('Enter a valid number');
        return;
      }
      Object.assign(body, value.fields);
    }
    record.mutate(body);
  };

  const pending = record.isPending;
  const pendingPassed = record.variables?.passed;
  const error = inputError ?? record.error?.message ?? null;
  const unit = stepValueUnit(step);

  const verdict = verdictFace(step);
  const caption = [band ? `Pass ${band}` : null, reading ? `Recorded ${reading}` : null].filter(Boolean).join(' · ');

  return (
    <li className="space-y-2 border-b border-mode-rule px-mode-page py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-mode-body font-semibold text-mode-ink">{step.step_label}</span>
        {verdict ? (
          <span className="shrink-0 text-right text-role-caption">
            <span className={`font-semibold ${verdict.className}`}>{verdict.label}</span>
            {step.verified_at ? (
              <span className="text-mode-muted">
                {' · '}
                {unitQcStamp({ name: step.verified_by_name, at: step.verified_at })}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {caption ? <p className="text-role-caption text-mode-muted">{caption}</p> : null}

      {kind === 'ENUM' ? (
        <div role="group" aria-label={`${step.step_label} reading`} className="flex flex-wrap gap-2">
          {(step.value_enum ?? []).map((option) => (
            <Button
              key={option}
              variant={raw === option ? 'primarySoft' : 'secondary'}
              radius="mode"
              aria-pressed={raw === option}
              disabled={pending}
              onClick={() => setRaw(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      ) : hasReading ? (
        <TextField
          label={unit ? `Reading (${unit})` : 'Reading'}
          value={raw}
          onChange={setRaw}
          type={isNumericKind(kind) ? 'number' : 'text'}
          inputMode={isNumericKind(kind) ? 'decimal' : undefined}
          disabled={pending}
        />
      ) : null}

      {noteOpen ? (
        <TextField label="Note" value={note} onChange={setNote} multiline rows={2} disabled={pending} />
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {byBand ? null : (
          <Button
            variant={step.passed === false ? 'danger' : step.passed === true ? 'secondary' : 'dangerSoft'}
            radius="mode"
            icon={<X />}
            aria-pressed={step.passed === false}
            loading={pending && pendingPassed === false}
            disabled={pending}
            onClick={() => submit(false)}
            className="w-full"
          >
            Fail
          </Button>
        )}
        <Button
          variant={noteOpen ? 'primarySoft' : 'secondary'}
          radius="mode"
          icon={<Plus />}
          aria-expanded={noteOpen}
          disabled={pending}
          onClick={() => setNoteOpen((open) => !open)}
          className="w-full"
        >
          {note.trim() ? 'Note' : 'Add note'}
        </Button>
        {byBand ? (
          <Button variant="primary" radius="mode" loading={pending} onClick={() => submit()} className="col-span-2 w-full">
            Record
          </Button>
        ) : (
          <Button
            variant={step.passed === false ? 'secondary' : 'success'}
            radius="mode"
            icon={<Check />}
            aria-pressed={step.passed === true}
            loading={pending && pendingPassed === true}
            disabled={pending}
            onClick={() => submit(true)}
            className="w-full"
          >
            Pass
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-role-caption font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
    </li>
  );
}
