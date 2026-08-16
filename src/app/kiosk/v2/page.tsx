/**
 * /kiosk/v2 — landscape shell QA path (gated off main `/kiosk`).
 *
 * Pair chrome vs the catalog shell are split: this page is a thin server
 * entry; the client runtime dynamic()s AttractLoop + KioskShell.
 */

import dynamic from 'next/dynamic';
import { KioskCatalogFirstPaint } from '../KioskCatalogFirstPaint';

const KioskV2Runtime = dynamic(
  () => import('./KioskV2Runtime').then((m) => m.KioskV2Runtime),
  { loading: () => <KioskCatalogFirstPaint /> },
);

export default function KioskV2Page() {
  return <KioskV2Runtime />;
}
