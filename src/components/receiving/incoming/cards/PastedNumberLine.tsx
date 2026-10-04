'use client';

/**
 * A pasted number on ONE row — the Compact face of the pasted Inbound list
 * (`?ref_in=`), the sheet's row with the sheet's columns, fixed width so the
 * eye runs down a column: verdict · number · item (+N) · units counted /
 * bought · purchased + age · the carrier's last word · vendor → the next step
 * (a follow-up tag outranks the computed one). Full is {@link PastedNumberCard}.
 *
 * Width budget: a 22-char USPS number plus these columns fill a 1600px
 * screen's stage, so the row carries no photo, the carrier speaks briefly
 * (no signer), and the verdict chip wears its head word — its qualifier
 * ("0 of 3 received", "no tracking") is what the units and carrier columns
 * already say. Full shows all of it.
 */

import { memo, useMemo } from 'react';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views';
import { pastedNumberStateFace } from '@/lib/receiving/pasted-number-facts';
import {
  PASTED_NUMBER_NOTHING_ON_FILE,
  pastedNumberNext,
  type PastedNumberCardModel,
  type PastedNumberRow,
} from './PastedNumberCard';
import { carrierFace, orderedFace } from './pasted-number-faces';

export const PastedNumberLine = memo(function PastedNumberLine(props: TriageCardSlotProps<PastedNumberRow, PastedNumberCardModel>) {
  const { model } = props;
  const face = useMemo<TriageRowFace>(() => {
    const { entry, sharedWith } = model.number;
    const { facts } = model;
    const verdict = pastedNumberStateFace(entry, model.receipt ? facts : null);
    const state = { ...verdict, label: verdict.label.split(' · ')[0] };
    const more = facts.item.lines > 1 ? ` +${facts.item.lines - 1}` : '';
    const title = model.receipt
      ? `${facts.item.title ?? facts.item.sku ?? 'Untitled item'}${more}`
      : sharedWith
        ? `Its lines sit under ${sharedWith}`
        : PASTED_NUMBER_NOTHING_ON_FILE;
    const next = pastedNumberNext(model);
    return {
      state,
      identity: entry.ref,
      identityWidth: 'long',
      title,
      facts: [
        {
          id: 'units',
          // Nothing counted against an unknown bought qty says nothing — the verdict already does.
          value:
            model.receipt && (facts.units.expected != null || facts.units.received > 0)
              ? { kind: 'received', received: facts.units.received, expected: facts.units.expected }
              : null,
          width: 'num',
        },
        { id: 'ordered', value: orderedFace(facts.ordered), width: 'short' },
        { id: 'carrier', value: carrierFace(facts.carrier, true), width: 'code' },
        { id: 'vendor', value: facts.vendor ?? entry.vendor, width: 'short', tone: 'muted' },
      ],
      next: next ? { label: next.label, blocked: next.blocked } : null,
      nextWidth: 'code',
      aria: {
        row: `${entry.ref}, ${verdict.label}, ${title}`,
        open: `Open ${entry.ref}`,
        check: `Select ${entry.ref}`,
      },
    };
  }, [model]);
  return <TriageRow {...props} face={face} testIdPrefix={INCOMING_PIPELINE_VIEW.testIdPrefix} />;
});
