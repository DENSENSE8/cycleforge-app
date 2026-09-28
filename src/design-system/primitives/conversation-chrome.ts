/** Conversation chrome SoT — hard DS primitive for every message bubble / chat card across the app (helpdesk tickets, entity threads,… */
import { cn } from '@/utils/_cn';
import { FLOATING_DOCK_BOTTOM_PAD } from '@/design-system/tokens/dock-clearance';
import { formatLaneAgeCompact } from '@/utils/date';

/** Conversation column plane — white, so the gray message cards read as events sitting on it. */
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

/** Conversation column inset — same `px-3` as station band names and the ticket title, so avatars, title glyph, and Items/Label icons share… */
export const CONVERSATION_INSET = 'px-3';

export const CONVERSATION_COMPOSER_PAD = cn(
  CONVERSATION_INSET,
  'relative min-w-0 shrink-0 bg-transparent pt-2 font-sans',
  FLOATING_DOCK_BOTTOM_PAD,
);

/** OmnichannelComposerDock shell when composing an internal note. */
export const CONVERSATION_COMPOSER_DOCK_INTERNAL =
  '!border-amber-300/80 focus-within:!ring-amber-500/20';

/** Message stream list — owns the readable gutter. */
export const CONVERSATION_STREAM = cn(CONVERSATION_INSET, 'stack-tight font-sans');

/**
 * Day divider — civil date, centred in the conversation column (Telegram),
 * not a sticky table band. The clock lives IN the message card; this row
 * only names the day.
 */
export const CONVERSATION_DAY_HEADER = 'flex justify-center py-2';

export const CONVERSATION_DAY_LABEL =
  'font-sans text-role-micro font-semibold text-text-muted';

/** One row: node left, body right — never `flex-row-reverse`. */
export const CONVERSATION_ROW =
  'group relative flex min-w-0 flex-row items-start justify-start gap-2 py-1';

/**
 * The node column — the timeline track. Holds the spine behind the caller's
 * mark, so the line and the node cannot drift apart horizontally.
 */
export const CONVERSATION_SPINE_TRACK = 'relative flex shrink-0';

/** The vertical spine — one continuous 1px thread down the node column. */
export const CONVERSATION_SPINE = cn(
  'pointer-events-none absolute left-1/2 top-0 -bottom-1.5 z-0 w-px -translate-x-1/2',
  'bg-border-subtle group-last:bottom-0',
);

/** Message card — gray canvas on the white plane. */
export const CONVERSATION_SHELL =
  'min-w-0 max-w-2xl flex-1 stack-tight rounded-lg border border-border-hairline bg-surface-canvas px-2.5 py-1.5';

/**
 * Internal note — same card, amber fill. The tint is SEMANTIC: it is the
 * difference between something the customer can read and something they cannot.
 */
export const CONVERSATION_SHELL_INTERNAL =
  'border-amber-200/70 bg-amber-50';

export function conversationShell(internal: boolean): string {
  return cn(CONVERSATION_SHELL, internal && CONVERSATION_SHELL_INTERNAL);
}

/**
 * Spine mask on the node. Staff faces compose {@link StaffAvatar} (`sm` +
 * `colorRing`) and MUST NOT also take {@link CONVERSATION_MARK_PLACEHOLDER} —
 * that fill is `!bg-surface-sunken` and would wipe the staffer's colour.
 */
export const CONVERSATION_MARK_NODE = 'relative z-10';

/**
 * Non-staff node (Zendesk / customer / system) — sunken canvas, not identity
 * colour. Do not put this on {@link StaffAvatar}.
 */
export const CONVERSATION_MARK_PLACEHOLDER = cn(
  '!bg-surface-sunken !font-medium !text-text-soft ring-1 ring-border-hairline',
  CONVERSATION_MARK_NODE,
);

/** @deprecated Prefer {@link CONVERSATION_MARK_PLACEHOLDER} or {@link CONVERSATION_MARK_NODE}. */
export const CONVERSATION_MARK = CONVERSATION_MARK_PLACEHOLDER;

/** Node box — centred on the spine, top-aligned with the card's first line (author). */
export const CONVERSATION_MARK_BOX =
  'flex w-7 shrink-0 justify-center pt-1.5';

export const CONVERSATION_BODY =
  'break-words font-sans text-role-caption leading-snug text-text-default';

/** Copy + Telegram clock. */
export const CONVERSATION_COPY = cn(
  'relative min-w-0 font-sans text-role-caption leading-snug text-text-default [overflow-wrap:anywhere]',
  // Markdown wraps blocks in `.stack-row`; hoist so the last <p> is a sibling
  // of the clock pad (a wrapper would force the time onto its own row).
  '[&>.stack-row]:contents',
  '[&_p:last-of-type]:inline [&_h1:last-of-type]:inline [&_h2:last-of-type]:inline [&_h3:last-of-type]:inline',
);

export const CONVERSATION_META =
  'flex min-w-0 flex-wrap items-center gap-1 font-sans text-role-caption leading-none';

export const CONVERSATION_AUTHOR =
  'truncate font-semibold text-text-default';

const CONVERSATION_CLOCK_FACE =
  'font-sans text-role-micro tabular-nums leading-none text-text-faint';

/** Invisible last-line reservation — same face as {@link CONVERSATION_CLOCK}. */
export const CONVERSATION_CLOCK_PAD = cn(
  'float-right ml-1.5 inline-block select-none invisible',
  CONVERSATION_CLOCK_FACE,
);

/**
 * Visible clock — over the pad at the copy's bottom-right.
 */
export const CONVERSATION_CLOCK = cn(
  'absolute bottom-0 right-0',
  CONVERSATION_CLOCK_FACE,
);

/** @deprecated Use {@link CONVERSATION_CLOCK}. */
const CONVERSATION_AGE = CONVERSATION_CLOCK;

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
