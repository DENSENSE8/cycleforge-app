/**
 * Fixed-width receiving-type mark — compact tone dot. Full type names use
 * {@link TypeIdentityLabel} (black text + dot).
 */

import { TypeDotMark } from '@/components/ui/IdentityLabelRow';

export function ReceivingTypeMark({
  typeValue,
  className,
  textClassName: _textClassName,
  empty = false,
}: {
  typeValue?: string | null;
  className?: string;
  /** @deprecated Dot color resolves from meta; text tone props are ignored. */
  textClassName?: string;
  empty?: boolean;
}) {
  return <TypeDotMark typeValue={typeValue} empty={empty} className={className} />;
}
