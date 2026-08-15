/**
 * Single source of truth for receiving-type → label / short / tone / icon key.
 *
 * Mirrors `src/lib/source-platform.ts`: every surface that shows a receiving
 * type (classify faces, pills, labels) resolves through here so PO / Return /
 * Repair / Trade In / Pick Up never present two ways. Org catalog labels still
 * win at the picker layer; tones + icon keys stay built-in (custom slugs fall
 * back to a neutral tag face).
 *
 * Pure — no React. Glyphs resolve in {@link ReceivingTypeMark}.
 */

type ReceivingTypeIconKey =
  | 'package'
  | 'rotate-ccw'
  | 'wrench'
  | 'arrow-left-right'
  | 'map-pin'
  | 'tag';

interface ReceivingTypeMeta {
  /** Stored `receiving_type` / `intake_type` value (uppercase). */
  value: string;
  /** Canonical display label. */
  label: string;
  /** Compact label for dense chrome (≤5 chars preferred). */
  short: string;
  /** Lucide key resolved by ReceivingTypeMark. */
  icon: ReceivingTypeIconKey;
  /** Tailwind text tone for the mark glyph. */
  text: string;
  /** Tailwind border tone for underline / idle ring accents. */
  border: string;
  /** Tailwind fill for identity dots — same ladder as {@link platformMetaBrandDot}. */
  dot: string;
  /**
   * Quiet flat tint when this type is the active selection — same face
   * language as Claim/Photos (`border-*-200 bg-*-50 text-*-700 shadow-none`).
   */
  activeClass: string;
  /** Idle face tone in an expanded option set. */
  inactiveClass: string;
}

/**
 * Canonical type registry, display order. Add a type once here; pickers,
 * seeds, and printed labels derive from this list (via RECEIVING_TYPE_OPTS).
 */
export const RECEIVING_TYPES: readonly ReceivingTypeMeta[] = [
  {
    value: 'PO',
    label: 'Purchase order',
    short: 'PO',
    icon: 'package',
    text: 'text-blue-600',
    border: 'border-blue-600',
    dot: 'bg-blue-600',
    activeClass: 'border-blue-200 bg-blue-50 text-blue-700 shadow-none',
    inactiveClass:
      'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100',
  },
  {
    value: 'RETURN',
    label: 'Return',
    short: 'Ret',
    icon: 'rotate-ccw',
    text: 'text-rose-600',
    border: 'border-rose-500',
    dot: 'bg-rose-500',
    activeClass: 'border-rose-200 bg-rose-50 text-rose-700 shadow-none',
    inactiveClass:
      'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100',
  },
  {
    // Orange — matches functional.repair (DESIGN_SYSTEM.md functional hue
    // table) and TicketChip. Was violet until 2026-08-07: two registries
    // named a color for "repair" and disagreed; orange is the one already
    // load-bearing on the ticket/support side, so violet lost. Violet is
    // free again elsewhere in the color system as of this change.
    value: 'REPAIR',
    label: 'Repair',
    short: 'Rep',
    icon: 'wrench',
    text: 'text-orange-600',
    border: 'border-orange-500',
    dot: 'bg-orange-600',
    activeClass: 'border-orange-200 bg-orange-50 text-orange-700 shadow-none',
    inactiveClass:
      'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300 hover:bg-orange-100',
  },
  {
    value: 'TRADE_IN',
    label: 'Trade In',
    short: 'Trade',
    icon: 'arrow-left-right',
    text: 'text-amber-700',
    border: 'border-amber-500',
    dot: 'bg-amber-700',
    activeClass: 'border-amber-200 bg-amber-50 text-amber-800 shadow-none',
    inactiveClass:
      'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100',
  },
  {
    value: 'PICKUP',
    label: 'Pick Up',
    short: 'Pickup',
    icon: 'map-pin',
    text: 'text-emerald-600',
    border: 'border-emerald-500',
    dot: 'bg-emerald-600',
    activeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none',
    inactiveClass:
      'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
  },
];

/** Fallback for empty / unknown type codes. */
const UNKNOWN_RECEIVING_TYPE: ReceivingTypeMeta = {
  value: '',
  label: 'Unknown',
  short: '—',
  icon: 'tag',
  text: 'text-text-faint',
  border: 'border-border-default',
  dot: 'bg-border-emphasis',
  activeClass: 'border-border-default bg-surface-card text-text-muted',
  inactiveClass:
    'border-border-soft bg-surface-card/70 text-text-soft hover:border-border-default hover:bg-surface-hover',
};

const BY_VALUE = new Map(RECEIVING_TYPES.map((t) => [t.value, t]));

/** Resolve a receiving-type / intake_type code to its canonical meta. */
export function receivingTypeMeta(value: string | null | undefined): ReceivingTypeMeta {
  const key = String(value ?? '').trim().toUpperCase();
  if (!key) return UNKNOWN_RECEIVING_TYPE;
  return BY_VALUE.get(key) ?? {
    ...UNKNOWN_RECEIVING_TYPE,
    value: key,
    label: key.replace(/_/g, ' '),
    short: key.slice(0, 5),
  };
}

/** Identity micro-dot fill — same ladder as {@link platformMetaBrandDot}. */
export function receivingTypeBrandDot(meta: ReceivingTypeMeta): {
  className?: string;
  style?: { backgroundColor: string };
} {
  const dot = meta.dot?.trim();
  if (dot) return { className: dot };
  return { className: UNKNOWN_RECEIVING_TYPE.dot };
}
