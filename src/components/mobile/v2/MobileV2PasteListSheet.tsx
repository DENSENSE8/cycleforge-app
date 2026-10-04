'use client';

/**
 * The phone's paste-a-list result: a paste of 2+ numbers into the top bar's
 * search, located across every lane in ONE answer (`GET /api/nav/locate`,
 * scope `everywhere`). Status chips count where the numbers live; one flat
 * hairline row per number carries its verdict (bucket · detail) and opens its
 * record — the phone twin when one exists (`phoneRecordHref`). The list itself
 * is held by `MobileV2SearchProvider`; this sheet only shows it.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, ChevronRight, Trash2 } from '@/components/Icons';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import {
  MOBILE_PASTE_LIST_ROW_STAGGER,
  MOBILE_PASTE_LIST_STAGGER_CAP,
  motionPresenceMobile,
  motionTransitionMobile,
} from '@/design-system/foundations/motion-presets';
import { useMotionPresence } from '@/design-system/foundations/motion-presets-hooks';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { phoneRecordHref } from '@/lib/mobile/phone-record-href';
import type { NavLocateBucket } from '@/lib/nav/context/schema';
import type { BulkEntry, BulkList } from '@/lib/nav/locate/use-bulk-list';
import { cn } from '@/utils/_cn';
import { MobileV2ActionSheet } from './MobileV2ActionSheet';

type PasteListVerb = 'clear';

const CLEAR_VERB = [
  { id: 'clear', label: 'Clear list', icon: <Trash2 />, variant: 'secondary', testId: 'mobile-paste-list-clear' },
] as const;

/** Where a number sits, in one line: its buckets, or why it has none. */
function verdictOf(entry: BulkEntry, buckets: readonly NavLocateBucket[]) {
  if (entry.pending) return { tone: 'neutral' as const, label: 'Checking…' };
  if (buckets.length === 0) return { tone: 'danger' as const, label: 'Not found' };
  return { tone: buckets[0].tone, label: buckets.map((bucket) => bucket.label).join(' · ') };
}

