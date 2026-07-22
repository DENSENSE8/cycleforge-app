/**
 * Fixed-width platform mark — listing chrome uses this instead of the
 * variable-width platform name so PO# / tracking chips stay aligned across
 * marketplaces. Renders the vendored monochrome brand icon when the platform
 * has one (`SourcePlatformMeta.icon`, CC0 Simple Icons paths), else the 1–2
 * char lettermark. Label lives in tooltip / aria; meta comes from
 * {@link sourcePlatformMeta}.
 */

import { cn } from '@/utils/_cn';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { PLATFORM_BRAND_ICON_VIEWBOX } from '@/lib/platform-brand-icons';

const MARK_BOX =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-role-micro font-black uppercase leading-none tracking-tight';

export function PlatformMark({
  platformValue,
  className,
  textClassName,
  borderClassName,
  empty = false,
}: {
  /** Stored `source_platform` value (or empty for unknown / unbound). */
  platformValue?: string | null;
  className?: string;
  /** Override tone — when the listing has no openable target, pass faint tones. */
  textClassName?: string;
  borderClassName?: string;
  /** Unbound listing placeholder (no platform yet). */
  empty?: boolean;
}) {
  const meta = sourcePlatformMeta(platformValue);
  if (empty || !meta.value) {
    return (
      <span className={cn(MARK_BOX, 'text-text-faint', className)} aria-hidden>
        <span className="border-b-2 border-border-default pb-px">—</span>
      </span>
    );
  }
  if (meta.icon) {
    return (
      <span className={cn(MARK_BOX, textClassName ?? meta.text, className)} aria-hidden>
        <svg viewBox={PLATFORM_BRAND_ICON_VIEWBOX} fill="currentColor" className="h-4 w-4 shrink-0">
          <path d={meta.icon} />
        </svg>
      </span>
    );
  }
  return (
    <span className={cn(MARK_BOX, textClassName ?? meta.text, className)} aria-hidden>
      <span className={cn('border-b-2 pb-px', borderClassName ?? meta.border)}>
        {meta.mark}
      </span>
    </span>
  );
}
