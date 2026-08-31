/** Shared textarea insert helpers for receiving note composers (label notes, claim body, …). */

import { formatPSTTimestamp } from '@/utils/date';

export function focusTextEnd(el: HTMLTextAreaElement | HTMLInputElement | null) {
  if (!el) return;
  const len = el.value.length;
  el.focus();
  el.setSelectionRange(len, len);
  if ('scrollTop' in el) el.scrollTop = el.scrollHeight;
}

export function appendNoteLine(current: string, addition: string): string {
  const trimmedAddition = addition.trim();
  if (!trimmedAddition) return current;
  const trimmedCurrent = current.trimEnd();
  return trimmedCurrent ? `${trimmedCurrent}\n${trimmedAddition}` : trimmedAddition;
}

/** Staff attribution line — matches receive-note stamping (`Name MM/DD/YYYY …`). */
export function buildStaffStampText(opts: {
  name?: string | null;
  staffId?: number | null;
}): string | null {
  const name = opts.name?.trim();
  const staffId = opts.staffId;
  const label =
    name || (staffId != null && Number.isFinite(staffId) && staffId > 0 ? `Staff #${staffId}` : null);
  if (!label) return null;
  return `${label} ${formatPSTTimestamp()}`;
}

/** Zoho PO unit cost — same `$88.77` shape as {@link UnitPriceChip}. */
export function formatUnitPriceForNotes(unitPrice: string | number | null | undefined): string | null {
  if (unitPrice == null || unitPrice === '') return null;
  const n = Number(unitPrice);
  if (!Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

/** Serial line for note/claim inserts — matches receive + Zoho (`SN:` / `SNs:`). */
export function formatSerialsForNotes(serialNumbers: string[]): string | null {
  const cleaned = serialNumbers.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return `SN: ${cleaned[0]}`;
  return `SNs: ${cleaned.join(', ')}`;
}

/** Numeric Zendesk id from "#9395", a bare id, or a ticket URL. */
export function parseZendeskTicketId(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? String(raw) : null;
  const fromUrl = raw.match(/tickets\/(\d+)/);
  const digits = (fromUrl ? fromUrl[1] : raw.replace(/^#/, '')).match(/\d+/);
  if (!digits) return null;
  const n = Number(digits[0]);
  return Number.isInteger(n) && n > 0 ? String(n) : null;
}

/** Fixed square hit target — top-right inserts and bottom-right actions share one size. */
export const NOTE_OVERLAY_ICON_BTN =
  'ds-raw-button inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded';

export const NOTE_OVERLAY_ICON = 'h-3.5 w-3.5';

/**
 * Textarea insets when {@link NoteComposerInsertRail} floats over line 1.
 * Right padding keeps wrapped text out from under the icon-only `+` control.
 */
export const NOTE_COMPOSER_OVERLAY_PAD = 'py-2 pr-10';

/** Extra bottom inset when bottom-right icon actions share the same field. */
export const NOTE_COMPOSER_OVERLAY_PAD_BOTTOM_ACTIONS = 'pb-8';

/**
 * Insert `+` trigger — faint at rest; hover/open = white surface, gray ring,
 * gray `+` (same outline method as sync, neutral chrome instead of blue).
 */
export const NOTE_INSERT_TRIGGER_BTN = `${NOTE_OVERLAY_ICON_BTN} text-text-faint transition hover:bg-surface-card hover:text-text-muted hover:shadow-sm hover:ring-1 hover:ring-border-soft`;

export const NOTE_INSERT_TRIGGER_BTN_ACTIVE =
  'bg-surface-card text-text-muted shadow-sm ring-1 ring-border-soft';

/**
 * Flush dock `+` — fills an h-11 edge cell, no inset pad / rounded chip.
 * Quieter at rest (transparent · faint glyph); white surface only while open
 * (click / menu armed). Used on the Unbox dogfood label-note strip.
 */
export const NOTE_INSERT_TRIGGER_DOCK_BTN =
  'ds-raw-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-none bg-transparent text-text-faint transition hover:text-text-muted';

export const NOTE_INSERT_TRIGGER_DOCK_BTN_ACTIVE =
  'bg-surface-card text-text-muted';

/** Circular + for station composer bottom action bar (matches ComposerPlusButton). */
export const NOTE_INSERT_TRIGGER_COMPOSER_BTN =
  'ds-raw-button inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-faint transition hover:bg-surface-sunken hover:text-text-muted';

export const NOTE_INSERT_TRIGGER_COMPOSER_BTN_ACTIVE =
  'bg-surface-sunken text-text-default';

export const NOTE_TAG_BTN = `${NOTE_OVERLAY_ICON_BTN} text-orange-500 transition hover:bg-orange-100/60 hover:text-orange-600 hover:shadow-sm hover:ring-1 hover:ring-orange-200/80`;

export const NOTE_DOWNLOAD_INSERT_BTN = `${NOTE_OVERLAY_ICON_BTN} text-blue-600 transition hover:bg-blue-100/60 hover:text-blue-700 hover:shadow-sm hover:ring-1 hover:ring-blue-200/80`;

export const NOTE_SAVE_BTN = `${NOTE_OVERLAY_ICON_BTN} text-text-faint transition hover:bg-emerald-100/60 hover:text-emerald-600 hover:shadow-sm hover:ring-1 hover:ring-emerald-200/80`;

export const NOTE_STAFF_STAMP_BTN = `${NOTE_OVERLAY_ICON_BTN} text-violet-600 transition hover:bg-violet-100/60 hover:text-violet-700 hover:shadow-sm hover:ring-1 hover:ring-violet-200/80`;

export const NOTE_SERIAL_INSERT_BTN = `${NOTE_OVERLAY_ICON_BTN} text-emerald-600 transition hover:bg-emerald-100/60 hover:text-emerald-700 hover:shadow-sm hover:ring-1 hover:ring-emerald-200/80`;

/** Unit cost — emerald money tone in the insert menu. */
export const NOTE_UNIT_PRICE_BTN = `${NOTE_OVERLAY_ICON_BTN} text-emerald-600 transition hover:bg-emerald-100/60 hover:text-emerald-700 hover:shadow-sm hover:ring-1 hover:ring-emerald-200/80`;

/** Insert menu panel — soft corners matching composer chrome. */
export const NOTE_INSERT_MENU_PANEL = 'rounded-xl border-border-soft';

/** Shared composer + menu shell (Unbox inserts · Ticket tools · @ context). */
export const NOTE_INSERT_MENU_PANEL_CLASS = 'w-56 overflow-hidden';

/** Menu row — full-width hover wash, flush to the rounded panel edge. */
export const NOTE_INSERT_MENU_ROW =
  'ds-raw-button flex w-full items-center gap-2 rounded-none border-0 px-3 py-1.5 text-left text-role-caption font-semibold text-text-muted shadow-none outline-none transition-colors hover:bg-surface-hover hover:text-text-default disabled:cursor-not-allowed disabled:opacity-50';

export const NOTE_INSERT_MENU_ROW_SELECTED = 'bg-surface-hover text-text-default';

/** Section seam only — no inset gutter around nested tools. */
export const NOTE_INSERT_MENU_SECTION = 'border-t border-border-hairline';

export const NOTE_INSERT_MENU_ICON_CELL =
  'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center';

/** Menu leading-icon tones only (no chip ring/box — keeps rows hairline-free). */
export const NOTE_INSERT_MENU_ICON_TONE: Record<string, string> = {
  'staff-stamp': 'text-violet-600',
  'ticket-subject': 'text-orange-500',
  'unit-price': 'text-emerald-600',
  'sync-notes': 'text-blue-600',
  'product-title': 'text-yellow-600',
  serial: 'text-emerald-600',
  'last-notes': 'text-text-faint',
  'internal-notes': 'text-text-faint',
};

export const NOTE_CLEAR_BTN =
  'ds-raw-button rounded inset-chip text-role-micro font-semibold text-text-faint transition hover:bg-surface-sunken/80 hover:text-text-muted';

/**
 * Which ghost the notes composer paints, and what accepting it applies.
 *
 * Two ghost sources share one overlay: the Recent hover preview (the DB
 * sticker center) and the MRU prefix autocomplete. They must never be confused
 * for each other — the overlay is a promise about what the next gesture
 * inserts, and Recent's click always inserts `recentPhrase`.
 *
 * - Empty field + Recent hovered → paint the whole Recent phrase; accepting it
 *   is the same gesture as clicking Recent.
 * - Non-empty field + Recent hovered → paint NOTHING. The full phrase cannot
 *   render as a suffix after the typed text, and leaving the MRU ghost up
 *   previews an older device-bank phrase that Recent would never insert.
 * - Recent not hovered → the MRU prefix ghost, unchanged.
 */
export function resolveNoteGhostPaint(opts: {
  /** Recent (History) is hovered / focused. */
  recentHover: boolean;
  /** DB sticker center for the last scanned carton — what Recent applies. */
  recentPhrase: string;
  /** Live composer draft. */
  value: string;
  /** MRU prefix-autocomplete match, if any. */
  matchedPhrase: string | null;
  /** Suffix of {@link matchedPhrase} past what is typed. */
  ghostSuffix: string;
}): {
  matchedPhrase: string | null;
  ghostSuffix: string | undefined;
  /** True when accepting the ghost must run Recent's apply, not the MRU's. */
  acceptAppliesRecent: boolean;
} {
  const preview = opts.recentHover ? opts.recentPhrase.trim() : '';
  const showRecentGhost = Boolean(preview) && !opts.value.trim();
  if (showRecentGhost) {
    return {
      matchedPhrase: preview,
      ghostSuffix: preview,
      acceptAppliesRecent: true,
    };
  }
  if (opts.recentHover) {
    return { matchedPhrase: null, ghostSuffix: undefined, acceptAppliesRecent: false };
  }
  return {
    matchedPhrase: opts.matchedPhrase,
    ghostSuffix: opts.ghostSuffix || undefined,
    acceptAppliesRecent: false,
  };
}
