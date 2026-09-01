'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { OutboundSidebarFilterMap } from '@/components/unshipped/OutboundSidebarFilterMap';
import { motion } from '@/design-system/motion';
import { SidebarShell } from '@/components/layout/SidebarShell';
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
      transition: { type: 'spring' as const, damping: 25, stiffness: 350, mass: 0.5 },
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
              <h2 className="text-xl font-semibold tracking-tighter uppercase leading-none text-text-default">
                Shipping
              </h2>
              <p className="text-role-eyebrow text-text-accent uppercase tracking-widest mt-1">
                Fulfillment queue
              </p>
            </motion.header>
          ) : null}
        </>
      }
      // Lane, stage, carrier and staff refinements live in DataTable's one
      // filter control (search · funnel), the To-ship gold. A FilterRefinementBar
      // here was a second toolbar for facts the table already shows.
      bodyClassName="flex flex-col no-scrollbar pb-6 space-y-4"
    >
      <motion.div variants={itemVariants}>
        <OutboundSidebarFilterMap />
      </motion.div>

      {/* No ROI hero and no onboarding checklist here. The working triage rail is
          Focus (personal scope) + Saved Views only — a monitor rollup pulls the
          eye off triage (report P6) and an activation checklist is not navigation
          (report P10). Throughput ROI already lives on the Band-2 KPI strip and
          Operations analytics; the checklist lives on Home → Today.
          Guard: `outbound-rail-dedup.guard.test.ts`. */}
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
