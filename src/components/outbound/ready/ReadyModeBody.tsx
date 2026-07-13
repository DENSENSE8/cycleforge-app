'use client';

import { SearchBar } from '@/components/ui/SearchBar';
import { SIDEBAR_GUTTER, sidebarHeaderBandClass } from '@/components/layout/header-shell';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { fbaOutboundHref } from '@/lib/fba/fba-modes';
import Link from 'next/link';

/**
 * Outbound Ready mode sidebar body — search + teaching copy for the allocation queue.
 */
export function ReadyModeBody() {
  const { q, setQ } = useOutboundUrlState();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-card">
      <div className={`${sidebarHeaderBandClass} ${SIDEBAR_GUTTER} py-2.5`}>
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Search title, SKU, FNSKU…"
          aria-label="Filter ready queue"
        />
      </div>
      <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${SIDEBAR_GUTTER} py-3`}>
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Post-test allocation
        </p>
        <p className="text-role-caption leading-relaxed text-text-soft">
          Units that passed testing sort here: send to FBA when an open plan needs fill (or Amazon is
          OOS and the SKU is hot), otherwise pre-box and stock for merchant fulfillment.
        </p>
        <Link
          href={fbaOutboundHref()}
          className="inline-flex text-role-caption font-black uppercase tracking-widest text-violet-700 hover:underline"
        >
          Open FBA prep →
        </Link>
      </div>
    </div>
  );
}