function PasteListRowBody({ entry, buckets }: { entry: BulkEntry; buckets: readonly NavLocateBucket[] }) {
  const breathe = useMotionPresence(motionPresenceMobile.pasteListPending);
  const settle = useMotionPresence(motionPresenceMobile.pasteListRow);
  const verdict = verdictOf(entry, buckets);
  const tone = STATE_TONE_CLASSES[verdict.tone];
  // The ref is the row's first line already; a title that opens with it ("<ref> · <what>") says only the rest.
  const title = entry.title?.startsWith(`${entry.ref} · `) ? entry.title.slice(entry.ref.length + 3) : entry.title;

  return (
    <>
      <motion.span
        aria-hidden
        className={cn('self-stretch', tone.dot)}
        initial={false}
        animate={entry.pending ? breathe.animate : { opacity: 1 }}
        transition={entry.pending ? motionTransitionMobile.pasteListBreathe : motionTransitionMobile.pasteListRow}
      />
      <span className="flex min-w-0 flex-col gap-0.5 px-mode-page py-2.5">
        <span className="break-all font-mono text-sm font-semibold text-text-default">{entry.ref}</span>
        {title ? <span className="text-sm text-text-default">{title}</span> : null}
        <AnimatePresence mode="wait" initial={false}>
          {entry.pending ? (
            <motion.span
              key="pending"
              className="text-xs font-semibold text-text-muted"
              initial={breathe.initial}
              animate={breathe.animate}
              // A finite exit: the breath repeats forever, so `mode="wait"` would never let the answer in.
              exit={{ ...breathe.exit, transition: motionTransitionMobile.pasteListRow }}
              transition={motionTransitionMobile.pasteListBreathe}
            >
              {verdict.label}
            </motion.span>
          ) : (
            <motion.span
              key="answered"
              className="text-xs"
              initial={settle.initial}
              animate={settle.animate}
              transition={motionTransitionMobile.pasteListRow}
            >
              <span className={cn('font-semibold', tone.text)}>{verdict.label}</span>
              {entry.detail ? <span className="text-text-muted"> · {entry.detail}</span> : null}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {entry.recordHref ? (
        <ChevronRight aria-hidden className="mr-3 h-4 w-4 self-center text-text-faint" />
      ) : (
        <span aria-hidden />
      )}
    </>
  );
}

/** A status chip — tap narrows the rows to one bucket; the count rolls as answers land. */
function PasteListChip({
  active,
  onPress,
  dot,
  label,
  count,
}: {
  active: boolean;
  onPress: () => void;
  dot?: string;
  label: string;
  count: number;
}) {
  return (
    <Button
      size="sm"
      radius="pill"
      variant={active ? 'primary' : 'secondary'}
      aria-pressed={active}
      onClick={onPress}
      className="shrink-0 whitespace-nowrap shadow-sm"
    >
      {dot ? <span aria-hidden className={cn('size-2 rounded-full', dot)} /> : null}
      {label}
      <AnimatedStat value={count} className="opacity-70" />
    </Button>
  );
}

export function MobileV2PasteListSheet({
  list,
  open,
  onOpenChange,
  onClear,
}: {
  list: BulkList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drops the list — the field is a plain search again. */
  onClear: () => void;
}) {
  const pathname = usePathname() ?? '/m';
  const reduce = useReducedMotion();
  const rowPresence = useMotionPresence(motionPresenceMobile.pasteListRow);
  const chipPresence = useMotionPresence(motionPresenceMobile.pasteListChip);
  const bucketById = new Map(list.buckets.map((bucket) => [bucket.id, bucket]));
  const visible = list.status ? list.entries.filter((entry) => entry.buckets.includes(list.status as string)) : list.entries;
  const shownBuckets = list.buckets.filter((bucket) => bucket.count > 0 || bucket.id === list.status);
  const nowhere = list.entries.filter((entry) => !entry.pending && entry.buckets.length === 0).length;
  const enter = (index: number) => ({
    ...motionTransitionMobile.pasteListRow,
    delay: Math.min(index, MOBILE_PASTE_LIST_STAGGER_CAP) * MOBILE_PASTE_LIST_ROW_STAGGER,
  });

  return (
    <MobileV2ActionSheet<PasteListVerb>
      open={open}
      onClose={() => onOpenChange(false)}
      title="Pasted numbers"
      description="Tap a number to open its record."
      verbs={CLEAR_VERB}
      onVerb={onClear}
      dockLabel="Pasted numbers actions"
      testId="mobile-paste-list-sheet"
    >
      <div className="flex gap-2 overflow-x-auto px-mode-page py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Where the pasted numbers are" role="group">
        <AnimatePresence mode="popLayout">
          <motion.div key="all" layout={reduce ? false : 'position'} {...chipPresence} transition={enter(0)}>
            <PasteListChip active={list.status === null} onPress={() => list.setStatus(null)} label="All" count={list.entries.length} />
          </motion.div>
          {shownBuckets.map((bucket, index) => (
            <motion.div key={bucket.id} layout={reduce ? false : 'position'} {...chipPresence} transition={enter(index + 1)}>
              <PasteListChip
                active={list.status === bucket.id}
                onPress={() => list.setStatus(list.status === bucket.id ? null : bucket.id)}
                dot={STATE_TONE_CLASSES[bucket.tone].dot}
                label={bucket.label}
                count={bucket.count}
              />
            </motion.div>
          ))}
          {nowhere > 0 ? (
            <motion.span
              key="nowhere"
              layout={reduce ? false : 'position'}
              {...chipPresence}
              transition={enter(shownBuckets.length + 1)}
              className={cn('flex shrink-0 items-center gap-1 px-1 text-xs font-semibold', STATE_TONE_CLASSES.danger.text)}
            >
              <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
              Not found
              <AnimatedStat value={nowhere} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {list.error ? (
        <div className={cn('flex items-center gap-3 border-y border-border-soft px-mode-page py-2 text-sm', STATE_TONE_CLASSES.danger.text)}>
          <span className="min-w-0 flex-1">{list.error}</span>
          <Button size="sm" variant="secondary" onClick={list.refetch}>
            Retry
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="px-mode-page py-4 text-sm text-text-muted">{list.loading ? 'Checking…' : 'No pasted numbers in this bucket.'}</p>
      ) : (
        <ul aria-label="Pasted numbers" className="divide-y divide-border-soft border-t border-border-soft" data-testid="mobile-paste-list-rows">
          <AnimatePresence mode="popLayout">
            {visible.map((entry, index) => {
              const buckets = entry.buckets.flatMap((id) => bucketById.get(id) ?? []);
              const rowClass = 'grid min-h-14 w-full grid-cols-[3px_minmax(0,1fr)_auto] bg-surface-card text-left';
              return (
                <motion.li
                  key={entry.ref}
                  layout={reduce ? false : 'position'}
                  initial={rowPresence.initial}
                  animate={rowPresence.animate}
                  exit={{ ...rowPresence.exit, transition: motionTransitionMobile.pasteListRow }}
                  transition={enter(index)}
                  data-pending={entry.pending || undefined}
                >
                  {entry.recordHref ? (
                    <Link
                      href={phoneRecordHref(entry.recordHref, pathname)}
                      onClick={() => onOpenChange(false)}
                      className={cn(rowClass, 'active:bg-text-default active:text-surface-card')}
                      data-testid="mobile-paste-list-row"
                    >
                      <PasteListRowBody entry={entry} buckets={buckets} />
                    </Link>
                  ) : (
                    <div className={rowClass} data-testid="mobile-paste-list-row">
                      <PasteListRowBody entry={entry} buckets={buckets} />
                    </div>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </MobileV2ActionSheet>
  );
}
