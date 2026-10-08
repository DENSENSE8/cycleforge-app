'use client';

/**
 * Find on the board: what a scan or typed text (`?q=` — the sidebar's find on
 * a desk, the phone's own field, a gun scan anywhere) names. One match opens
 * by itself; several list here as records to pick from; none says so. The
 * search spans the whole board (in the building + scanned out today) whatever
 * the sidebar facets say.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { Spinner } from '@/design-system/primitives/Spinner';
import { LIVE_FEED_QUERY_ROOT, liveFeedFindQuery } from '@/lib/live-feed/query';
import type { PackageCard } from '@/lib/live-feed/types';
import { PackageMiniRow } from './PackageMiniRow';
import { SendReplacementPopover } from '@/components/outbound/labels/SendReplacementPopover';

export function FindResults({
  q,
  openId,
  onOpen,
  onClear,
}: {
  q: string;
  openId: number | null;
  onOpen: (card: PackageCard) => void;
  onClear: () => void;
}) {
  const find = useQuery(liveFeedFindQuery(q));
  const queryClient = useQueryClient();
  const packages = find.data?.packages ?? null;
  const [replaceOpen, setReplaceOpen] = useState(false);
  /** The one order the find resolved to — the replacement CTA's target. */
  const sole = packages && packages.length === 1 && packages[0].link === 'order' ? packages[0] : null;

  // One match opens itself — once per search, so closing it does not reopen it.
  const autoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!packages || packages.length !== 1 || autoOpened.current === q) return;
    autoOpened.current = q;
    if (packages[0]!.orderRowId !== openId) onOpen(packages[0]!);
  }, [packages, q, openId, onOpen]);

  if (q.trim().length < 3) return null;
  return (
    <section
      aria-label={`Find ${q}`}
      data-testid="live-feed-find"
      className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-inset ring-slate-900/5"
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="min-w-0 truncate text-slate-500">
          Find <span className="font-mono font-semibold text-slate-900">{q}</span>
        </span>
        <span className="shrink-0 text-slate-500">
          {find.isFetching && !packages ? (
            <Spinner size="sm" />
          ) : packages == null ? null : packages.length === 0 ? (
            'No package on today’s board matches.'
          ) : packages.length === 1 ? (
            '1 package'
          ) : (
            `${packages.length} packages`
          )}
        </span>
        {sole ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Send className="h-3.5 w-3.5" />}
            className="ml-auto"
            data-testid="find-send-replacement"
            onClick={() => setReplaceOpen(true)}
          >
            Send replacement…
          </Button>
        ) : null}
        <IconButton icon={<X className="size-4" />} ariaLabel="Clear find" size="sm" radius="pill" className={sole ? '' : 'ml-auto'} onClick={onClear} />
      </div>
      {packages && packages.length > 1 ? (
        <ul className="flex flex-col gap-1">
          {packages.map((card) => (
            <li key={card.orderRowId}>
              <PackageMiniRow card={card} current={card.orderRowId === openId} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      ) : null}
      {sole ? (
        <SendReplacementPopover
          order={sole}
          open={replaceOpen}
          onOpenChange={setReplaceOpen}
          onChange={() => void queryClient.invalidateQueries({ queryKey: LIVE_FEED_QUERY_ROOT })}
        />
      ) : null}
    </section>
  );
}
