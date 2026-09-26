/** search-result-chips — shared presentation config for the one search-result renderer (SearchResultRow). */

import { AlertTriangle, Tool, Package, PackageOpen, Box, PackageCheck, Boxes, Search } from '@/components/Icons';
import { LIFECYCLE, STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';

type IconComponent = (props: { className?: string }) => JSX.Element;

/**
 * UI entity type → leading glyph (generic + comfortable rows).
 * order = closed package; receiving = open package (unbox). Both paint blue
 * on the comfortable /search feed (see ENTITY_TONE).
 */
export const ENTITY_ICONS: Record<string, IconComponent> = {
  order: Package,
  repair: Tool,
  fba: Boxes,
  receiving: PackageOpen,
  sku: Box,
  unit: PackageCheck,
  exception: AlertTriangle,
  import_exception: AlertTriangle,
};

/** Semantic chip tone vocabulary — matches SearchHitChip.tone (+ `purple`, the fulfillment tone). */
export type ChipTone = 'gray' | 'blue' | 'emerald' | 'amber' | 'rose' | 'purple';

/**
 * UI entity type → chip / glyph tone. Order + receiving share blue so the
 * package closed/open pair reads as one family on the /search feed.
 */
export const ENTITY_TONE: Record<string, ChipTone> = {
  order: 'blue',
  unit: 'emerald',
  receiving: 'blue',
  sku: 'gray',
  repair: 'rose',
  fba: 'blue',
  exception: 'amber',
  import_exception: 'amber',
};

/** House 3-layer chip tones (bg-x-50 / text-x-700 / ring-x-200). */
export const CHIP_TONE_CLASSES: Record<string, string> = {
  gray: 'bg-surface-canvas text-text-muted ring-border-soft',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  purple: `${STATE_TONE_CLASSES.fulfillment.pill} ${STATE_TONE_CLASSES.fulfillment.ring}`,
};

/** Entity-glyph ink per tone. */
export const GLYPH_TONE_CLASSES: Record<ChipTone, string> = {
  gray: 'text-text-soft',
  blue: 'text-blue-600',
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
  rose: 'text-rose-600',
  purple: STATE_TONE_CLASSES.fulfillment.text,
};

/** The glyph + ink for an entity type, in one lookup. */
export function entityGlyph(entityType: string | null | undefined): {
  Icon: IconComponent;
  tone: ChipTone;
  className: string;
} {
  const key = String(entityType ?? '');
  const tone = ENTITY_TONE[key] ?? 'gray';
  return { Icon: ENTITY_ICONS[key] ?? Search, tone, className: GLYPH_TONE_CLASSES[tone] };
}

/** Status-dot bg class per tone (glanceable colour, paired with a tooltip). */
const DOT_BY_TONE: Record<ChipTone, string> = {
  gray: 'bg-border-emphasis',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  purple: STATE_TONE_CLASSES.fulfillment.dot,
};

/** Functional state tone → this vocabulary's chip tone (lifecycle states resolve here). */
const CHIP_TONE_FOR_STATE: Record<StateName, ChipTone> = {
  info: 'blue',
  warning: 'amber',
  fulfillment: 'purple',
  danger: 'rose',
  success: 'emerald',
};

/** Raw `orders.status` → tone. */
const ORDER_STATUS_TONE: Record<string, ChipTone> = {
  delivered: 'emerald',
  completed: 'emerald',
  closed: 'emerald',
  shipped: CHIP_TONE_FOR_STATE[LIFECYCLE.shipped.tone],
  packed: CHIP_TONE_FOR_STATE[LIFECYCLE.packed.tone],
  processing: 'blue',
  open: 'amber',
  pending: 'amber',
  awaiting: 'amber',
  unpaid: 'amber',
  listed: 'gray',
  paid: 'gray',
  returned: 'rose',
  cancelled: 'rose',
  canceled: 'rose',
  refunded: 'rose',
};

interface OrderStatusTone {
  tone: ChipTone;
  /** Tailwind bg-* class for the status dot. */
  dot: string;
  /** Title-cased label for the dot's HoverTooltip / status chip. */
  label: string;
}

/** ORDER-status → dot/chip tone SoT (see file header). */
export function orderStatusTone(status: string | null | undefined): OrderStatusTone {
  const raw = String(status ?? '').trim();
  const key = raw.toLowerCase();
  const tone = ORDER_STATUS_TONE[key] ?? 'gray';
  const label = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'No status';
  return { tone, dot: DOT_BY_TONE[tone], label };
}
