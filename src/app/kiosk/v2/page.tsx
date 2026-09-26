/** /kiosk/v2 — landscape shell QA path (gated off main `/kiosk`). */

// Aliased: this file also exports the route segment config `dynamic`.
import nextDynamic from 'next/dynamic';
import { KioskCatalogFirstPaint } from '../KioskCatalogFirstPaint';
import { KioskRealtimeProvider } from '@/components/kiosk/KioskRealtimeProvider';
import { seedKioskCatalogForRequest } from '@/lib/kiosk/seed-catalog.server';
import { resolveCounterBoot } from '@/lib/kiosk/counter-boot.server';

const KioskV2Runtime = nextDynamic(
  () => import('./KioskV2Runtime').then((m) => m.KioskV2Runtime),
  { loading: () => <KioskCatalogFirstPaint /> },
);

/** The seed reads the device cookie, so this route is per-request by nature. */
export const dynamic = 'force-dynamic';

export default async function KioskV2Page() {
  // One request, both facts: the catalog seed for PAINT and the org's counter
  // setup (opening command, comp / void reasons) for STATE. Neither can throw
  // a counter tablet offline.
  const [seed, boot] = await Promise.all([
    seedKioskCatalogForRequest('service'),
    resolveCounterBoot(),
  ]);
  // The provider wraps the runtime so the shared-session mirror is attached
  // before the shell paints — a tablet a desk already holds should come back
  // from a reload showing that desk's cart, not an empty one it then replaces.
  return (
    <KioskRealtimeProvider>
      <KioskV2Runtime
        seed={seed}
        defaultCommand={boot.defaultCommand}
        lineReasons={boot.lineReasons}
        brandColor={boot.brandColor}
      />
    </KioskRealtimeProvider>
  );
}
