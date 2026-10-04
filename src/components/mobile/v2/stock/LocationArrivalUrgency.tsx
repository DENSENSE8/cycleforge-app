'use client';

/**
 * A location's arrival urgency on the phone (`/m/loc/[code]`): the fact row
 * under the address and the sheet that sets it. Arrival places cartons of a
 * tier on the shelves of that tier and Unbox works the most urgent shelf
 * first; this is the one-time rack setup, the phone twin of the desk's
 * Manage › Edit bin › "Arrival urgency shelf". Setting a tier ends in the same
 * sheet with "Print label", because the label is what names the shelf's
 * urgency at the rack.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Printer } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { InboundPickerRow, InboundRowButton, InboundRowText } from '@/components/mobile/v2/inbound/MobileV2InboundParts';
import { qk } from '@/queries/keys';
import { arrivalTierLabel, type ArrivalTier } from '@/lib/receiving/arrival-tier';
import { ARRIVAL_TIER_CHOICES, saveArrivalShelfTier } from '@/lib/receiving/arrival-shelves-client';

const NOT_ARRIVAL = 'Not an arrival shelf';

/** "Arrival urgency · Priority" under the address; opens the sheet when the operator may change it. */
export function LocationUrgencyFact({
  tier,
  canEdit,
  onOpen,
}: {
  tier: number | null;
  canEdit: boolean;
  onOpen: () => void;
}) {
  return (
    <InboundPickerRow
      label="Arrival urgency"
      value={tier == null ? NOT_ARRIVAL : arrivalTierLabel(tier)}
      placeholder={NOT_ARRIVAL}
      locked={!canEdit}
      onOpen={onOpen}
      testId="location-urgency-fact"
    />
  );
}

type Phase = { kind: 'pick' } | { kind: 'saved'; tier: ArrivalTier | null };

/** Pick a tier (choosing a row saves it), then the result with "Print label". */
export function LocationUrgencySheet({
  open,
  onClose,
  barcode,
  face,
  tier,
  onPrint,
}: {
  open: boolean;
  onClose: () => void;
  /** `locations.barcode` — the address the PATCH writes. */
  barcode: string;
  face: string;
  tier: number | null;
  /** Prints this location's label with the tier just saved. */
  onPrint: (tier: ArrivalTier | null) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const save = useMutation({
    mutationFn: (next: ArrivalTier | null) => saveArrivalShelfTier(barcode, next),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.locationsAdmin.arrivalShelves() });
      setPhase({ kind: 'saved', tier: saved });
    },
  });
  const close = () => {
    onClose();
    setPhase({ kind: 'pick' });
    save.reset();
  };

  if (phase.kind === 'saved') {
    const label = phase.tier == null ? NOT_ARRIVAL : arrivalTierLabel(phase.tier);
    return (
      <MobileV2ActionSheet
        open={open}
        onClose={close}
        eyebrow={face}
        title={phase.tier == null ? 'No longer an arrival shelf' : `Arrival shelf · ${label}`}
        description={phase.tier == null
          ? 'Arrival stops placing cartons here. Print a new label so the shelf no longer shows an urgency.'
          : `Arrival places ${label} cartons here. Print a new label so the shelf shows it.`}
        verbs={[
          { id: 'done', label: 'Done', icon: <Check />, testId: 'location-urgency-done' },
          { id: 'print', label: 'Print label', icon: <Printer />, primary: true, testId: 'location-urgency-print' },
        ] as const}
        onVerb={async (id) => {
          if (id === 'print') await onPrint(phase.tier);
          close();
        }}
        dockLabel="Arrival urgency saved"
        testId="location-urgency-sheet"
      >
        <p className="break-words px-mode-page py-4 text-mode-body text-mode-ink" data-testid="location-urgency-result">
          Saved: {label}
        </p>
      </MobileV2ActionSheet>
    );
  }

  return (
    <MobileV2ActionSheet
      open={open}
      onClose={close}
      eyebrow={face}
      title="Arrival urgency"
      description="Cartons of this urgency are placed on this shelf at the door; Unbox works the most urgent shelf first."
      verbs={[]}
      onVerb={() => undefined}
      dockLabel="Arrival urgency"
      testId="location-urgency-sheet"
    >
      {save.error ? (
        <p role="alert" className="break-words px-mode-page py-3 text-role-caption font-semibold text-text-danger">
          {save.error.message}
        </p>
      ) : null}
      <ul aria-label="Arrival urgency">
        {ARRIVAL_TIER_CHOICES.map((choice) => {
          const current = choice.tier === tier;
          return (
            <li key={choice.value || 'none'}>
              <InboundRowButton
                pressed={current}
                disabled={save.isPending}
                onClick={() => save.mutate(choice.tier)}
                testId={`location-urgency-${choice.value || 'none'}`}
                trailing={current ? <Check aria-hidden className="h-5 w-5 shrink-0 text-mode-ink" /> : null}
              >
                <InboundRowText
                  title={choice.label}
                  meta={save.isPending && save.variables === choice.tier ? 'Saving…' : current ? 'Current' : null}
                />
              </InboundRowButton>
            </li>
          );
        })}
      </ul>
    </MobileV2ActionSheet>
  );
}
