/**
 * Canonical unit-status → Tailwind color classes.
 *
 * This is the single source of truth for how a unit/serial lifecycle status
 * (RECEIVED, TESTED, STOCKED, SHIPPED, …) is colored across the app. It was
 * first centralized for the inventory views; the labels views (unit history,
 * recently-printed) now align to it too so the same status reads the same
 * color everywhere. PACKED / SHIPPED read LIFECYCLE (packed = fulfillment,
 * shipped = success) — never a colour picked here.
 */

import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';

const STATUS_BADGES: Record<string, string> = {
    UNKNOWN: 'bg-surface-sunken text-text-muted',
    RECEIVED: 'bg-blue-50 text-blue-700',
    TRIAGED: 'bg-blue-50 text-blue-700',
    IN_TEST: 'bg-indigo-50 text-indigo-700',
    IN_REPAIR: 'bg-amber-50 text-amber-700',
    REPAIR_DONE: 'bg-amber-50 text-amber-700',
    TESTED: 'bg-emerald-50 text-emerald-700',
    GRADED: 'bg-emerald-50 text-emerald-700',
    STOCKED: 'bg-green-50 text-green-700',
    ALLOCATED: 'bg-purple-50 text-purple-700',
    PICKED: 'bg-purple-50 text-purple-700',
    PACKED: LIFECYCLE_CLASSES.packed.pill,
    LABELED: 'bg-purple-50 text-purple-700',
    STAGED: 'bg-purple-50 text-purple-700',
    SHIPPED: LIFECYCLE_CLASSES.shipped.pill,
    RETURNED: 'bg-orange-50 text-orange-700',
    RMA: 'bg-orange-50 text-orange-700',
    ON_HOLD: 'bg-red-50 text-red-700',
    SCRAPPED: 'bg-red-100 text-red-700',
};

const BADGE_FALLBACK = 'bg-surface-sunken text-text-muted';

/**
 * Status-dot fill classes — the finer lifecycle vocabulary that leads the chip
 * INSIDE {@link GridStatusCellValue}. Solid `-500` fills matched to the pastel
 * badge family above; unknown/empty → neutral. This is the dot half of the same
 * registry, so a grid status cell resolves both the chip tone and its dot here
 * (never a local per-surface map).
 */
const STATUS_DOTS: Record<string, string> = {
    UNKNOWN: 'bg-text-faint',
    RECEIVED: 'bg-blue-500',
    TRIAGED: 'bg-blue-500',
    IN_TEST: 'bg-indigo-500',
    IN_REPAIR: 'bg-amber-500',
    REPAIR_DONE: 'bg-amber-500',
    TESTED: 'bg-emerald-500',
    GRADED: 'bg-emerald-500',
    STOCKED: 'bg-green-500',
    ALLOCATED: 'bg-purple-500',
    PICKED: 'bg-purple-500',
    PACKED: LIFECYCLE_CLASSES.packed.dot,
    LABELED: 'bg-purple-500',
    STAGED: 'bg-purple-500',
    SHIPPED: LIFECYCLE_CLASSES.shipped.dot,
    RETURNED: 'bg-orange-500',
    RMA: 'bg-orange-500',
    ON_HOLD: 'bg-red-500',
    SCRAPPED: 'bg-red-600',
};

const DOT_FALLBACK = 'bg-text-faint';

/** Plain badge classes (bg + text). Unknown/empty → neutral gray. */
export function unitStatusBadgeClass(status: string | null | undefined): string {
    if (!status) return BADGE_FALLBACK;
    return STATUS_BADGES[status] ?? BADGE_FALLBACK;
}

/** Status-dot fill class (bg only) — leads the chip inside a grid status cell. */
export function unitStatusDotClass(status: string | null | undefined): string {
    if (!status) return DOT_FALLBACK;
    return STATUS_DOTS[status] ?? DOT_FALLBACK;
}
