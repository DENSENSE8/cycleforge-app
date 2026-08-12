/**
 * Station Ticket Displays — bubble + composer chrome SoT.
 *
 * Every Ticket leaf (Unbox · Arrival · Testing) mounts the same path:
 * {@link TicketDisplayHost} → {@link SupportTicketDetail} →
 * {@link MergedRecordStream} / {@link SupportChatComposer}. These tokens are
 * the ONE face for that path — import them; never re-derive blue/amber fills,
 * a second max-width, or a page-local composer pad.
 *
 * Host stays flush (`DISPLAYS_FLUSH_HOST`). Rows + composer own the gutter.
 *
 * Quiet grammar (2026-08-11): muted person marks + soft bubble shell only —
 * the Displays column plane and composer pad stay as-host; never gray the whole rail.
 */
import { cn } from '@/utils/_cn';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { formatLaneAgeCompact } from '@/utils/date';

/** Detail column plane — unchanged from the Displays host; quiet lives on bubbles only. */
export const TICKET_DETAIL_SURFACE = 'bg-surface-canvas/40';

/**
 * Floating composer pad under the thread — Displays gutter + bottom clearance
 * above the leaf footer (command / dismiss band).
 */
export const TICKET_COMPOSER_PAD = cn(
  DISPLAYS_BODY_INSET,
  'min-w-0 shrink-0 pt-2 pb-3',
);

/** Bubble stream list — owns the readable gutter. */
export const TICKET_BUBBLE_STREAM = cn(DISPLAYS_BODY_INSET, 'stack-tight');

/** One row: avatar left, bubble left — never `flex-row-reverse`. Tight gap. */
export const TICKET_BUBBLE_ROW =
  'flex min-w-0 flex-row justify-start gap-1.5 py-1';

/**
 * Message shell — white face on the Displays plane (same as host card).
 * Internal vs public is the INTERNAL badge after age, never a tinted fill.
 * Capped width; left-aligned; soft radius.
 */
export const TICKET_BUBBLE_SHELL =
  'min-w-0 max-w-[min(100%,75%)] stack-tight rounded-lg border border-border-hairline bg-surface-card px-2 py-1';

/**
 * Person mark on bubble rows — muted initials, no inverse black disc.
 * Applied via IdentityMark / StaffAvatar `className` (last in `cn`).
 */
export const TICKET_BUBBLE_MARK =
  '!bg-surface-canvas !font-medium !text-text-soft ring-1 ring-border-hairline';

/** Mark column width for bubble rows (xs IdentityMark = h-5). */
export const TICKET_BUBBLE_MARK_BOX = 'flex w-5 shrink-0 justify-start pt-0.5';

/** Dense body type for bubble shells — matches Displays rail chrome. */
export const TICKET_BUBBLE_BODY =
  'break-words text-role-micro leading-snug text-text-default';

/**
 * Meta line (Internal · author · age) — same micro role as the body.
 * Never `text-role-eyebrow` / uppercase (that turned ages into "9 HOURS AGO").
 */
export const TICKET_BUBBLE_META =
  'flex min-w-0 items-center gap-1 text-role-micro leading-none text-text-soft';

/** Internal chip — quiet amber tint, same micro face as author + age. */
export const TICKET_BUBBLE_INTERNAL_CHIP =
  'inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-role-micro font-medium text-amber-700/80 bg-amber-100/50';

/** Ledger / `/support` focus body — stays readable at data density. */
export const TICKET_LEDGER_BODY =
  'break-words text-role-data leading-relaxed text-text-default';

/**
 * Bubble age face from {@link formatLaneAgeCompact}: `9h` → `9 hrs`, `30m` →
 * `30 mins`, `3d` → `3 days`. Absolute stays on hover via the caller.
 */
export function formatTicketBubbleAge(
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
