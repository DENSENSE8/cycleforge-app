'use client';

/**
 * Reported-Issues right pane (UIC-2): Monitor KPI rollup + Workbench detail.
 * Selection via `?issueId=`; crossfade only the focus surface.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { KpiStrip } from '@/design-system/components/monitor';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { formatMedianDeployLabel } from '@/lib/user-issues/kpi';
import { useReportedIssuesKpis } from '@/hooks/useReportedIssues';
import { IssuesDetail } from './IssuesDetail';
import { IssuesQueue } from './IssuesQueue';

export function IssuesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const issueId = Number(searchParams.get('issueId')) || null;

  const paneMotion = useMotionPresence(framerPresence.workbenchPane);
  const paneTransition = useMotionTransition(framerTransition.workbenchPaneMount);

  const { data: kpis } = useReportedIssuesKpis();

  const clearIssue = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('issueId');
    const qs = sp.toString();
    router.replace(qs ? `/support?${qs}` : '/support?mode=issues', { scroll: false });
  };

  const kpiItems = [
    {
      label: 'Open',
      value: String(kpis?.open ?? 0),
      valueClassName: 'text-amber-700',
      onOpen: () => {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set('mode', 'issues');
        sp.set('status', 'pending');
        sp.delete('issueId');
        router.replace(`/support?${sp.toString()}`, { scroll: false });
      },
    },
    {
      label: 'In progress',
      value: String(kpis?.inProgress ?? 0),
      valueClassName: 'text-blue-700',
      onOpen: () => {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set('mode', 'issues');
        sp.set('status', 'in-progress');
        sp.delete('issueId');
        router.replace(`/support?${sp.toString()}`, { scroll: false });
      },
    },
    {
      label: 'Deployed 7d',
      value: String(kpis?.deployed7d ?? 0),
      valueClassName: 'text-emerald-700',
      onOpen: () => {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set('mode', 'issues');
        sp.set('status', 'deployed');
        sp.delete('issueId');
        router.replace(`/support?${sp.toString()}`, { scroll: false });
      },
    },
    {
      label: 'Median to deploy',
      value: formatMedianDeployLabel(kpis?.medianHoursToDeploy ?? null),
      valueClassName: 'text-text-default',
    },
  ];

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <div className="shrink-0 border-b border-border-hairline bg-surface-card inset-card py-3">
        <KpiStrip items={kpiItems} />
      </div>

      {/* Mobile: list when nothing selected */}
      {!issueId ? (
        <div className="flex h-full min-h-0 w-full flex-col border-r border-border-soft bg-surface-card md:hidden">
          <IssuesQueue />
        </div>
      ) : null}

      <div className={`${issueId ? 'flex' : 'hidden md:flex'} min-h-0 flex-1 flex-col`}>
        <AnimatePresence mode="wait" initial={false}>
          {issueId != null ? (
            <motion.div
              key={`issue-${issueId}`}
              className="flex h-full min-h-0 w-full flex-col"
              initial={paneMotion.initial}
              animate={paneMotion.animate}
              exit={paneMotion.exit}
              transition={paneTransition}
            >
              <IssuesDetail issueId={issueId} onBack={clearIssue} />
            </motion.div>
          ) : (
            <motion.div
              key="issue-empty"
              className="flex h-full items-center justify-center"
              initial={paneMotion.initial}
              animate={paneMotion.animate}
              exit={paneMotion.exit}
              transition={paneTransition}
            >
              <EmptyState
                icon={<MessageSquare className="h-6 w-6 text-text-faint" />}
                title="Select an issue"
                description="Pick a report from the list to review its details."
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
