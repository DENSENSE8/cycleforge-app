/**
 * Fixed-width platform mark — listing chrome uses this instead of the
 * variable-width platform name so PO# / tracking chips stay aligned across
 * marketplaces. Mark resolution (all from {@link sourcePlatformMeta}):
 *   1. monochrome brand icon (`SourcePlatformMeta.icon`), tinted by platform tone;
 *   2. 1–2 char lettermark.
 * Label lives in tooltip / aria — the mark itself is always `aria-hidden`.
 *
 * Bare channel-mark discipline: no sunken/rounded app-tile wrapper. Every layer
 * centers in the same transparent footprint so icon / lettermark share optical
 * weight without washing out brand color.
 */

import { cn } from '@/utils/_cn';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { PLATFORM_BRAND_ICON_VIEWBOX } from '@/lib/platform-brand-icons';

/** Shared transparent footprint — icon / lettermark all center here. */
const MARK_BOX =
  'inline-flex h-5 w-5 shrink-0 items-center justify-center text-role-micro uppercase leading-none tracking-tight';

/** Inner mark footprint — ~16px so bare icons stay scannable without tile pad. */
const MARK_INNER = 'h-4 w-4 shrink-0';

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
        <svg viewBox={PLATFORM_BRAND_ICON_VIEWBOX} fill="currentColor" className={MARK_INNER} aria-hidden>
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
