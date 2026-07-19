/**
 * Fixed-width platform lettermark — listing chrome uses this instead of the
 * variable-width platform name so PO# / tracking chips stay aligned across
 * marketplaces. Label lives in tooltip / aria; mark comes from
 * {@link sourcePlatformMeta}.
 */

import { cn } from '@/utils/_cn';
import { sourcePlatformMeta } from '@/lib/source-platform';

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
  return (
    <span className={cn(MARK_BOX, textClassName ?? meta.text, className)} aria-hidden>
      <span className={cn('border-b-2 pb-px', borderClassName ?? meta.border)}>
        {meta.mark}
      </span>
    </span>
  );
}
