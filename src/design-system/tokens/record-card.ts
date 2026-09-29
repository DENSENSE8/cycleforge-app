/**
 * Record card tokens shared by every face of the triage card — the desk
 * `RecordCard` and the phone `RecordCardMobile` (owner 2026-09-28, BRIEF §14):
 * the deadline (SLA) pill's ink and dot, and the hatched state rail.
 */

import type { RecordDeadlineTone } from '@/design-system/components/record-card/record-card-types';

/** The deadline pill's ink, by tone (late → none). */
export const RECORD_DEADLINE_TONE_CLASS: Readonly<Record<RecordDeadlineTone, string>> = {
  late: 'text-text-danger font-semibold',
  today: 'text-text-warning font-semibold',
  soon: 'text-text-default font-medium',
  later: 'text-text-muted',
  none: 'text-text-faint',
};

/** The deadline pill's dot, by tone. */
export const RECORD_DEADLINE_DOT_CLASS: Readonly<Record<RecordDeadlineTone, string>> = {
  late: 'bg-fill-danger',
  today: 'bg-fill-warning',
  soon: 'bg-fill-info',
  later: 'bg-border-strong',
  none: 'bg-border-default',
};

/** Hatched rail — a state that must read on white without washing the card. */
export const RECORD_RAIL_HATCH_STYLE = {
  backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, rgb(255 255 255 / 0.55) 3px 5px)',
} as const;

/**
 * The phone card's photo (`RecordCardMobile`, owner 2026-09-29): exactly as tall as the two body
 * rows beside it, so the text never floats in a taller image — a `text-role-body` title line
 * (0.875rem × line-height 1.45) over a `text-role-caption` subtitle line (0.75rem × 1.35), both
 * scaled by the density the role tokens scale by (`--cf-density`), no gap. Square.
 */
export const RECORD_MOBILE_PHOTO_SIZE_CLASS = 'size-[calc(var(--cf-density,1)_*_(0.875rem_*_1.45_+_0.75rem_*_1.35))]';
