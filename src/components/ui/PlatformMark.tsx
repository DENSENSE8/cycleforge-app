/** Fixed-width platform identity — a colored {@link BrandIdentityDot}-shaped fill, never EB / AM / az lettermarks and never a brand tile. */

import { cn } from '@/utils/_cn';
import {
  platformMetaBrandDot,
  sourcePlatformMeta,
  type SourcePlatformMeta,
} from '@/lib/source-platform';

/** Shared footprint — callers sized around the old 20px glyph box. */
const MARK_BOX = 'inline-flex h-5 w-5 shrink-0 items-center justify-center';

export function PlatformMark({
  platformValue,
  meta: metaOverride,
  className,
  textClassName: _textClassName,
  borderClassName: _borderClassName,
  empty = false,
  preferBrandTile: _preferBrandTile = false,
}: {
  /** Stored `source_platform` value (or empty for unknown / unbound). */
  platformValue?: string | null;
  /**
   * Catalog-aware meta (from {@link usePlatformMeta}). When omitted, falls
   * back to the built-in {@link sourcePlatformMeta} registry.
   */
  meta?: SourcePlatformMeta;
  className?: string;
  /** Kept for call-site stability. Ink now comes from {@link platformMetaBrandDot}. */
  textClassName?: string;
  borderClassName?: string;
  /** Unbound listing placeholder (no platform yet). */
  empty?: boolean;
  /** Kept for call-site stability. Tiles are gone; identity is a colored dot. */
  preferBrandTile?: boolean;
}) {
  const meta = metaOverride ?? sourcePlatformMeta(platformValue);
  const brandDot =
    empty || !meta.value
      ? { className: 'bg-border-emphasis' as const, style: undefined }
      : platformMetaBrandDot(meta);

  return (
    <span className={cn(MARK_BOX, className)} aria-hidden>
      <span
        className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', brandDot.className)}
        style={brandDot.style}
      />
    </span>
  );
}
