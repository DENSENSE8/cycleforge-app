import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';

/**
 * `/receiving/history` — legacy URL; desktop proxy 308s to `/incoming?lane=docked`.
 * Kept for SurfaceGate / mobile UA rewrite (`/m/receiving`) until those paths
 * fully retire. Prefer `/incoming?lane=docked` for new links.
 */
export default function ReceivingHistoryPage() {
  return (
    <SurfaceGate surfaceKey="history">
      <ReceivingSurfacePage mobileTitle="History" />
    </SurfaceGate>
  );
}
