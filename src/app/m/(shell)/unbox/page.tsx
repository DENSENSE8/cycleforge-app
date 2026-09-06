/**
 * /m/unbox — the unbox bench station.
 * Body: `MobileUnboxStation` (see its docblock). Formerly `Receive.tsx`
 * (feed + top-mounted input), retired with this port.
 */

import MobileUnboxStation from '@/components/mobile/receiving/MobileUnboxStation';

export default function MobileUnboxPage() {
  return <MobileUnboxStation />;
}
