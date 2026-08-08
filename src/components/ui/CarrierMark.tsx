/**
 * Carrier brand mark — MapPin tinted with native brand hex from
 * {@link carrier-brand.ts}. Unknown / unresolved falls back to the house blue
 * MapPin via CHIP_TONES.tracking (caller omits this and uses the tone default).
 *
 * Not PlatformMark — marketplace channels are a separate SoT.
 *
 * Footprint:
 *   - `mark` (default) — h-5 square, matches {@link PlatformMark}
 *   - `chip` — h-4 square, matches CopyChip / IdentityLinkChip leading icons
 *     so tracking never reads taller/paddier than order `#`
 */

import { MapPin } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import {
  hasCarrierBrandPaint,
  type CarrierBrandMeta,
} from '@/lib/carrier-brand';

/** Square footprint — matches {@link PlatformMark}. */
const MARK_BOX = 'inline-flex h-5 w-5 shrink-0 items-center justify-center';

/** Inner MapPin — mark box uses h-4; chip uses same glyph (CopyChip slot sizes it). */
const MARK_INNER = 'h-4 w-4 shrink-0';
const CHIP_INNER = 'h-4 w-4 shrink-0';

export function CarrierMark({
  meta,
  className,
  footprint = 'mark',
}: {
  meta: CarrierBrandMeta;
  className?: string;
  /** `chip` keeps TrackingChip / IdentityLinkChip faces flush with order `#`. */
  footprint?: 'mark' | 'chip';
}) {
  // Chip footprint: MapPin only (no nested h-4 box) — CopyChip already owns
  // the fixed icon slot. A second CHIP_BOX was shifting the pin off the
  // hash / pencil / barcode baseline.
  if (footprint === 'chip') {
    if (!hasCarrierBrandPaint(meta) || !meta.brandHex) {
      return <MapPin className={cn(CHIP_INNER, className)} />;
    }
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', className)}
        // Brand hex from carrier-brand SoT (ds-allow-hex there — never inline hex here).
        style={{ color: meta.brandHex }}
        aria-hidden
      >
        <MapPin className={CHIP_INNER} />
      </span>
    );
  }
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
