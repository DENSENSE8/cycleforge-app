/**
 * Canonical unit-status → Tailwind color classes.
 *
 * This is the single source of truth for how a unit/serial lifecycle status
 * (RECEIVED, TESTED, STOCKED, SHIPPED, …) is colored across the app. It was
 * first centralized for the inventory views; the labels views (unit history,
 * recently-printed) now align to it too so the same status reads the same
 * color everywhere.
 */

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
    PACKED: 'bg-purple-50 text-purple-700',
    LABELED: 'bg-purple-50 text-purple-700',
    STAGED: 'bg-purple-50 text-purple-700',
    SHIPPED: 'bg-surface-sunken text-text-muted',
    RETURNED: 'bg-orange-50 text-orange-700',
    RMA: 'bg-orange-50 text-orange-700',
    ON_HOLD: 'bg-red-50 text-red-700',
    SCRAPPED: 'bg-red-100 text-red-700',
};

const BADGE_FALLBACK = 'bg-surface-sunken text-text-muted';

/** Plain badge classes (bg + text). Unknown/empty → neutral gray. */
export function unitStatusBadgeClass(status: string | null | undefined): string {
    if (!status) return BADGE_FALLBACK;
    return STATUS_BADGES[status] ?? BADGE_FALLBACK;
}
