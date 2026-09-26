/** The add-a-task composer vocabulary — ONE form, two mounts. */

import type { DailyCheckCreateInput, DailyCheckLinkInput, DailyCheckItemKind } from './types';

/** The field order, shared. Progressive: only the subject field is required. */
export const DAILY_COMPOSER_FIELD_ORDER = [
  'subject',
  'title',
  'description',
  'cadence',
  'owner',
  'links',
] as const;

/**
 * WHAT the one field means (operator 2026-09-15:
 * WHAT the one field means (operator 2026-09-15: *"I need a switcher for
 */
export const DAILY_COMPOSER_SUBJECT = [
  { id: 'task', label: 'Task' },
  { id: 'ticket', label: 'Ticket' },
] as const;

export type DailyComposerSubject = (typeof DAILY_COMPOSER_SUBJECT)[number]['id'];

/** Cadence vocabulary — "type" means cadence, never subject (2026-09-15). */
export const DAILY_COMPOSER_CADENCE = [
  { id: 'recurring', label: 'Every day' },
  { id: 'once', label: 'Just today' },
] as const satisfies readonly { id: DailyCheckItemKind; label: string }[];

/**
 * The curated grid — ~48 ops-relevant emoji. Stored as the CHARACTER itself
 * (see the migration): zero render path, works on every face.
 */
export const DAILY_GLYPH_PALETTE: readonly string[] = [
  '✅', '⚠️', '🔒', '🔑', '📦', '🖨️', '🏷️', '🔋',
  '🔌', '🧹', '🗑️', '🚚', '📋', '📝', '📌', '📎',
  '🔧', '🔨', '🪛', '💡', '🌡️', '❄️', '💧', '🧯',
  '🚨', '📞', '📧', '💻', '🖥️', '⌨️', '🖱️', '🔍',
  '📊', '📈', '⏰', '⏳', '🔄', '🔁', '➡️', '⬆️',
  '⬇️', '💰', '🛒', '🎯', '👀', '🤝', '☕', '🧰',
];

/** DB CHECK ceiling: one emoji can be several code units (ZWJ, skin tones). */
export const DAILY_GLYPH_MAX_CHARS = 8;

const GLYPH_RECENTS_KEY = 'daily-check-glyph-recents';
const GLYPH_RECENTS_CAP = 8;

export function readGlyphRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GLYPH_RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((g): g is string => typeof g === 'string' && g.length > 0).slice(0, GLYPH_RECENTS_CAP)
      : [];
  } catch {
    return [];
  }
}

export function rememberGlyph(glyph: string): string[] {
  const next = [glyph, ...readGlyphRecents().filter((g) => g !== glyph)].slice(0, GLYPH_RECENTS_CAP);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GLYPH_RECENTS_KEY, JSON.stringify(next));
    } catch {
      // Private-browsing/quota — recents are a convenience, never a blocker.
    }
  }
  return next;
}

/** The raw link inputs, exactly as typed; parsed on submit, never per keystroke. */
export interface DailyComposerDraft {
  /** Which switcher face is active — what the one field means. */
  subject: DailyComposerSubject;
  /**
   * In `task` mode the literal title. In `ticket` mode the operator types the
   * ticket number HERE (one field, one focus) and the title derives on submit.
   */
  title: string;
  /** Optional context for the item itself; a mark carries no daily note. */
  description: string;
  /** The emoji character itself, or null. v1 never sets one. */
  glyph: string | null;
  kind: DailyCheckItemKind;
  /** Only meaningful (and only shown) when kind is `once`. */
  ownerId: number | null;
  ownerName: string | null;
  /** The linked ticket — typed digits or a chip the operator tapped. */
  ticketId: string;
  workOrderId: string;
  tracking: string;
}

export function newDailyComposerDraft(): DailyComposerDraft {
  return {
    subject: 'task',
    title: '',
    description: '',
    glyph: null,
    kind: 'recurring',
    ownerId: null,
    ownerName: null,
    ticketId: '',
    workOrderId: '',
    tracking: '',
  };
}

/** Flip the switcher, carrying the consequences the operator would otherwise have to remember. */
export function setComposerSubject(
  draft: DailyComposerDraft,
  subject: DailyComposerSubject,
): DailyComposerDraft {
  if (draft.subject === subject) return draft;
  return subject === 'ticket'
    ? { ...draft, subject, title: '', kind: 'once' }
    : { ...draft, subject, title: '', kind: 'recurring', ticketId: '' };
}

