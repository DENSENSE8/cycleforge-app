/**
 * Carrier brand mark — MapPin tinted with native brand hex from
 * {@link carrier-brand.ts}. Unknown / unresolved falls back to the house blue
 * MapPin via CHIP_TONES.tracking (caller omits this and uses the tone default).
 *
 * Not PlatformMark — marketplace channels are a separate SoT.
 */

import { MapPin } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import {
  hasCarrierBrandPaint,
  type CarrierBrandMeta,
} from '@/lib/carrier-brand';

/** Square footprint — matches {@link PlatformMark}. */
const MARK_BOX = 'inline-flex h-5 w-5 shrink-0 items-center justify-center';

/** Inner MapPin footprint — ~16px. */
const MARK_INNER = 'h-4 w-4 shrink-0';

export function CarrierMark({
  meta,
  className,
}: {
  meta: CarrierBrandMeta;
  className?: string;
}) {
  if (!hasCarrierBrandPaint(meta) || !meta.brandHex) {
    return <MapPin className={cn(MARK_INNER, className)} />;
  }
  return (
    <span
      className={cn(MARK_BOX, className)}
      // Brand hex from carrier-brand SoT (ds-allow-hex there — never inline hex here).
      style={{ color: meta.brandHex }}
      aria-hidden
    >
      <MapPin className={MARK_INNER} />
    </span>
  );
}
