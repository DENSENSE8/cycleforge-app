'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import type { WorkOrderRow } from '@/components/work-orders/types';
import { formatDate } from '@/components/work-orders/types';
import { Button } from '@/design-system/primitives';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { ChevronRight, ExternalLink } from '@/components/Icons';
import type { MyDayInterrupt } from '@/lib/my-day/my-day-types';
import { workOrderHref } from '@/lib/my-day/my-day-href';
import { assignmentHeaderContextText } from '@/design-system/components/work-order-assignment/work-order-assignment-shared';

type SelectedItem =
  | { kind: 'work_order'; row: WorkOrderRow }
  | { kind: 'interrupt'; item: MyDayInterrupt };

export function MyDayContextPane({ selected }: { selected: SelectedItem | null }) {
  const presence = useMotionPresence(framerPresence.workbenchPane);
  const transition = useMotionTransition(framerTransition.workbenchPaneMount);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <AnimatePresence mode="wait" initial={false}>
        {selected ? (
          <motion.div
            key={selected.kind === 'work_order' ? selected.row.id : selected.item.id}
            {...presence}
            transition={transition}
            className="space-y-4"
          >
            {selected.kind === 'work_order' ? (
              <WorkOrderDetail row={selected.row} />
            ) : (
              <InterruptDetail item={selected.item} />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            {...presence}
            transition={transition}
            className="rounded-xl border border-dashed border-border-soft bg-surface-sunken px-4 py-8 text-center"
          >
            <p className="text-role-caption font-bold text-text-muted">
              Select a task to see details and open the right station.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WorkOrderDetail({ row }: { row: WorkOrderRow }) {
  const href = workOrderHref(row);
  const deadline = row.deadlineAt ? formatDate(row.deadlineAt, 'No deadline') : null;

  return (
    <>
      <div className="space-y-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          {assignmentHeaderContextText(row)}
        </p>
        <h2 className="text-h3 font-bold text-text-default">{row.title}</h2>
        <p className="text-role-caption font-medium text-text-muted">{row.subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-blue-700 ring-1 ring-inset ring-blue-200">
          {row.status.replace('_', ' ')}
        </span>
        {deadline ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-amber-700 ring-1 ring-inset ring-amber-200">
            Due {deadline}
          </span>
        ) : null}
      </div>

      <Link href={href} className="inline-flex">
        <Button variant="primary" icon={<ExternalLink />} iconRight={<ChevronRight />}>
          Open in workspace
        </Button>
      </Link>
    </>
  );
}

function InterruptDetail({ item }: { item: MyDayInterrupt }) {
  return (
    <>
      <div className="space-y-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Needs attention
        </p>
        <h2 className="text-h3 font-bold text-text-default">{item.title}</h2>
        <p className="text-role-caption font-medium text-text-muted">{item.subtitle}</p>
      </div>

      <Link href={item.href} className="inline-flex">
        <Button variant="primary" icon={<ExternalLink />} iconRight={<ChevronRight />}>
          Investigate
        </Button>
      </Link>
    </>
  );
}