/**
 * The Compact face of a RecordCard family, derived from the card's OWN model —
 * so a list's two densities (Full = RecordCard, Compact = TriageRow) paint one
 * truth (Law 2). Lead line's title (+N more lines) and photo (iff the view
 * declares `slots.photo: 'line'`), the view's declared facts off the lead line,
 * the card's top-right status as the last fact, its next step, and its aria strings.
 *
 * The family supplies only what the card paints as a ReactNode and a row
 * cannot read: the identity handle, said aloud.
 */

import type { RecordCardModel, RecordCardStatus } from '../record-card/record-card-types';
import type { RecordFactFace } from '../record-card/record-fact';
import type { TriageRowCopy, TriageRowFact, TriageRowFace, TriageRowFactWidth } from './TriageRow';
import type { TriageViewDecl } from './triage-view';
import type { OperationalIdentity } from '@/lib/operational-identity';

/** A row has room for 2–4 facts: up to three declared facts plus the status. */
const MAX_DECLARED_FACTS = 3;

function widthFor(face: RecordFactFace | null): TriageRowFactWidth {
  if (!face) return 'short';
  if (face.kind === 'qty' || face.kind === 'count' || face.kind === 'received') return 'num';
  if (face.kind === 'code') return 'code';
  return 'short';
}

function statusFact(status: RecordCardStatus): TriageRowFact | null {
  switch (status.kind) {
    case 'none':
      return null;
    case 'deadline':
      return { id: 'status', value: status.face, width: 'short', tone: status.tone === 'late' ? 'warn' : 'muted', tip: status.tip ?? undefined };
    case 'date':
      return { id: 'status', value: status.face, width: 'short', tone: status.alert ? 'warn' : 'muted', tip: status.tip ?? undefined };
    case 'state':
      return { id: 'status', value: status.face, width: 'short', tone: 'default', tip: status.tip ?? undefined };
  }
}

export function recordRowFace(
  model: RecordCardModel,
  view: Pick<TriageViewDecl, 'facts' | 'slots'>,
  options: {
    /** The handle the floor says aloud (bin, carton, ticket), or an order / PO's {@link OperationalIdentity}. */
    identity: string | OperationalIdentity;
    identityWidth?: TriageRowFactWidth;
    /** The handle as a copyable identifier (CopyChip). */
    identityCopy?: TriageRowCopy;
    /** Identifiers the card shows on line 1 beside the handle (a repair's serial): they lead the facts, inside the same budget. */
    leadFacts?: readonly TriageRowFact[];
  },
): TriageRowFace {
  const lead = model.lines[0] ?? null;
  const more = model.lines.length > 1 ? ` +${model.lines.length - 1}` : '';
  const declared: TriageRowFact[] = view.facts.map((column) => {
    const value = lead?.facts[column.id] ?? null;
    return { id: column.id, value, width: widthFor(value) };
  });
  const facts = [...(options.leadFacts ?? []), ...declared].slice(0, MAX_DECLARED_FACTS);
  const status = statusFact(model.status);
  if (status) facts.push(status);
  return {
    state: model.state,
    identity: options.identity,
    identityWidth: options.identityWidth,
    identityCopy: options.identityCopy,
    title: lead ? `${lead.title}${more}` : '',
    // A declared photo column holds its place even on a line without one.
    photo: view.slots.photo === 'line' ? { url: lead?.photoUrl ?? null, fullUrl: lead?.photoFullUrl ?? null } : undefined,
    facts,
    next: model.next ? { label: model.next.label, blocked: model.next.blocked } : null,
    nextWidth: 'code',
    aria: { row: model.aria.card, open: model.aria.open, check: model.aria.check },
  };
}
