/**
 * Conversation chrome SoT — hard DS primitive for every message bubble / chat
 * card across the app (helpdesk tickets, entity threads, Assist surfaces).
 *
 * Compose {@link ConversationMessageCard} + these tokens; never fork a
 * page-local bubble shell, blue/amber fill, or 75% chat bubble. Lookup:
 * `node scripts/sot-lookup.mjs "conversation message"`.
 *
 * Face: white column plane · gray public cards · amber internal wash · Inter
 * sans (`font-sans`) · circular header actions for thread chrome clusters.
 */
import { cn } from '@/utils/_cn';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
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

/** Composer pad under a thread — Displays gutter + bottom clearance. */
export const CONVERSATION_COMPOSER_PAD = cn(
  DISPLAYS_BODY_INSET,
  'min-w-0 shrink-0 pt-2 pb-3 font-sans',
);

/**
 * OmnichannelComposerDock shell when composing an internal note — amber wash
 * matches {@link CONVERSATION_SHELL_INTERNAL}.
 */
export const CONVERSATION_COMPOSER_DOCK_INTERNAL =
  '!border-amber-200/70 !bg-amber-50 focus-within:!ring-amber-500/20';

/** Message stream list — owns the readable gutter. */
export const CONVERSATION_STREAM = cn(DISPLAYS_BODY_INSET, 'stack-tight font-sans');

/** Day band — date · count as text; no table-band fill. */
export const CONVERSATION_DAY_HEADER = 'bg-transparent px-0 backdrop-blur-none';

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
