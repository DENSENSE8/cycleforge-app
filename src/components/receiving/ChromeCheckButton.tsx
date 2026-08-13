'use client';

/**
 * ChromeCheckButton — the ONE Band-1 "Check received" CTA face.
 *
 * Unifies the two forked Check buttons that did the same job (open the
 * check-received rail) with drifted faces:
 *   - Unbox / Arrival (`ReceivingBoxChromeActions`) → golden `variant="secondary"`
 *   - Inbound (`IncomingChromeActions`)             → hand-painted graphite fill
 * Both surfaces now compose this; the per-surface fill override is retired.
 *
 * Only the Check *face* is shared. The clusters stay regionally distinct
 * (Inbound keeps its Import popover; box stations keep resume) — that split is
 * deliberate (`regional-sidebar-split.guard`). Guard for the shared face:
 * `receiving-box-chrome-actions.guard.test.ts`.
 */

import { ClipboardList } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { cn } from '@/utils/_cn';

/** Flush workbench-chrome CTA face (soft pill + condensed uppercase). */
const CHROME_CTA_FACE = cn(
  WORKBENCH_CHROME_PILL_CLASS,
  'font-semibold uppercase tracking-widest',
);

export function ChromeCheckButton({
  onClick,
  ariaLabel = 'Check unreceived orders',
  testId,
  className,
}: {
  onClick: () => void;
  /** Per-surface accessible wording (e.g. "Check Zoho received by tracking"). */
  ariaLabel?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <Button
      size="sm"
      variant="execute"
      icon={<ClipboardList />}
      ariaLabel={ariaLabel}
      onClick={onClick}
      className={cn(CHROME_CTA_FACE, className)}
      data-testid={testId}
    >
      Check
    </Button>
  );
}
