/**
 * Conversation chrome SoT — hard DS primitive for every message bubble / chat
 * card across the app (helpdesk tickets, entity threads, Assist surfaces).
 *
 * Compose {@link ConversationMessageCard} + these tokens; never fork a
 * page-local bubble shell, blue/amber fill, or 75% chat bubble. Lookup:
 *
 * Face: a CONNECTED ACTIVITY TIMELINE — white plane, a 1px spine down the node
 * column, the author's avatar anchored on it as the node, and a gray card
 * beside it holding the message (amber when internal), capped at a reading
 * measure rather than running the column's full width. Inter sans
 * (`font-sans`) · circular header actions for thread chrome clusters.
 */
import { cn } from '@/utils/_cn';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { FLOATING_DOCK_BOTTOM_PAD } from '@/design-system/tokens/dock-clearance';
import { formatLaneAgeCompact } from '@/utils/date';

/**
 * Conversation column plane — white, so the gray message cards read as events
 * sitting on it.
 *
 * The cards were briefly flattened into the plane (2026-08-30) on the theory
 * that the spine alone could carry sequence. Reverted the same day: the spine
 * says these happened IN ORDER, which is not the same claim as this is one
 * message and that is another. On a wide centre column a message with no
 * wrapper is a paragraph of loose text, and two consecutive replies from the
 * same author become one block of prose. The card is the message boundary; the
 * spine is the thread. Both, not either.
 */
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

/**
 * One row: node left, body right — never `flex-row-reverse`.
 *
 * `group` so the spine can trim itself on the last row (`group-last:`), and
 * `items-start` so the node anchors to the body's FIRST line rather than
 * centring against a body of unknown height.
 */
export const CONVERSATION_ROW =
  'group relative flex min-w-0 flex-row items-start justify-start gap-2 py-1';

/**
 * The node column — the timeline track. Holds the spine behind the caller's
 * mark, so the line and the node cannot drift apart horizontally.
 */
export const CONVERSATION_SPINE_TRACK = 'relative flex shrink-0';

/**
 * The vertical spine — one continuous 1px thread down the node column.
 *
 * `-bottom-1.5` bridges the stream's own row gap (`stack-tight`, 6px): without
 * it the line breaks between every message and reads as a stack of tick marks
 * rather than one thread. `group-last:bottom-0` stops it at the final node —
 * a thread that runs past its last event is claiming there is more below.
 *
 * Behind the node (`z-0` vs the mark's `z-10`), which is what makes the node
 * read as a bead ON the thread instead of a circle beside it.
 */
export const CONVERSATION_SPINE = cn(
  'pointer-events-none absolute left-1/2 top-0 -bottom-1.5 z-0 w-px -translate-x-1/2',
  'bg-border-subtle group-last:bottom-0',
);

/**
 * Message card — gray canvas on the white plane. The card IS the message
 * boundary; {@link conversationShell}(true) swaps the fill for internal amber.
 *
 * ## Capped, never edge to edge
 *
 * `max-w-2xl` (42rem) is the reading measure. The station centre floors at
 * 720px and GROWS with the frame, so an uncapped `flex-1` card stretches its
 * lines as wide as the operator's monitor — a claim body then runs 1,400px per
 * line and the eye loses the return sweep. At the floor the card very nearly
 * fills the column (672 + the 20px node + the 8px gap = 700 of 720); past that
 * it stops and the column grows around it.
 *
 * The cap lives here rather than on the centre host so every conversation host
 * shares one measure. In the narrow right-rail Displays it simply never binds.
 *
 * `py-1.5` also sets the node's baseline (see {@link CONVERSATION_MARK_BOX}) —
 * change it and check both.
 */
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
 * The node itself. OPAQUE and `z-10` on purpose — it is what masks the spine
 * where the two cross, and an unfilled node lets the line run straight through
 * the avatar.
 */
export const CONVERSATION_MARK = cn(
  '!bg-surface-sunken !font-medium !text-text-soft ring-1 ring-border-hairline',
  'relative z-10',
);

/**
 * Node box — centred on the spine, and top-aligned to the body's first line.
 *
 * `justify-center`, not `justify-start`: the node has to sit ON the thread, and
 * the track is exactly the node's width, so centring is what puts the two on
 * one axis.
 *
 * `pt-0.5` is the cross-axis anchor and it is derived, not taste: the body
 * starts `py-1.5` (6px) down, its meta line is `text-role-caption` at
 * `leading-none` (12px), so that line's centre sits 12px below the row top. A
 * 20px node centres there at `top: 2px`. Move the body's padding or the meta's
 * leading and this moves with it.
 */
export const CONVERSATION_MARK_BOX =
  'flex w-5 shrink-0 justify-center pt-0.5';

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
