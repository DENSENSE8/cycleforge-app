/**
 * What a SKIPPED import row means — the single source of truth.
 *
 * A skip reason carries three judgements that must be identical on every
 * surface that reports an import: the operator-facing label, whether a human
 * has to go fix something (`actionable`), and whether the rows are worth
 * listing at all (`listed` — blank spreadsheet padding is counted, never
 * listed).
 *
 * ## Why it is its own leaf module
 *
 * This table was defined inside `OrderSyncDialog.tsx` (850 lines of right-rail
 * panel) and then COPIED into the run-detail fold, which immediately drifted:
 * two label casings and two tone vocabularies for the same six reasons. Worse,
 * importing it from the dialog would have pulled that entire panel into the
 * `/m` run-screen chunk.
 *
 * So: pure data and types here, no React and no imports beyond the row type.
 * Pulling it out first is what made retiring the dialog (2026-09-15) a plain
 * deletion instead of an extraction; the run surfaces are its only readers now.
 */
import type { TransferSkippedRow } from './types';

export type SkipReason = TransferSkippedRow['reason'];

/**
 * Two tones, because only two things matter to the reader: this needs my
 * attention, or it is bookkeeping. Surfaces map these onto their own ink.
 */
export type SkipReasonTone = 'warning' | 'quiet';

export interface SkipReasonMeta {
  label: string;
  hint: string;
  tone: SkipReasonTone;
  /** A human must change something for these rows to import. */
  actionable: boolean;
  /** Worth showing row by row. False = counted only. */
  listed: boolean;
}

export const SKIP_REASON_META: Record<SkipReason, SkipReasonMeta> = {
  noItemNumber: {
    label: 'Missing item number',
    hint: 'Real orders with tracking. Resolve them in Review · Missing item number, or fix the sheet cell and re-import.',
    tone: 'warning',
    actionable: true,
    listed: true,
  },
  noTracking: {
    label: 'Missing tracking',
    hint: 'Labels work needs a real shipment, so these wait for a tracking number.',
    tone: 'warning',
    actionable: true,
    listed: true,
  },
  noOrderId: {
    label: 'Missing order number',
    hint: 'A row with content but no order number — usually a note or a partial entry.',
    tone: 'warning',
    actionable: true,
    listed: true,
  },
  // Deliberately quiet: these orders arrive through the Ecwid connector, so
  // listing them as a problem sends someone to fix a cell that should stay empty.
  ecwid: {
    label: 'Ecwid (imported separately)',
    hint: 'Not a problem — these arrive through the Ecwid connector, not the sheet.',
    tone: 'quiet',
    actionable: false,
    listed: true,
  },
  fbaShipment: {
    label: 'FBA inbound shipments',
    hint: 'Not sales — one row per box of an Amazon inbound shipment. Nothing to fix.',
    tone: 'quiet',
    actionable: false,
    listed: true,
  },
  blankRow: {
    label: 'Empty rows',
    hint: 'Spreadsheet padding.',
    tone: 'quiet',
    actionable: false,
    listed: false,
  },
};

/** Paint order: work first, bookkeeping last. */
export const SKIP_REASON_ORDER: readonly SkipReason[] = [
  'noItemNumber',
  'noTracking',
  'noOrderId',
  'ecwid',
  'fbaShipment',
  'blankRow',
];
