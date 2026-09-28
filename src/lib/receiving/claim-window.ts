/** Claim-window presentation kind — the eBay item-not-received deadline as a displayable fact (Phase 5 of… */

/**
 * How many days before the deadline counts as DUE — the point at which the cron
 * escalates and the chip turns warning-colored. One number, two consumers.
 */
export const CLAIM_DUE_LEAD_DAYS = 5;

/** Whole days from `todayKey` to `claimByDate`, both civil dates (`YYYY-MM-DD`). */
export function daysUntilClaimDeadline(claimByDate: string, todayKey: string): number {
  const toUtcMs = (key: string): number => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((toUtcMs(claimByDate) - toUtcMs(todayKey)) / 86_400_000);
}

type ClaimUrgency = 'expired' | 'due' | 'upcoming';

interface ClaimCountdownFace {
  urgency: ClaimUrgency;
  daysRemaining: number;
  /** Compact cell text — `EXPIRED` / `3d`. Never a sentence; this sits in a grid row. */
  label: string;
  /** One-line hover tip for the Status track — action-oriented, not a paragraph. */
  tip: string;
  /**
   * Longer explanation for inspector / right-rail detail (not the grid hover).
   * Grid cells use {@link tip}.
   */
  description: string;
  /** Text-color class only — no background or ring. */
  tone: string;
}

/**
 * Resolve the claim deadline for display. Pass the WAREHOUSE civil day
 * (`getCurrentPSTDateKey()`), not a host-local date.
 */
export function claimCountdownFace(claimByDate: string, todayKey: string): ClaimCountdownFace {
  const daysRemaining = daysUntilClaimDeadline(claimByDate, todayKey);

  if (daysRemaining < 0) {
    const ago = Math.abs(daysRemaining);
    return {
      urgency: 'expired',
      daysRemaining,
      label: 'Expired',
      tip: 'eBay claim expired · write off',
      description: `eBay claim window closed ${ago} day${ago === 1 ? '' : 's'} ago (${claimByDate}) — this purchase can no longer be claimed. Write the carton off with a loss reason so it leaves the queue with a record.`,
      tone: 'text-rose-700',
    };
  }

  if (daysRemaining <= CLAIM_DUE_LEAD_DAYS) {
    return {
      urgency: 'due',
      daysRemaining,
      label: `${daysRemaining}d`,
      tip:
        daysRemaining === 0
          ? 'eBay claim due today — file now'
          : `Claim due in ${daysRemaining}d`,
      description:
        daysRemaining === 0
          ? `eBay claim window closes TODAY (${claimByDate}) — file the item-not-received claim now or the money is gone.`
          : `eBay claim window closes in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (${claimByDate}) — find and unbox this carton, or file the item-not-received claim.`,
      tone: 'text-rose-700',
    };
  }

  return {
    urgency: 'upcoming',
    daysRemaining,
    label: `${daysRemaining}d`,
    tip: `Claim closes in ${daysRemaining}d`,
    description: `eBay claim window closes ${claimByDate} (${daysRemaining} days) — the deadline to report this purchase as never received.`,
    tone: 'text-text-soft',
  };
}
