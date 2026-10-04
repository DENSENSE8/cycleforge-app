/**
 * Exceptions — the hub family's card model (layer 2 of the triage face): one
 * card per exception, the tag (WHY) as the card's state, the blocked entity as
 * its identity, the evidence as its one fact.
 */

import type { TriageCardModelBase } from '@/design-system/components/triage-card-list/TriageCardList';
import type { RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import type { ViewCardModel } from '@/design-system/components/triage-card-list/triage-view';
import type { EXCEPTIONS_VIEW } from '@/lib/triage/views/exceptions';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { RowGroup } from '@/lib/group-rows';
import { EXCEPTION_KIND_SPEC, type ExceptionRow } from '@/lib/exceptions/types';
import { formatDateTimePST, formatMonthDayTimePST } from '@/utils/date';
import { exceptionStateFace } from '../exception-face';

/**
 * The triage face speaks numeric record ids (selection, the record cursor,
 * `data-desk-record-key`); an exception's key is `<kind>:<sourceId>` and one
 * source id can sit under two kinds. Each key gets the next number the first
 * time it is seen and keeps it for the session — stable across refetches,
 * scope switches and remounts, never shared by two keys.
 */
const CARD_IDS = new Map<string, number>();

export function exceptionCardId(key: string): number {
  let id = CARD_IDS.get(key);
  if (id == null) {
    id = CARD_IDS.size + 1;
    CARD_IDS.set(key, id);
  }
  return id;
}

export const exceptionRowId = (row: ExceptionRow): number => exceptionCardId(row.key);

export type ExceptionCardModel = TriageCardModelBase<ExceptionRow>;

/**
 * Rows → one band per status TAG ("Out of stock", "Buyer request"), in the
 * order each tag first appears (newest raised first within a band). The
 * section header says the status word ONCE with its count; the cards under it
 * carry it ambiently (rail + glyph, word on hover) — never a pill per card.
 */
export function exceptionBands(rows: readonly ExceptionRow[]): [string, RowGroup<ExceptionRow>[]][] {
  const bands = new Map<string, RowGroup<ExceptionRow>[]>();
  for (const row of rows) {
    const band = bands.get(row.tag.label) ?? [];
    band.push({ key: row.key, rows: [row] });
    bands.set(row.tag.label, band);
  }
  return [...bands];
}

/** A band's section head: the tag word in its own tone. */
export function exceptionSection(rows: readonly ExceptionRow[]): (band: string) => { label: string; tone: 'danger' | 'warning' } {
  const tones = new Map(rows.map((row) => [row.tag.label, row.tag.tone] as const));
  return (band) => ({ label: band, tone: tones.get(band) ?? 'warning' });
}

export const exceptionCardKey = (group: RowGroup<ExceptionRow>): string => group.key;

export function exceptionCardModel(group: RowGroup<ExceptionRow>): ExceptionCardModel {
  const lead = group.rows[0]!;
  return { key: group.key, ids: [exceptionCardId(lead.key)], lead };
}

/** A Find naming exactly one exception's entity (order #, SKU, PO, tracking, bin) opens it. */
export const exceptionExactFind = (query: string, model: ExceptionCardModel): boolean =>
  model.lead.entity.label.toLowerCase() === query || model.lead.entity.id.toLowerCase() === query;

/**
 * The card face. Line 1 reads like the Allocate card's (owner 2026-09-29):
 * the order number, its channel (`channel`, resolved by the card from the
 * row's account source), then the buyer's and the team's notes. `showKind`:
 * the list spans several kinds, so line 1 names this one's (muted).
 */
export function exceptionRecordCard(
  model: ExceptionCardModel,
  showKind: boolean,
  channel: RecordCardModel['channel'],
): ViewCardModel<typeof EXCEPTIONS_VIEW> {
  const row = model.lead;
  const state = exceptionStateFace(row);
  const kind = EXCEPTION_KIND_SPEC[row.kind];
  const title = row.title ?? row.entity.label;
  return {
    key: model.key,
    leadId: model.ids[0]!,
    state,
    stateIcon: recordStateGlyph(state),
    stateMeaning: `${row.tag.label} — ${kind.label}`,
    alert: null,
    aria: {
      card: `${row.tag.label}: ${row.entity.label}${row.title ? `, ${row.title}` : ''}`,
      open: `Open ${row.entity.label} — ${row.resolveVerb}`,
      check: `Select ${row.entity.label}`,
    },
    channel,
    person: showKind ? kind.label : null,
    chips: [],
    // The buyer's words and the team's note, read-only here (the record's resolver edits the order).
    notes: {
      fixed: row.order?.buyerNote ? { label: 'Buyer note', text: row.order.buyerNote } : null,
      own: row.order?.staffNote ?? null,
    },
    status: row.raisedAt
      ? { kind: 'date', face: formatMonthDayTimePST(row.raisedAt), tip: `Raised ${formatDateTimePST(row.raisedAt)} PT`, alert: false }
      : { kind: 'date', face: 'No date', tip: null, alert: false },
    next: null,
    lines: [
      {
        id: model.ids[0]!,
        title,
        photoUrl: null,
        // The evidence reads neutral — the status is the rail and the section, not the fact's ink.
        facts: { detail: row.detail ? { kind: 'text', text: row.detail } : null },
        alert: false,
        alertNote: null,
      },
    ],
    hiddenAlertLabel: () => '',
  };
}