/** ── Ticket-mode normalization (operator 2026-09-15) ────────────────────────── */
// One digit is legal:
const TICKET_BARE_RE = /^(?:#|zd|zen|ticket)?[\s#:-]*(\d{1,10})$/i;
const TICKET_URL_RE = /zendesk\.com\/(?:agent\/)?tickets\/(\d{1,10})/i;

/** The ticket id a bare title names, or null when the title is ordinary prose. */
export function parseTicketFastPath(rawTitle: string): number | null {
  const raw = rawTitle.trim();
  if (!raw) return null;
  const match = TICKET_URL_RE.exec(raw) ?? TICKET_BARE_RE.exec(raw);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Resolve a `ticket`-mode draft into its commit shape.
 * **No glyph** (operator 2026-09-15: *"it wouldn't even have icons"*). An
 */
export function applyTicketFastPath(draft: DailyComposerDraft): DailyComposerDraft {
  if (draft.subject !== 'ticket') return draft;

  // A tapped chip is an explicit choice and outranks the typed text.
  const ticket = draft.ticketId.trim()
    ? parseTicketFastPath(draft.ticketId)
    : parseTicketFastPath(draft.title);
  if (ticket == null) return draft;

  return {
    ...draft,
    title: `Ticket #${ticket}`,
    kind: 'once',
    ticketId: String(ticket),
  };
}

/** Normalize the transport body shared by the phone and desk composers. */
export function dailyComposerCreateBody(
  rawDraft: DailyComposerDraft,
): DailyCheckCreateInput {
  const draft = applyTicketFastPath(rawDraft);
  const description = draft.description.trim();
  return {
    title: draft.title.trim(),
    description: description || null,
    kind: draft.kind,
    ...(draft.kind === 'once' ? { assignedStaffId: draft.ownerId } : {}),
    glyph: draft.glyph,
  };
}

/** Validate the draft the way the API will, and say it in the operator's own vocabulary: */
export function dailyComposerError(rawDraft: DailyComposerDraft): string | null {
  const draft = applyTicketFastPath(rawDraft);

  if (rawDraft.subject === 'ticket') {
    const typed = rawDraft.ticketId.trim() || rawDraft.title.trim();
    if (!typed) return 'Enter or pick a ticket number';
    if (parseTicketFastPath(typed) == null) return 'That is not a ticket number';
  } else if (!draft.title.trim()) {
    return 'A title is required';
  }

  if (draft.description.length > 2000) {
    return 'The description must be 2000 characters or fewer';
  }

  if (draft.glyph != null && (draft.glyph.length === 0 || draft.glyph.length > DAILY_GLYPH_MAX_CHARS)) {
    return `The glyph must be 1–${DAILY_GLYPH_MAX_CHARS} characters`;
  }
  const links = dailyComposerLinkInputs(draft);
  if (!links.ok) return links.error;
  return null;
}

/** Parse the raw link inputs. Ok ⇒ the attach list, in field order. */
export function dailyComposerLinkInputs(
  rawDraft: DailyComposerDraft,
): { ok: true; links: DailyCheckLinkInput[] } | { ok: false; error: string } {
  const draft = applyTicketFastPath(rawDraft);
  const links: DailyCheckLinkInput[] = [];
  const ticket = draft.ticketId.trim();
  if (ticket) {
    const n = Number(ticket.replace(/^#/, ''));
    if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'Ticket must be a number' };
    links.push({ entityType: 'ZENDESK_TICKET', entityId: n });
  }
  const workOrder = draft.workOrderId.trim();
  if (workOrder) {
    const n = Number(workOrder);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'Work order must be a number' };
    links.push({ entityType: 'WORK_ORDER', entityId: n });
  }
  const tracking = draft.tracking.trim();
  if (tracking) {
    if (tracking.length > 64) return { ok: false, error: 'That tracking number is too long' };
    links.push({ entityType: 'TRACKING', entityId: null, label: tracking });
  }
  return { ok: true, links };
}

/**
 * The glyph-prefixed title both faces paint — one derivation, one place.
 * A null glyph paints the bare title, byte-for-byte the old face.
 */
export function dailyCheckItemTitle(item: {
  title: string;
  glyph: string | null;
}): string {
  return item.glyph ? `${item.glyph} ${item.title}` : item.title;
}
