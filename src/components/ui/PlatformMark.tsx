/**
 * Fixed-width platform mark — compact tone dot for grids and filter leading
 * slots. Full platform names use {@link PlatformIdentityLabel} (black text +
 * dot). Label lives in tooltip / aria — the mark itself is always `aria-hidden`.
 */

import { PlatformDotMark } from '@/components/ui/IdentityLabelRow';
import type { SourcePlatformMeta } from '@/lib/source-platform';

export function PlatformMark({
  platformValue,
  meta,
  className,
  textClassName: _textClassName,
  borderClassName: _borderClassName,
  empty = false,
}: {
  platformValue?: string | null;
  meta?: SourcePlatformMeta;
  className?: string;
  /** @deprecated Dot color resolves from meta; text tone props are ignored. */
  textClassName?: string;
  /** @deprecated Dot color resolves from meta; border tone props are ignored. */
  borderClassName?: string;
  empty?: boolean;
}) {
  return (
    <PlatformDotMark
      platformValue={platformValue}
      meta={meta}
      empty={empty}
      className={className}
    />
  );
}
