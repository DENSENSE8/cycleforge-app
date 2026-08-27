import type { ComponentType } from 'react';
import {
  INCOMING_ALL_ISSUED_TILE,
  INCOMING_DELIVERY_STATE_FACE,
  INCOMING_HUNT_TILE_ICON,
  INCOMING_HUNT_TILE_ORDER,
} from '@/lib/receiving/incoming-delivery-state-face';
import type { IncomingDeliveryState, IncomingSummary } from './incoming-summary-types';
import { focusRing } from '@/design-system/tokens/focus-ring';


export interface TileSpec {
  state: IncomingDeliveryState | null; // null = "All"
  label: string;
  key: keyof IncomingSummary;
  tone: 'rose' | 'amber' | 'blue' | 'gray' | 'slate' | 'orange' | 'violet' | 'red';
  icon: ComponentType<{ className?: string }>;
  /** Tooltip / `aria-description` — the *why* this bucket exists. */
  title: string;
}

/**
 * Incoming dock hunt tiles. Email delivery is a STN writer, not a parallel tile.
 *
 * Labels / long titles / icons come from {@link INCOMING_DELIVERY_STATE_FACE}
 * (shared with the grid Status glyph) so the strip and the row cannot drift.
 *
 * TWO rose delivered-attention tiles, and the pair is the point:
 *   - `DELIVERED_UNOPENED`    — delivered, never scanned. We don't know where it is.
 *   - `DELIVERED_NOT_UNBOXED` — delivered (possibly scanned in), never opened.
 */
export const TILES: TileSpec[] = [
  {
    state: INCOMING_ALL_ISSUED_TILE.state,
    label: INCOMING_ALL_ISSUED_TILE.label,
    key: INCOMING_ALL_ISSUED_TILE.key,
    tone: INCOMING_ALL_ISSUED_TILE.tone,
    icon: INCOMING_ALL_ISSUED_TILE.icon,
    title: INCOMING_ALL_ISSUED_TILE.title,
  },
  ...INCOMING_HUNT_TILE_ORDER.map((state): TileSpec => {
    const face = INCOMING_DELIVERY_STATE_FACE[state];
    return {
      state,
      label: face.tileLabel,
      key: face.summaryKey,
      tone: face.tileTone,
      icon: INCOMING_HUNT_TILE_ICON[state] ?? face.Icon,
      title: face.tileTitle,
    };
  }),
];

/** Per-tone tokens for status rows + matching active-filter pills. */
export const TONE: Record<
  TileSpec['tone'],
  { active: string; inactive: string; ring: string; iconActive: string; iconInactive: string; pill: string }
> = {
  rose: { active: 'bg-rose-600 text-white ring-rose-600', inactive: 'bg-surface-card text-rose-700 ring-rose-200 hover:bg-rose-50', ring: focusRing('field', 'danger'), iconActive: 'text-white', iconInactive: 'text-rose-500', pill: 'bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100' },
  amber: { active: 'bg-amber-600 text-white ring-amber-600', inactive: 'bg-surface-card text-amber-800 ring-amber-200 hover:bg-amber-50', ring: focusRing('field', 'warning'), iconActive: 'text-white', iconInactive: 'text-amber-500', pill: 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100' },
  orange: { active: 'bg-orange-600 text-white ring-orange-600', inactive: 'bg-surface-card text-orange-800 ring-orange-200 hover:bg-orange-50', ring: focusRing('field', 'warning'), iconActive: 'text-white', iconInactive: 'text-orange-500', pill: 'bg-orange-50 text-orange-800 ring-orange-200 hover:bg-orange-100' },
  blue: { active: 'bg-blue-600 text-white ring-blue-600', inactive: 'bg-surface-card text-blue-700 ring-blue-200 hover:bg-blue-50', ring: focusRing('field', 'accent'), iconActive: 'text-white', iconInactive: 'text-blue-500', pill: 'bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100' },
  // ds-allow-raw-neutral: identity/tone hue — gray tone must stay distinct from slate (= surface-inverse), not chrome
  gray: { active: 'bg-gray-700 text-white ring-gray-700', inactive: 'bg-surface-card text-text-muted ring-border-soft hover:bg-surface-hover', ring: focusRing('field', 'neutral'), iconActive: 'text-white', iconInactive: 'text-text-soft', pill: 'bg-surface-canvas text-text-muted ring-border-soft hover:bg-surface-sunken' },
  slate: { active: 'bg-surface-inverse text-white ring-surface-inverse', inactive: 'bg-surface-card text-text-muted ring-border-soft hover:bg-surface-hover', ring: focusRing('field', 'neutral'), iconActive: 'text-white', iconInactive: 'text-text-soft', pill: 'bg-surface-canvas text-text-muted ring-border-soft hover:bg-surface-sunken' },
  violet: { active: 'bg-violet-600 text-white ring-violet-600', inactive: 'bg-surface-card text-violet-700 ring-violet-200 hover:bg-violet-50', ring: 'focus:ring-violet-500/40' /* ds-allow-focus: identity/one-off hue or ring-0 */, iconActive: 'text-white', iconInactive: 'text-violet-500', pill: 'bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100' },
  red: { active: 'bg-red-600 text-white ring-red-600', inactive: 'bg-surface-card text-red-700 ring-red-200 hover:bg-red-50', ring: focusRing('field', 'danger'), iconActive: 'text-white', iconInactive: 'text-red-500', pill: 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100' },
};
