'use client';

import { useCallback } from 'react';
import { motion } from '@/design-system/motion';
import PackerDashboard from '@/components/PackerDashboard';
import { MobilePackingList } from '@/components/mobile/packer/MobilePackingList';
import { Menu } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { QuickAccessButton } from '@/components/layout/QuickAccessButton';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';

interface PackerPageContentProps {
  packerId: string;
}

/** Responsive packer tree. */
export function PackerPageContent({ packerId }: PackerPageContentProps) {
  useRealtimeToasts('packer');
  const presence = useMotionPresence(motionPresence.routeHistory);
  const transition = useMotionTransition(motionTransition.routeHistoryMount);

  const openDrawer = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-mobile-drawer'));
  }, []);

  return (
    <>
      {/* Mobile (<768px) — recent-packs feed with sheet + photos CTA. */}
      <motion.div
        initial={presence.initial}
        animate={presence.animate}
        transition={transition}
        className="flex h-full w-full flex-col overflow-hidden bg-surface-card md:hidden"
      >
        <header className="sticky top-0 z-header flex min-h-14 items-center gap-3 border-b border-border-hairline bg-surface-card px-3 pt-[env(safe-area-inset-top)]">
          <IconButton
            icon={<Menu className="h-6 w-6" />}
            ariaLabel="Open navigation"
            radius="flush"
            onClick={openDrawer}
            className="flex h-11 w-11 items-center justify-center text-text-muted active:bg-surface-sunken"
          />

          <h1 className="flex-1 text-lg font-semibold tracking-tight text-text-default">
            Packing
          </h1>

          <QuickAccessButton className="h-10 w-10" />
        </header>

        <div className="min-h-0 flex-1">
          <MobilePackingList packerId={packerId} />
        </div>
      </motion.div>

      {/* Desktop (≥768px) — table + details + scan flow. */}
      <motion.div
        initial={presence.initial}
        animate={presence.animate}
        transition={transition}
        className="hidden h-full w-full md:flex"
      >
        <PackerDashboard />
      </motion.div>
    </>
  );
}
