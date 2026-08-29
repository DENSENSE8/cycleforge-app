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
 *
 * **Icon-only since 2026-08-29** (operator ruling). The word "CHECK" in
 * condensed uppercase next to "UNBOX" in condensed uppercase next to "ADD" read
 * as a shouted row of three, and the label added nothing the glyph and its
 * tooltip do not carry — a clipboard is not ambiguous at a receiving bench. The
 * accessible name is unchanged, so nothing about how this is reached by keyboard
 * or screen reader moved.
 */

import { ClipboardList } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/** Flush workbench-chrome CTA face (soft pill + condensed uppercase). */
const CHROME_CTA_FACE = cn(
  WORKBENCH_CHROME_PILL_CLASS,
  // Fills the PRIMARY chrome row — never taller than the band it sits in.
  // Square: an icon-only cube, sized off the row rather than off its own text.
  'h-full aspect-square',
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
      className={cn(CHROME_CTA_FACE, 'ring-0', className)}
      data-testid={testId}
    />
  );
}
