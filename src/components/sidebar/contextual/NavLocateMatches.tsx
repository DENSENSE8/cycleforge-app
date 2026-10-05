'use client';

import { useId } from 'react';
import { AnimatePresence } from '@/design-system/motion';
import type { NavLocateBucket, NavLocateResponse } from '@/lib/nav/context/schema';
import { BulkRow } from './NavBulkRow';

/**
 * The records the typed Find matches, under the locate pills — a locator
 * whose records open on their own (Support: `#<id>` · who · platform · order,
 * the subject, its status chip) lists them in its `q` answer. The SAME row
 * face as a pasted number (BulkRow) with no list verbs: a click (or ↵ on the
 * lit row, `lit` driven from the field) opens the record; the status chip
 * opens that status's list with the text kept. Matches past the cap are
 * counted, never listed — the list on screen shows every one.
 */
export function NavLocateMatches({
  answer,
  current,
  lit,
  onPoint,
  onOpen,
  onOpenBucket,
}: {
  answer: Pick<NavLocateResponse, 'buckets' | 'entries' | 'truncated'>;
  /** The bucket whose list is on screen — its chip is plain text. */
  current: string | undefined;
  /** The row ↑↓ in the field lit, or -1. */
  lit: number;
  onPoint: (index: number) => void;
  onOpen: (recordHref: string) => void;
  onOpenBucket: (bucket: NavLocateBucket) => void;
}) {
  const listboxId = useId();
  if (answer.entries.length === 0) return null;
  return (
    <div data-nav-locate-matches className="flex min-w-0 flex-col">
      <div role="listbox" id={listboxId} aria-label="Matching records" className="py-0.5">
        <AnimatePresence mode="popLayout" initial={false}>
          {answer.entries.map((entry, index) => {
            const bucket = answer.buckets.find((candidate) => candidate.id === entry.buckets[0]);
            const { recordHref } = entry;
            return (
              <BulkRow
                key={entry.ref}
                id={`${listboxId}-${index}`}
                entry={{ ...entry, pending: false }}
                primary={bucket ? { bucket, current: bucket.id === current, elsewhere: false } : undefined}
                index={index}
                lit={index === lit}
                onPoint={() => onPoint(index)}
                onOpen={() => {
                  if (recordHref) onOpen(recordHref);
                }}
                onOpenBucket={onOpenBucket}
                onOpenRecord={undefined}
              />
            );
          })}
        </AnimatePresence>
      </div>
      {answer.truncated > 0 ? (
        <p className="px-3 pb-1 text-role-micro text-text-faint">{answer.truncated} more on the list</p>
      ) : null}
    </div>
  );
}
