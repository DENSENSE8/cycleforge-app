'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { OutboundSidebarFilterMap } from '@/components/unshipped/OutboundSidebarFilterMap';
import { ThroughputRoiCard } from '@/components/dashboard/ThroughputRoiCard';
import { FirstScanOnboardingCard } from '@/components/dashboard/FirstScanOnboardingCard';
import { GettingStartedChecklist } from '@/components/dashboard/GettingStartedChecklist';
import { ShippedFilterDropdown } from '@/components/shipping/shipped-filter/ShippedFilterDropdown';
import { motion } from 'framer-motion';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { useOutboundSidebarScope } from '@/components/unshipped/useOutboundSidebarScope';
import { SHIPPING_PATH } from '@/components/outbound/outbound-sidebar-shared';

interface UnshippedSidebarProps {
  filterControl?: ReactNode;
  embedded?: boolean;
  hideSectionHeader?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export default function UnshippedSidebar(props: UnshippedSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = useOutboundSidebarScope();
  const {
    filterControl,
    embedded = false,
    hideSectionHeader = false,
    searchValue = '',
  } = props;
  // ── Stage filter (fulfillment queue only) ─────────────────────────────────
  const stageParam = String(searchParams.get('stage') || 'all').toLowerCase();

  useEffect(() => {
    if (stageParam !== 'awaiting') return;
    const params = new URLSearchParams();
    const q = searchValue.trim() || searchParams.get('search')?.trim();
    if (q) params.set('q', q);
    const qs = params.toString();
    router.replace(qs ? `${SHIPPING_PATH}?${qs}` : SHIPPING_PATH, { scroll: false });
  }, [stageParam, searchValue, searchParams, router]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20, filter: 'blur(4px)' },
    visible: {
      opacity: 1,
      x: 0,
      filter: 'blur(0px)',
      transition: { type: 'spring', damping: 25, stiffness: 350, mass: 0.5 },
    },
  };

  const isPrePack = scope.mode === 'unshipped';
  const refinements = isPrePack ? scope.unshippedRefinements : scope.shippedRefinements;
  const onClearAll = isPrePack ? scope.clearUnshippedScope : scope.clearShippedScope;

  const content = (
    <SidebarShell
      as={motion.div}
      containerProps={{ initial: 'hidden', animate: 'visible', variants: containerVariants }}
      headerAbove={
        <>
          {filterControl ? (
            <motion.div variants={itemVariants} className="relative z-20">
              {filterControl}
            </motion.div>
          ) : null}
          {!hideSectionHeader ? (
            <motion.header variants={itemVariants} className={`${SIDEBAR_GUTTER} ${filterControl ? 'pt-2' : 'pt-6'}`}>
              <h2 className="text-xl font-black tracking-tighter uppercase leading-none text-text-default">
                Shipping
              </h2>
              <p className="text-role-eyebrow font-bold text-text-accent uppercase tracking-widest mt-1">
                Fulfillment queue
              </p>
            </motion.header>
          ) : null}
        </>
      }
      // Pre-pack ("Shipping") lane/staff filtering lives in the workspace
      // header (OutboundExactFilters funnel + StaffFilterButton) — the single
      // filter home. Only the shipped scope keeps a sidebar filter, for its
      // carrier facets that the header doesn't carry.
      filter={
        isPrePack
          ? undefined
          : {
              label: 'Shipment filters',
              refinements,
              activeCount: refinements.length,
              onClearAll,
              renderDropdown: (onClose) => <ShippedFilterDropdown onClose={onClose} />,
            }
      }
      bodyClassName="flex flex-col no-scrollbar pb-6 space-y-4"
    >
      <motion.div variants={itemVariants}>
        <OutboundSidebarFilterMap />
      </motion.div>

      {/* Ambient / teach — first-scan when no throughput; ROI when hasData. */}
      <motion.div variants={itemVariants} className="space-y-3 border-t border-border-hairline pt-3">
        <FirstScanOnboardingCard variant="sidebar" />
        <ThroughputRoiCard variant="sidebar" />
        <GettingStartedChecklist variant="sidebar" />
      </motion.div>
    </SidebarShell>
  );

  if (embedded) {
    return <div className="h-full overflow-hidden bg-surface-card">{content}</div>;
  }

  return (
    <aside className="bg-surface-card text-text-default flex-shrink-0 h-full overflow-hidden border-r border-border-soft relative w-[300px]">
      {content}
    </aside>
  );
}
