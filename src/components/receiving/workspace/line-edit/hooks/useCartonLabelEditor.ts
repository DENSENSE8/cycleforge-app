'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { labelCornerTicketDigits } from '@/lib/print/printReceivingLabel';
import { formatLabelDateFromIso } from '@/components/labels/labelDate';
import { usePlatformMeta, useReceivingTypeLabel } from '@/hooks/useCatalog';
import {
  printReceivingLabel,
  markReceivingLabelPrinted,
} from '@/components/receiving/workspace/receiving-label-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { LabelCornerMode, LabelEditDraft } from '../LabelEditPopover';
import { buildCartonLabelPayloadFromDraft } from '../cartonLabelPayload';
import type { ReceivingLineCore } from './useReceivingLineCore';

type LabelOverride = {
  platform?: string;
  date?: string;
  cornerMode?: LabelCornerMode;
  ticket?: string;
  tracking?: string;
};

/**
 * Carton-label editing shared by Unbox and Testing. Derives the default editable
 * draft from the carton's identity, assembles the live-preview / print payload
 * from a draft, and on Save & print persists what has a home (condition / PO# /
 * type / optional notes) while keeping the label-only choices (platform display,
 * date, corner) as a print-time override — both surfaces print the identical
 * face via the single {@link receivingPayloadToFace} SoT.
 *
 * Feeds the shared {@link LabelEditPopover} (defaults + buildPayload +
 * onApplyAndPrint) so the pencil → editor → "Save & print" CTA is identical.
 */
export function useCartonLabelEditor(
  row: ReceivingLineRow,
  core: ReceivingLineCore,
  opts: {
    conditionCode: string;
    notes: string;
    /** When set, Save & print also persists an edited notes field (Unbox durable line note). */
    onPersistNotes?: (notes: string) => void;
  },
) {
  const resolvePlatformMeta = usePlatformMeta();
  const resolveTypeLabel = useReceivingTypeLabel();
  // Label-only display choices (platform/date/corner), kept as a print-time
  // override so the preview reflects a custom print. Reset per carton line.
  const [labelOverride, setLabelOverride] = useState<LabelOverride>({});
  useEffect(() => setLabelOverride({}), [row.id]);

  const trackingHint = (row.tracking_number || core.trackingEdit || '').trim();
  const derivedPlatform = core.sourcePlatform
    ? resolvePlatformMeta(core.sourcePlatform).label
    : String(core.receivingType || 'PO').toUpperCase() === 'PICKUP'
      ? 'Local pickup'
      : row.receiving_source === 'unmatched'
        ? 'Unfound'
        : 'Unknown';
  const derivedDate = formatLabelDateFromIso(row.unboxed_at ?? row.unbox_opened_at ?? null);
  const derivedTicket = labelCornerTicketDigits({
    providerTicketId: core.providerTicketId,
    externalTicketId: core.supportTicket?.externalTicketId ?? null,
    zendeskField: core.zendeskTrimmed || core.zendesk,
  });
  const cornerMode: LabelCornerMode =
    labelOverride.cornerMode ?? (derivedTicket ? 'ticket' : 'order');

  const buildPayload = useCallback(
    (draft: LabelEditDraft) =>
      buildCartonLabelPayloadFromDraft(draft, {
        receivingId: row.receiving_id ?? null,
        trackingHint,
        resolveTypeLabel,
      }),
    [row.receiving_id, trackingHint, resolveTypeLabel],
  );

  const draftDefaults: LabelEditDraft = {
    platform: labelOverride.platform ?? derivedPlatform,
    receivingType: (core.receivingType || '').toUpperCase(),
    notes: opts.notes,
    conditionCode: opts.conditionCode,
    cornerMode,
    reference: core.poNumber,
    ticket: labelOverride.ticket ?? derivedTicket,
    tracking: labelOverride.tracking ?? trackingHint,
    date: labelOverride.date ?? derivedDate,
  };

  const hasCarton = row.receiving_id != null && row.receiving_id > 0;
  // The always-on preview payload = the default draft rendered through the same
  // builder the editor uses, so the card and the popover can never drift. Null
  // when the line has no linked carton.
  const defaultPayload = useMemo(
    () => (hasCarton ? buildPayload(draftDefaults) : null),
    [
      hasCarton,
      buildPayload,
      draftDefaults.platform,
      draftDefaults.receivingType,
      draftDefaults.notes,
      draftDefaults.conditionCode,
      draftDefaults.cornerMode,
      draftDefaults.reference,
      draftDefaults.ticket,
      draftDefaults.tracking,
      draftDefaults.date,
    ],
  );

  const applyAndPrint = useCallback(
    (draft: LabelEditDraft) => {
      // Persist the fields that have a canonical home on the record.
      if (opts.onPersistNotes && draft.notes !== opts.notes) {
        opts.onPersistNotes(draft.notes);
      }
      if ((draft.conditionCode || '') !== (opts.conditionCode || '')) {
        void core.patch({ condition_grade: draft.conditionCode });
      }
      const nextRef = draft.reference.trim();
      if (nextRef && nextRef !== core.poNumber) void core.persistPoNumber(nextRef);
      const nextType = (draft.receivingType || '').toUpperCase();
      if (nextType && nextType !== (core.receivingType || '').toUpperCase()) {
        core.setReceivingType(nextType);
        void core.saveType(nextType);
      }
      // Label-only / display-only choices — kept as a print-time override so the
      // card preview reflects them, but never written to the record.
      setLabelOverride({
        platform: draft.platform,
        date: draft.date,
        cornerMode: draft.cornerMode,
        ticket: draft.ticket,
        tracking: draft.tracking,
      });
      printReceivingLabel(buildPayload(draft));
      // Same choke point the unbox print fires: optimistic marker/event + durable
      // label_printed_at stamp, so row chips flip and the Print step persists.
      markReceivingLabelPrinted(row.id);
    },
    [
      opts.conditionCode,
      opts.notes,
      opts.onPersistNotes,
      buildPayload,
      row.id,
      core.patch,
      core.poNumber,
      core.persistPoNumber,
      core.receivingType,
      core.setReceivingType,
      core.saveType,
    ],
  );

  return { draftDefaults, buildPayload, defaultPayload, applyAndPrint, derivedTicket, derivedPlatform, derivedDate };
}
