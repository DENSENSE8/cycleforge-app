'use client';

import React from 'react';
import { Check } from '../Icons';
import { TextField } from '@/design-system/primitives';
import { FormField } from '@/design-system/components';
import { useReasonVocabulary } from '@/hooks/useReasonVocabulary';
import { REPAIR_FAILURE_LABELS } from '@/lib/repair/repair-failure-reasons';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

interface ReasonSelectorProps {
  selectedReasons: string[];
  notes: string;
  onReasonsChange: (reasons: string[]) => void;
  onNotesChange: (notes: string) => void;
  skuIssues?: string[];
  /**
   * `flush` = kiosk V2 edge-to-edge selectable rows.
   * `pills` = Square-style chip stack (shared {@link KIOSK_PILL} SoT).
   * Staff intake keeps soft `default` cards.
   */
  appearance?: 'default' | 'flush' | 'pills';
}

export function ReasonSelector({
  selectedReasons,
  notes,
  onReasonsChange,
  onNotesChange,
  skuIssues,
  appearance = 'default',
}: ReasonSelectorProps) {
  // Per-SKU templates (skuIssues) win; otherwise the generic repair_failure
  // vocabulary (reason_codes), falling back to the built-in registry.
  const dbRows = useReasonVocabulary('repair_failure');
  const genericReasons =
    dbRows && dbRows.length > 0 ? dbRows.map((r) => r.label) : REPAIR_FAILURE_LABELS;
  const reasons = skuIssues && skuIssues.length > 0 ? skuIssues : genericReasons;
  const flush = appearance === 'flush';
  const pills = appearance === 'pills';

  const toggleReason = (reason: string) => {
    if (selectedReasons.includes(reason)) {
      onReasonsChange(selectedReasons.filter((r) => r !== reason));
    } else {
      onReasonsChange([...selectedReasons, reason]);
    }
  };

  if (pills) {
    return (
      <div className="flex flex-col gap-0">
        {/* No section label here: the step's bold display header already says
            "Reason for repair" (operator 2026-09-14 — one header per step, no
            duplicate text above the pills). */}
        <div className="flex flex-col gap-1.5 bg-surface-card px-3 py-3">
          {reasons.map((reason) => {
            const isSelected = selectedReasons.includes(reason);
            return (
              // The chip family's ROW face — this used to hand-compose
              // KIOSK_PILL + a tone token + a positioned Check, which is the
              // fork KioskChip exists to end (Phase 2).
              <KioskChip
                key={reason}
                face="row"
                tone={isSelected ? 'issue' : 'idle'}
                selected={isSelected}
                onClick={() => toggleReason(reason)}
                trailing={
                  isSelected ? (
                    <Check className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                  ) : null
                }
              >
                {reason}
              </KioskChip>
            );
          })}
        </div>
        {/*
          The SAME notes control the contact step uses — `KioskEntryField`
          multiline on `KIOSK_POS_ENTRY_AREA`: rounded-xl, placeholder-in-box,
          no floating label, no flush hairline. This was a `TextField
          appearance="flush"`, i.e. a square-cornered field with a bottom
          divider, on a surface where every other control is rounded. Operator
          2026-09-15: *"reuse the exact same notes component in the contact
          information … it doesn't have to be a squared corner radius."*
          Padding matches the contact block's own field rhythm (px-4 / py-4).
        */}
        <div className="px-4 pb-4">
          <KioskEntryField
            name="Repair notes (optional)"
            value={notes}
            onChange={onNotesChange}
            multiline
            testId="kiosk-repair-reason-notes"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={flush ? 'flex flex-col gap-0' : 'space-y-4'}>
      {flush ? (
        <>
          <p className="border-b border-border-hairline px-4 py-2 text-role-micro uppercase tracking-[0.16em] text-text-muted">
            Reason for Repair
          </p>
          <div className="divide-y divide-border-hairline border-b border-border-hairline">
            {reasons.map((reason) => {
              const isSelected = selectedReasons.includes(reason);

              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => toggleReason(reason)}
                  className={cn(
                    'ds-raw-button flex w-full items-center gap-3 px-4 py-3 text-left transition-all',
                    cornerClass('flush'),
                    isSelected
                      ? 'bg-surface-inverse text-white'
                      : 'bg-surface-canvas text-text-default hover:bg-surface-sunken',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-5 w-5 flex-shrink-0 items-center justify-center',
                      cornerClass('flush'),
                      isSelected
                        ? 'bg-surface-card'
                        : 'border border-border-default bg-surface-card',
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-text-default" />}
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide">{reason}</span>
                </button>
              );
            })}
          </div>
          <TextField
            label="Repair Notes (optional)"
            value={notes}
            onChange={onNotesChange}
            multiline
            rows={3}
            appearance="flush"
            className="border-b border-border-hairline"
          />
        </>
      ) : (
        <>
          <FormField label="Reason for Repair">
            <div className="space-y-2">
              {reasons.map((reason) => {
                const isSelected = selectedReasons.includes(reason);

                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => toggleReason(reason)}
                    className={`ds-raw-button flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                      isSelected
                        ? 'bg-surface-inverse text-white'
                        : 'border border-border-soft bg-surface-canvas text-text-default hover:border-border-default hover:bg-surface-sunken'
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md ${
                        isSelected
                          ? 'bg-surface-card'
                          : 'border border-border-default bg-surface-card'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-text-default" />}
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide">{reason}</span>
                  </button>
                );
              })}
            </div>
          </FormField>

          <TextField
            label="Repair Notes (optional)"
            value={notes}
            onChange={onNotesChange}
            multiline
            rows={3}
          />
        </>
      )}
    </div>
  );
}
