/**
 * /kiosk/v2 — landscape shell QA path (gated off main `/kiosk`).
 *
 * Pair chrome vs the catalog shell are split: this page is a thin server
 * entry; the client runtime dynamic()s AttractLoop + KioskShell.
 *
 * It also SEEDS the first catalog page. That is a performance fix with a
 * number behind it: Lighthouse on a production build measured
 * `resourceLoadDelay = 3 538 ms` on the LCP tile photo and
 * `lcp-discovery → requestDiscoverable: false`, because no image URL existed
 * in the document until JS had booted and fetched the catalog. The seed never
 * blocks and never throws — `null` on an unpaired tablet or any read failure,
 * and the client fetches exactly as it always did.
 *
 * `service` is the seeded rail because repair is the FALLBACK command. The org
 * chooses (`OrgSettings.kiosk.defaultCommand`) and that choice comes down with
 * this HTML — see `counter-boot.server.ts` for why it is not a fetch. The seed
 * is paint, never truth: a tablet whose org opens on Sales simply paints the
 * trail without tiles for one frame.
 */

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

/**
 * The seed reads the device cookie, so this route is per-request by nature.
 *
 * Declared explicitly because the build otherwise ATTEMPTS a static prerender
 * first: `cookies()` throws `DYNAMIC_SERVER_USAGE` during that attempt, and a
 * seed whose whole contract is "never throw" is exactly the code that would
 * swallow it and leave the route prerendered with `seed: null` — which is what
 * happened on 2026-09-15 before `seedKioskCatalog` learned to rethrow it.
 * Two guards, because this one is visible in the route and that one is not.
 */
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
