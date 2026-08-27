/**
 * /kiosk/v2 — landscape shell QA path (gated off main `/kiosk`).
 *
 * Pair chrome vs the catalog shell are split: this page is a thin server
 * entry; the client runtime dynamic()s AttractLoop + KioskShell.
 */

import dynamic from 'next/dynamic';
import { KioskCatalogFirstPaint } from '../KioskCatalogFirstPaint';
import { KioskRealtimeProvider } from '@/components/kiosk/KioskRealtimeProvider';

const KioskV2Runtime = dynamic(
  () => import('./KioskV2Runtime').then((m) => m.KioskV2Runtime),
  { loading: () => <KioskCatalogFirstPaint /> },
);

export default function KioskV2Page() {
  // The provider wraps the runtime so the shared-session mirror is attached
  // before the shell paints — a tablet a desk already holds should come back
  // from a reload showing that desk's cart, not an empty one it then replaces.
  return (
    <KioskRealtimeProvider>
      <KioskV2Runtime />
    </KioskRealtimeProvider>
  );
}
