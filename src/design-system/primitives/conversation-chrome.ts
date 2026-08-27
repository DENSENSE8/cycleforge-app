/**
 * Conversation chrome SoT — hard DS primitive for every message bubble / chat
 * card across the app (helpdesk tickets, entity threads, Assist surfaces).
 *
 * Compose {@link ConversationMessageCard} + these tokens; never fork a
 * page-local bubble shell, blue/amber fill, or 75% chat bubble. Lookup:
 *
 * Face: white column plane · gray public cards · amber internal wash · Inter
 * sans (`font-sans`) · circular header actions for thread chrome clusters.
 */
import { cn } from '@/utils/_cn';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { FLOATING_DOCK_BOTTOM_PAD } from '@/design-system/tokens/dock-clearance';
import { formatLaneAgeCompact } from '@/utils/date';

/** Conversation column plane — white so gray cards read as events. */
export const CONVERSATION_DETAIL_SURFACE = 'bg-surface-card font-sans';

/**
 * Circular thread-header action (Link · Details · Open · inspector).
 * Never flush cube / `rounded-none` for this cluster (Band-1 Exit stays cube).
 */
export const CONVERSATION_HEADER_ACTION_BTN =
  'ds-raw-button relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-card text-text-muted ring-1 ring-inset ring-border-soft transition hover:bg-surface-hover hover:text-text-default';

export const CONVERSATION_HEADER_ACTION_BTN_ACTIVE =
  'bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-50 hover:text-blue-700';

export const CONVERSATION_HEADER_ACTION_GLYPH = 'h-3.5 w-3.5 shrink-0';

/**
 * Composer pad under a thread — Displays gutter + bottom clearance.
 *
 * The pad paints no fill and no top-edge fade. The dock is a bordered card on
 * the conversation plane; dissolving the last row under it read as a shadow
 * strip on Totals / notes in every Ticket Displays and right-rail host.
 */
export const CONVERSATION_COMPOSER_PAD = cn(
  DISPLAYS_BODY_INSET,
  'relative min-w-0 shrink-0 bg-transparent pt-2 font-sans',
  // Same floating-dock clearance as the Unbox notes dock on the centre column.
  FLOATING_DOCK_BOTTOM_PAD,
);

/**
 * OmnichannelComposerDock shell when composing an internal note.
 *
 * Channel is carried by the amber HAIRLINE + focus ring, not by a filled wash:
 * the entry field keeps the dock's own white card so it floats on the
 * conversation plane. The amber FILL stays where it belongs — on posted
 * internal messages ({@link CONVERSATION_SHELL_INTERNAL}), which is what makes
 * an internal note legible in the stream after it is sent.
 */
export const CONVERSATION_COMPOSER_DOCK_INTERNAL =
  '!border-amber-300/80 focus-within:!ring-amber-500/20';

/** Message stream list — owns the readable gutter. */
export const CONVERSATION_STREAM = cn(DISPLAYS_BODY_INSET, 'stack-tight font-sans');

/**
 * Day band — date · count as text, no table-band fill.
 *
 * OPAQUE plane fill (not transparent): the band is `sticky top-0` inside the
 * thread's scroll port, so a transparent band let message cards read straight
 * through the docked date while they scrolled under it. The fill is the
 * conversation's own white plane, so it stays invisible at rest and only shows
 * itself as the cover it is while a day scrolls past.
 */
export const CONVERSATION_DAY_HEADER =
  'bg-surface-card px-0 py-1 backdrop-blur-none';

/** One row: avatar left, card left — never `flex-row-reverse`. */
export const CONVERSATION_ROW =
  'flex min-w-0 flex-row justify-start gap-1.5 py-1';

/**
 * Message shell — full-width column card.
 * Public = gray canvas; {@link conversationShell}(true) for internal amber.
 */
export const CONVERSATION_SHELL =
  'min-w-0 flex-1 stack-tight rounded-lg border border-border-hairline bg-surface-canvas px-2.5 py-1.5';

export const CONVERSATION_SHELL_INTERNAL =
  'border-amber-200/70 bg-amber-50';

export function conversationShell(internal: boolean): string {
  return cn(CONVERSATION_SHELL, internal && CONVERSATION_SHELL_INTERNAL);
}

export const CONVERSATION_MARK =
  '!bg-surface-sunken !font-medium !text-text-soft ring-1 ring-border-hairline';

export const CONVERSATION_MARK_BOX =
  'flex w-5 shrink-0 justify-start pt-0.5';

export const CONVERSATION_BODY =
  'break-words font-sans text-role-caption leading-snug text-text-default';

export const CONVERSATION_META =
  'flex min-w-0 flex-wrap items-center gap-1 font-sans text-role-caption leading-none';

export const CONVERSATION_AUTHOR =
  'truncate font-semibold text-text-default';

export const CONVERSATION_AGE = 'shrink-0 text-text-faint';

export const CONVERSATION_INTERNAL_CHIP =
  'inline-flex shrink-0 items-center rounded px-1 py-px font-sans text-role-caption font-medium text-amber-700/80 bg-amber-100/50';

/**
 * Relative age face: `9h` → `9 hrs`, `30m` → `30 mins`, `3d` → `3 days`.
 */
export function formatConversationAge(
  input: string | Date | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  const compact = formatLaneAgeCompact(input, nowMs);
  if (!compact) return null;
  if (compact === '<1m') return '<1 min';
  const match = /^(\d+)([mhd])$/.exec(compact);
  if (!match) return compact;
  const n = Number(match[1]);
  const unit = match[2];
  if (unit === 'm') return n === 1 ? '1 min' : `${n} mins`;
  if (unit === 'h') return n === 1 ? '1 hr' : `${n} hrs`;
  return n === 1 ? '1 day' : `${n} days`;
}
