'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShippedFormData } from '@/components/shipped';
import { ShippedIntakeForm } from '@/components/shipped/ShippedIntakeForm';
import { Plus } from '@/components/Icons';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { OrdersSyncPopover } from '@/components/unshipped/OrdersSyncPopover';
import { OutboundSidebarFilterMap } from '@/components/unshipped/OutboundSidebarFilterMap';
import { OutboundFilterDropdown } from '@/components/unshipped/OutboundFilterDropdown';
import { ThroughputRoiCard } from '@/components/dashboard/ThroughputRoiCard';
import { FirstScanOnboardingCard } from '@/components/dashboard/FirstScanOnboardingCard';
import { GettingStartedChecklist } from '@/components/dashboard/GettingStartedChecklist';
import { ShippedFilterDropdown } from '@/components/shipping/shipped-filter/ShippedFilterDropdown';
import { motion } from 'framer-motion';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { useOutboundSidebarScope } from '@/components/unshipped/useOutboundSidebarScope';

interface UnshippedSidebarProps {
  showIntakeForm?: boolean;
  onCloseForm?: () => void;
  onFormSubmit?: (data: ShippedFormData) => void;
  filterControl?: ReactNode;
  embedded?: boolean;
  hideSectionHeader?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export default function UnshippedSidebar(props: UnshippedSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = useOutboundSidebarScope();
  const {
    showIntakeForm = false,
    onCloseForm,
    onFormSubmit,
    filterControl,
    embedded = false,
    hideSectionHeader = false,
    searchValue = '',
  } = props;
  const handleOpenIntakeForm = () => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('new', 'true');
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${pathname || '/dashboard'}?${nextSearch}` : pathname || '/dashboard');
  };

  // ── Stage filter (fulfillment queue only) ─────────────────────────────────
  const stageParam = String(searchParams.get('stage') || 'all').toLowerCase();

  useEffect(() => {
    if (stageParam !== 'awaiting') return;
    const params = new URLSearchParams();
    const q = searchValue.trim() || searchParams.get('search')?.trim();
    if (q) params.set('q', q);
    const qs = params.toString();
    router.replace(qs ? `/outbound?${qs}` : '/outbound', { scroll: false });
  }, [stageParam, searchValue, searchParams, router]);

  if (showIntakeForm) {
    return (
      <ShippedIntakeForm
        onClose={onCloseForm || (() => {})}
        onSubmit={onFormSubmit || (() => {})}
      />
    );
  }

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
          {/* New order entry — scoped list search now lives in the workspace
              header toolbar (one search home); the rail keeps create + scope. */}
          <motion.div
            variants={itemVariants}
            className={`${SIDEBAR_GUTTER} ${hideSectionHeader ? 'pt-4' : 'pt-3'} pb-1`}
          >
            {/* ds-raw-button — emerald "create" affordance; DS Button has no success variant */}
            <button
              type="button"
              onClick={handleOpenIntakeForm}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-role-caption font-bold text-white transition-colors hover:bg-emerald-600 disabled:bg-surface-strong"
              aria-label="Open new order entry form"
            >
              <Plus className="h-4 w-4" /> New order
            </button>
          </motion.div>
        </>
      }
      filter={{
        label: isPrePack ? 'Order filters' : 'Shipment filters',
        refinements,
        activeCount: refinements.length,
        onClearAll,
        renderDropdown: (onClose) =>
          isPrePack ? (
            <OutboundFilterDropdown onClose={onClose} />
          ) : (
            <ShippedFilterDropdown onClose={onClose} />
          ),
      }}
      headerBelow={
        <motion.div variants={itemVariants} className={`${SIDEBAR_GUTTER} pb-2 pt-1`}>
          <OrdersSyncPopover
            onRefresh={() => {
              window.dispatchEvent(new CustomEvent('dashboard-refresh'));
              window.dispatchEvent(new CustomEvent('app-refresh-data'));
            }}
          />
        </motion.div>
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
