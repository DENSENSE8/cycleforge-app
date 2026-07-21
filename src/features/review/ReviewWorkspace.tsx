'use client';

import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { ClipboardList } from '@/components/Icons';
import { usePackReviewQueue } from '@/features/review/usePackReviewQueue';
import { PackerReviewMode } from '@/features/review/packer/PackerReviewMode';
import { isPackReviewBucket, type PackReviewBucket } from '@/lib/packing/pack-review-queue-types';

/**
 * Right pane for `/review` — the Workbench focus surface. Reads the same URL
 * params the sidebar writes (`?rtab=` bucket + `?packerLogId=` selection), finds
 * the selected row in the shared queue, and crossfades ONLY this pane on
 * selection change (the queue list stays put). `?mode=packer` is the sole mode at
 * birth; a mode switch would route here to a sibling review mode. Plan §4c.
 */
export function ReviewWorkspace() {
  const searchParams = useSearchParams();
  const rawBucket = searchParams.get('rtab');
  const bucket: PackReviewBucket = isPackReviewBucket(rawBucket) ? rawBucket : 'needs_review';
  const selectedId = Number(searchParams.get('packerLogId')) || null;

  // Same queryKey as the sidebar → react-query dedups the fetch; the selection is
  // always within the active tab (tab switches clear ?packerLogId=).
  const { data: rows = [] } = usePackReviewQueue(bucket);
  const selected = selectedId ? rows.find((r) => r.packerLogId === selectedId) ?? null : null;

  const presence = useMotionPresence(framerPresence.workbenchPane);
  const transition = useMotionTransition(framerTransition.workbenchPaneMount);

  return (
    <div className="h-full">
      <AnimatePresence mode="wait" initial={false}>
        {selected ? (
          <motion.div key={`review-${selected.packerLogId}`} {...presence} transition={transition} className="h-full">
            <PackerReviewMode row={selected} />
          </motion.div>
        ) : (
          <motion.div key="review-empty" {...presence} transition={transition} className="h-full">
            <ReviewEmpty />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReviewEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-canvas px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken">
        <ClipboardList className="h-6 w-6 text-text-faint" />
      </div>
      <p className="max-w-xs text-role-caption font-semibold text-text-muted">
        Select a packed order from the queue to review its slip, box, and tracking.
      </p>
    </div>
  );
}
