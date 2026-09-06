/**
 * /m/pack — the pack bench station.
 * Body: `MobilePackStation` (see its docblock). Formerly the recent-packs
 * feed (`Pack.tsx`), retired with this port; pack history stays on the desk.
 */

import MobilePackStation from '@/components/mobile/packer/MobilePackStation';

export default function MobilePackPage() {
  return <MobilePackStation />;
}
