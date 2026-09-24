/**
 * Agenda kind filter — MULTI-select, reorderable (operator 2026-09-23, wearing
 * the PM/e-commerce-manager hat: *"it should feature a drag and drop and a
 * rearrange and checklist selection of what is showing — not just all and one
 * at a time"*).
 *
 * The filter is a row of chips, one per band of the one task list
 * ({@link DailyAgendaType}). A chip PRESSED = that kind is showing; several
 * may be pressed at once. The row can be DRAGGED to rearrange — an operator
 * who lives in tickets puts Ticket first, and the row remembers.
 *
 * ONE declaration for both surfaces — the phone (`/m/home`) and the desk
 * (`/`) consume the same prefs model, so the two faces cannot disagree about
 * which kinds are showing. Pure: no React, no fetch.
 */

import type { DailyAgendaRow, DailyAgendaType } from '@/lib/daily/daily-agenda-row';
import { DAILY_AGENDA_TYPE_LABEL } from '@/lib/daily/daily-agenda-row';

export const AGENDA_KINDS: readonly DailyAgendaType[] = ['checklist', 'task', 'ticket'];

/** What each chip paints. */
export const AGENDA_KIND_LABEL: Readonly<Record<DailyAgendaType, string>> = {
  ...DAILY_AGENDA_TYPE_LABEL,
};

/**
 * The persisted state: chip ORDER (drag result) + which kinds are OFF.
 * Everything showing is the default, so `off` starts empty.
 */
export interface AgendaKindPrefs {
  order: readonly DailyAgendaType[];
  off: readonly DailyAgendaType[];
}

export const DEFAULT_AGENDA_KIND_PREFS: AgendaKindPrefs = {
  order: [...AGENDA_KINDS],
  off: [],
};

/**
 * Toggle one kind. Refuses to turn OFF the last kind that is on — a list with
 * nothing showing is a screen the operator cannot read, and the honest floor
 * is "you may narrow to one, not to zero".
 */
export function toggleAgendaKind(prefs: AgendaKindPrefs, kind: DailyAgendaType): AgendaKindPrefs {
  const isOff = prefs.off.includes(kind);
  if (isOff) return { ...prefs, off: prefs.off.filter((k) => k !== kind) };
  if (prefs.off.length >= AGENDA_KINDS.length - 1) return prefs;
  return { ...prefs, off: [...prefs.off, kind] };
}

/** The drag result: a new chip order, kinds never lost or invented. */
export function reorderAgendaKinds(prefs: AgendaKindPrefs, order: readonly DailyAgendaType[]): AgendaKindPrefs {
  if (order.length !== AGENDA_KINDS.length) return prefs;
  if (new Set(order).size !== AGENDA_KINDS.length) return prefs;
  if (!order.every((k) => AGENDA_KINDS.includes(k))) return prefs;
  return { ...prefs, order };
}

/** Is this band showing under these prefs? */
export function agendaKindVisible(prefs: AgendaKindPrefs, type: DailyAgendaType): boolean {
  return !prefs.off.includes(type);
}

/** Keep stored prefs honest — a stale or hand-edited blob collapses to default. */
export function parseAgendaKindPrefs(raw: string | null): AgendaKindPrefs {
  if (!raw) return DEFAULT_AGENDA_KIND_PREFS;
  try {
    const parsed = JSON.parse(raw) as { order?: unknown; off?: unknown };
    const order = reorderAgendaKinds(DEFAULT_AGENDA_KIND_PREFS, parsed.order as DailyAgendaType[]);
    const off = Array.isArray(parsed.off)
      ? (parsed.off.filter((k) => AGENDA_KINDS.includes(k as DailyAgendaType)) as DailyAgendaType[])
      : [];
    return { order: order.order, off };
  } catch {
    return DEFAULT_AGENDA_KIND_PREFS;
  }
}

/** Rows whose band is showing. Order of rows is the caller's business. */
export function filterAgendaByKinds<T extends { type: DailyAgendaType } | DailyAgendaRow>(
  rows: readonly T[],
  prefs: AgendaKindPrefs,
): T[] {
  return rows.filter((row) => agendaKindVisible(prefs, row.type));
}
