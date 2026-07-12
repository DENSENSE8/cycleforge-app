'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShippedFormData } from '@/components/shipped';
import { ShippedIntakeForm } from '@/components/shipped/ShippedIntakeForm';
import { Plus } from '@/components/Icons';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { OrdersSyncPopover } from '@/components/unshipped/OrdersSyncPopover';

import { ThroughputRoiCard } from '@/components/dashboard/ThroughputRoiCard';
import { motion } from 'framer-motion';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SearchBar } from '@/components/ui/SearchBar';

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
  const {
    showIntakeForm = false,
    onCloseForm,
    onFormSubmit,
    filterControl,
    embedded = false,
    hideSectionHeader = false,
    searchValue = '',
    onSearchChange,
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

  // Stage + staff filtering moved OFF the sidebar: the swim-lane board sorts orders
  // into PENDING / TESTED / BLOCKED lanes (replacing the stage filter), and the
  // board header hosts its own staff filter (BoardStaffFilter). The `?stage=awaiting`
  // legacy redirect above is kept. So no sidebar Filters button here anymore.

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
                Unshipped
              </h2>
              <p className="text-eyebrow font-bold text-text-accent uppercase tracking-widest mt-1">
                Fulfillment Queue
              </p>
            </motion.header>
          ) : null}
          {/* In-context list filter — a local base SearchBar (NOT the deleted
              sidebar band / SidebarShell.search). Drives the dashboard ?search=
              param so the order list filters in place. The global header pill
              stays global (search any order across the app). */}
          <motion.div
            variants={itemVariants}
            className={`${SIDEBAR_GUTTER} ${hideSectionHeader ? 'pt-4' : 'pt-3'} pb-2`}
          >
            <SearchBar
              size="compact"
              variant="blue"
              value={searchValue}
              onChange={(v) => onSearchChange?.(v)}
              onClear={() => onSearchChange?.('')}
              placeholder="Filter orders…"
              rightElement={
                <HoverTooltip label="New Order Entry" asChild>
                  <button
                    type="button"
                    onClick={handleOpenIntakeForm}
                    className="ds-raw-button rounded-xl bg-emerald-500 p-2.5 text-white transition-colors hover:bg-emerald-600 disabled:bg-surface-strong"
                    aria-label="Open new order entry form"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </HoverTooltip>
              }
            />
          </motion.div>
        </>
      }
      // The PENDING / TESTED / BLOCKED status legend was removed: the Unshipped
      // swim-lane board now sorts orders into those exact lanes, so a sidebar
      // click-to-filter legend on the same three states was redundant.
      bodyClassName="flex flex-col no-scrollbar pb-6"
    >
      <OrdersSyncPopover
        onRefresh={() => {
          window.dispatchEvent(new CustomEvent('dashboard-refresh'));
          window.dispatchEvent(new CustomEvent('app-refresh-data'));
        }}
      />
      <div className="space-y-3 border-t border-border-hairline pt-3">
        <ThroughputRoiCard variant="sidebar" />
      </div>
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
