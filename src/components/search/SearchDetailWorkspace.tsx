'use client';

/**
 * SearchDetailWorkspace — `/search?sel=type:id` FIND confirmation.
 *
 * ORDER / UNIT / RECEIVING / SKU / REPAIR / FBA all paint the dossier frame.
 * Work happens on the handoff surface. Record→record uses `swap.focus`, never
 * scan-station carton cadence.
 */

import { useEffect, type ReactNode } from 'react';
import {
  AnimatePresence,
  motion,
  motionRole,
  useMotionRole,
  useOverlaySwapHardCut,
} from '@/design-system/motion';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { SearchDossier } from '@/components/search/dossier/SearchDossier';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import type { SearchSelection } from '@/lib/search/search-selection';
import { zIndex } from '@/design-system/tokens/z-index';

function PaneCentre({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card p-8">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

export function SearchDetailWorkspace({
  sel,
  hasQuery,
  onExit,
}: {
  sel: SearchSelection | null;
  hasQuery: boolean;
  onExit: () => void;
}) {
  const { presence, transition } = useMotionRole(motionRole.swap.focus);
  const primaryPaint = useSearchPrimaryPaintOptional();
  const branchOwnsPaint = sel == null;
  useEffect(() => {
    if (branchOwnsPaint) primaryPaint?.onPrimaryPainted();
  }, [branchOwnsPaint, primaryPaint]);
  const hardCut = useOverlaySwapHardCut(Boolean(sel));

  let body: ReactNode;
  if (!sel) {
    body = hasQuery ? (
      <PaneCentre>
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Select a result"
          description="Pick a hit under the search bar to open its record. An exact sole match opens automatically."
        />
      </PaneCentre>
    ) : (
      <div className="min-h-0 flex-1 bg-surface-card" aria-busy />
    );
  } else {
    body = <SearchDossier sel={sel} hasQuery={hasQuery} onExit={onExit} />;
  }

  const key = sel ? `${sel.entityType}:${sel.id}` : hasQuery ? 'pick' : 'empty';

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-card">
      <AnimatePresence initial={false} mode={hardCut ? 'sync' : 'wait'}>
        <motion.div
          key={key}
          className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-surface-card"
          initial={hardCut ? false : presence.initial}
          animate={presence.animate}
          exit={presence.exit}
          transition={transition}
          style={{ zIndex: zIndex.panel + (hardCut ? 1 : 0) }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
