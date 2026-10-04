'use client';

import { motion } from '@/design-system/motion';
import PackerDashboard from '@/components/PackerDashboard';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';

/**
 * Desk packer station. Phones pack through the pick → `/m/pack/start/[orderId]`
 * job and the `/m/p/[id]/photos` capture bridge; there is no phone pack queue
 * (`docs/mobile-first/SURFACE_LAW.md`).
 */
export function PackerPageContent() {
  useRealtimeToasts('packer');
  const presence = useMotionPresence(motionPresence.routeHistory);
  const transition = useMotionTransition(motionTransition.routeHistoryMount);

  return (
    <motion.div
      initial={presence.initial}
      animate={presence.animate}
      transition={transition}
      className="flex h-full w-full"
    >
      <PackerDashboard />
    </motion.div>
  );
}
