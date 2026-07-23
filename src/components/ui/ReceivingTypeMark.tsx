/**
 * Fixed-width receiving-type mark — classify faces use this instead of the
 * variable-width type name so Urgency / Platform / Type stay equal width.
 * Icon + tone resolve from {@link receivingTypeMeta}; label lives in tooltip /
 * aria — the mark itself is always `aria-hidden`.
 */

import {
  ArrowLeftRight,
  MapPin,
  Package,
  RotateCcw,
  Tag,
  Wrench,
} from '@/components/Icons';
import { cn } from '@/utils/_cn';
import {
  receivingTypeMeta,
  type ReceivingTypeIconKey,
  type ReceivingTypeMeta,
} from '@/lib/receiving/receiving-type-meta';

const MARK_BOX =
  'inline-flex h-5 w-5 shrink-0 items-center justify-center leading-none';
const MARK_INNER = 'h-3.5 w-3.5 shrink-0';

const ICON: Record<ReceivingTypeIconKey, typeof Package> = {
  package: Package,
  'rotate-ccw': RotateCcw,
  wrench: Wrench,
  'arrow-left-right': ArrowLeftRight,
  'map-pin': MapPin,
  tag: Tag,
};

function markTone(meta: ReceivingTypeMeta, textClassName?: string): string {
  return textClassName ?? meta.text;
}

export function ReceivingTypeMark({
  typeValue,
  className,
  textClassName,
  empty = false,
}: {
  /** Stored receiving_type / intake_type (or empty for unset). */
  typeValue?: string | null;
  className?: string;
  /** Override tone — unset / faint faces pass text-text-faint. */
  textClassName?: string;
  empty?: boolean;
}) {
  const meta = receivingTypeMeta(typeValue);
  if (empty || !meta.value) {
    return (
      <span className={cn(MARK_BOX, 'text-text-faint', className)} aria-hidden>
        <span className="text-role-micro font-black">—</span>
      </span>
    );
  }
  const Glyph = ICON[meta.icon] ?? Tag;
  return (
    <span className={cn(MARK_BOX, markTone(meta, textClassName), className)} aria-hidden>
      <Glyph className={MARK_INNER} />
    </span>
  );
}
