'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from '@/design-system/motion';
import { usePathname, useRouter } from 'next/navigation';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { StaffAccountFooter } from '@/components/sidebar/master-nav/StaffAccountFooter';
import { useAuth } from '@/contexts/AuthContext';
import { SIDEBAR_SPINE_WIDTH, SPINE_ROW_ICON_CLASS } from '@/components/sidebar/sidebar-spine';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { MobileStackSheet, type StackFindDestination } from './MobileStackSheet';

/**
 * Left slide-over for the mobile shell — the host of the Stack.
 *
 * Since the workstation pivot (2026-09-06) the drawer carries no page tree.
 * Its body is {@link MobileStackSheet}: Now · Earlier today · Queues · Find —
 * the day's timeline folded by the same pure `stackModel` the desk's rail
 * bands use. Destinations survive as the Find band's searchable list below;
 * scanning remains the other way in. What stayed verbatim is the chrome
 * (scrim, flush-square spine-width panel, header, escape) and the footer —
 * the DESKTOP spine's own `StaffAccountFooter`, mounted, not rewritten.
 */

/** Everything Find can reach, flattened from the drawer's former tree. The
 *  Workstation row first: it is the surface the phone is for. */
const FIND_DESTINATIONS: readonly StackFindDestination[] = [
  { label: 'Workstation', href: '/m/triage' },
  { label: 'Home', href: '/m/home' },
  { label: 'Picks', href: '/m/pick' },
  { label: 'Unbox', href: '/m/unbox' },
  { label: 'Photo feed', href: '/m/receiving' },
  { label: 'Walk-In', href: '/m/receiving?mode=local-pickup' },
  { label: 'Repair', href: '/m/receiving?mode=repair' },
  { label: 'Packing', href: '/m/pack' },
  { label: 'Testing', href: '/m/testing' },
  { label: 'Prepacked', href: '/m/prepacked' },
  { label: 'Scan out', href: '/m/scan-out' },
  { label: 'Checklists', href: '/m/checklist' },
  { label: 'Companion', href: '/m/companion' },
];

export const MobileSidebarDrawer = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  // Close on route change so a tap that navigates also dismisses the drawer.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && user && (
        <>
          {/* Scrim */}
          {/* ds-raw-button: full-bleed animated dismiss scrim (motion.button), not a DS action control */}
          <motion.button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-panelBackdrop bg-scrim/40 backdrop-blur-[2px]"
          />

          {/* Panel */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Today"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.4, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -500) onClose();
            }}
            className={cn(
              // Flush-square, spine-width, chrome ground — the desktop push column
              // in a slide-over. Depth is the border + the scrim behind it, per
              // the accent module's "no ring, no shadow, no bevel".
              'fixed inset-y-0 left-0 z-panel flex h-[100dvh] max-w-[86vw] flex-col border-r border-border-soft',
              SIDEBAR_SPINE_WIDTH,
              appChromeClass,
              cornerClass('flush'),
            )}
          >
            {/* Header */}
            <div className="mt-[env(safe-area-inset-top)] flex h-10 shrink-0 items-center justify-between border-b border-border-hairline px-2">
              <span className="px-1 text-role-caption font-semibold uppercase tracking-[0.18em] text-text-soft">
                Today
              </span>
              <IconButton
                icon={<X className={SPINE_ROW_ICON_CLASS} />}
                onClick={onClose}
                ariaLabel="Close menu"
                size="md"
                className={cn(
                  'flex items-center justify-center text-text-soft transition-colors hover:bg-surface-hover',
                  cornerClass('flush'),
                )}
              />
            </div>

            {/* The Stack — the day as four bands */}
            <MobileStackSheet onNavigate={navigate} findDestinations={FIND_DESTINATIONS} />

            {/*
              Footer — the DESKTOP spine footer component, mounted verbatim.
              Identity · ⋯ (Settings · clipboard · report an issue) · sign out.
              Deliberately NOT a mobile-shaped rewrite: a phone-local twin is
              the page-local twin the house bans, drifting apart the moment
              either changes.
            */}
            <StaffAccountFooter />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
