/**
 * The add-a-task composer vocabulary — ONE form, two mounts.
 *
 * `DailyComposerRow` (desk, under the slot table) and `MobileDailyComposerSheet`
 * (phone, BottomSheet) both build their fields from THIS module: field order,
 * labels, the emoji palette, cadence words, and validation. If a fact of the
 * form is not here, the two mounts have drifted — which is the fork the
 * handoff names as the failure mode ("If the two drift, the form has forked").
 *
 * Pure: no React. localStorage is guarded because the desk can SSR a composer
 * shell before hydration.
 */

import type { DailyCheckLinkInput, DailyCheckItemKind } from './types';

/** The field order, shared. Progressive: only the subject field is required. */
export const DAILY_COMPOSER_FIELD_ORDER = [
  'subject',
  'title',
  'cadence',
  'owner',
  'links',
] as const;

/**
 * WHAT the one field means (operator 2026-09-15: *"I need a switcher for
 * something like the title and the ticket — assigning a regular to-do list for
 * the title, and then assigning a ticket number for just the task as the
 * ticket"*).
 *
 * Two shapes the operator named, and they are genuinely different rows:
 *
 * • `task`   — a normal to-do. The typed text IS the title ("Customer support
 *              for Amazon"). Default cadence `recurring`: the named shift jobs
 *              are what recur.
 * • `ticket` — the task IS the ticket. The typed digits are a ticket id, the
 *              title DERIVES (`Ticket #N`), and the link is the row's real
 *              identity, so two people triaging 48120 tick ONE row instead of
 *              minting near-duplicate titles the report cannot join. Cadence is
 *              forced `once` — a recurring ticket would reappear forever and
 *              miss on every future report.
 *
 * An EXPLICIT switch replaces the earlier auto-detect (a bare-number title
 * silently became a ticket). Auto-detect was clever and unreliable: it could
 * not tell the task "5150" from ticket 5150, and the operator asked for a
 * reliable v1. The parse survives as {@link parseTicketFastPath} and now runs
 * only in `ticket` mode, where the intent is declared.
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
    glyph: null,
    kind: 'recurring',
    ownerId: null,
    ownerName: null,
    ticketId: '',
    workOrderId: '',
    tracking: '',
  };
}

/**
 * Flip the switcher, carrying the consequences the operator would otherwise
 * have to remember. Immutable.
 *
 * Ticket mode forces `once` and clears a `task`-mode title (it was prose, and
 * prose is not a ticket id). Task mode restores `recurring` and drops the
 * ticket link, because a titled to-do that silently kept a ticket attached
 * would put the row in the manager's ticket report under a name nobody typed.
 */
export function setComposerSubject(
  draft: DailyComposerDraft,
  subject: DailyComposerSubject,
): DailyComposerDraft {
  if (draft.subject === subject) return draft;
  return subject === 'ticket'
    ? { ...draft, subject, title: '', kind: 'once' }
    : { ...draft, subject, title: '', kind: 'recurring', ticketId: '' };
}

/**
 * ── Ticket-mode normalization (operator 2026-09-15) ──────────────────────────
 *
 * *"Just focusing on ticket number first to link the to-do list and checklist
 * item to the ticket number."*
 *
 * In `ticket` mode the one field holds the ticket, so the commit shape derives:
 * title `Ticket #N`, a real `ZENDESK_TICKET` link, cadence `once`. The link —
 * not the words — is the row's identity, which is what lets the manager report
 * join every tick on ticket 48120 into one row.
 *
 * Accepted in that field: `48120` · `#48120` · `zd 48120` · `ticket #48120` · a
 * Zendesk agent URL. A chip tapped in the slider sets `ticketId` directly and
 * wins over whatever is typed.
 *
 * **`task` mode never parses.** The title "5150" stays the title "5150". That
 * is the whole point of the switcher: intent is declared, not guessed.
 *
 * Normalization runs inside {@link dailyComposerCreateBody},
 * {@link dailyComposerError} and {@link dailyComposerLinkInputs}, so BOTH
 * mounts — the phone sheet and the desk `DailyComposerRow` — inherit it with no
 * UI fork. Desktop and mobile capture identically by construction.
 */
// One digit is legal: the SWITCHER declares intent, so there is no prose to
// protect. The old 2-digit floor existed only to stop auto-detect turning the
// task "5" into ticket 5 — the Ticket face makes that impossible, and a slider
// that offers ticket #4 must accept "4" typed.
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
 * Resolve a `ticket`-mode draft into its commit shape. Immutable and
 * idempotent. A no-op in `task` mode.
 *
 * **No glyph** (operator 2026-09-15: *"it wouldn't even have icons"*). An
 * operator who wants one can still pick it in the full form.
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

/** The POST /api/daily-checks/items body. Owner is stripped off recurring. */
export function dailyComposerCreateBody(
  rawDraft: DailyComposerDraft,
): { title: string; kind: DailyCheckItemKind; assignedStaffId?: number | null; glyph?: string | null } {
  const draft = applyTicketFastPath(rawDraft);
  return {
    title: draft.title.trim(),
    kind: draft.kind,
    assignedStaffId: draft.kind === 'once' ? draft.ownerId : null,
    glyph: draft.glyph,
  };
}

/**
 * Validate the draft the way the API will, and say it in the operator's own
 * vocabulary: in `ticket` mode a missing/garbled id is a TICKET problem, not "a
 * title is required" — an error naming a field the mode does not show is how a
 * form becomes unusable.
 */
export function dailyComposerError(rawDraft: DailyComposerDraft): string | null {
  const draft = applyTicketFastPath(rawDraft);

  if (rawDraft.subject === 'ticket') {
    const typed = rawDraft.ticketId.trim() || rawDraft.title.trim();
    if (!typed) return 'Enter or pick a ticket number';
    if (parseTicketFastPath(typed) == null) return 'That is not a ticket number';
  } else if (!draft.title.trim()) {
    return 'A title is required';
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
