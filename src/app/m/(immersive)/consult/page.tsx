/**
 * Mobile SoT for walk-in consult intake — same cart as /kiosk/v2.
 *
 * Callers: MobileSidebarDrawer Consult leaf.
 * Affected API: none (hosts KioskV2Runtime).
 * Data schemas: none.
 * User: "mobile first design" and "pick a repair service or pick a sales order and add that to cart"
 */

import dynamic from 'next/dynamic';
import { KioskCatalogFirstPaint } from '@/app/kiosk/KioskCatalogFirstPaint';
import { KioskRealtimeProvider } from '@/components/kiosk/KioskRealtimeProvider';

const KioskV2Runtime = dynamic(
  () => import('@/app/kiosk/v2/KioskV2Runtime').then((m) => m.KioskV2Runtime),
  { loading: () => <KioskCatalogFirstPaint /> },
);

export default function MobileConsultPage() {
  return (
    <KioskRealtimeProvider>
      <KioskV2Runtime />
    </KioskRealtimeProvider>
  );
}
