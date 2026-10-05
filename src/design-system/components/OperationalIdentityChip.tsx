'use client';

/**
 * The ONE painter of an {@link OperationalIdentity} — the Compact row
 * (`TriageRow`) and the Full card (`RecordCard`'s identity slot) both mount it,
 * so the face is the identity's `display`, the copy is its complete `value`
 * and the button's name is its `ariaLabel`, in every density.
 *
 * Face: 14px semibold monospace (the house id chip). `presentation` changes
 * only the chrome around it: `compact` keeps the `#` glyph (a row's platform
 * column is the first thing it gives up when narrow, so the glyph's
 * marketplace tint is the channel cue); `full` is plain (the card's line 1
 * carries the channel itself).
 */

import { CopyChip } from '@/components/ui/CopyChip';
import { identityChipText } from '@/design-system/tokens/typography/presets';
import { isCopyableIdentity, type OperationalIdentity } from '@/lib/operational-identity';
import { cn } from '@/utils/_cn';

export function OperationalIdentityChip({
  identity,
  presentation,
  disableTooltip = false,
}: {
  identity: OperationalIdentity;
  presentation: 'compact' | 'full';
  /** The host already flies out its own hover surface (the order card's admin-link menu). */
  disableTooltip?: boolean;
}) {
  if (!isCopyableIdentity(identity)) {
    return (
      <span className={cn(identityChipText, 'truncate text-text-default')} title={identity.ariaLabel} aria-label={identity.ariaLabel}>
        {identity.display}
      </span>
    );
  }
  const compact = presentation === 'compact';
  return (
    <CopyChip
      value={identity.value}
      display={identity.display}
      ariaLabel={`Copy ${identity.ariaLabel}`}
      tone="id"
      icon={compact ? undefined : null}
      dense={!compact}
      // The whole compact face, never clipped: `truncate` on the tight-tracked mono face shaved the last glyph.
      truncateDisplay={false}
      fitDisplayWidth
      disableTooltip={disableTooltip}
    />
  );
}
