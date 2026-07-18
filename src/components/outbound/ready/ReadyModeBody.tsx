'use client';

import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { fbaOutboundHref } from '@/lib/fba/fba-modes';
import Link from 'next/link';

/**
 * Outbound Ready mode sidebar body — teaching copy for the allocation queue.
 * Scoped search lives in the workbench chrome beside its lifecycle facets.
 */
export function ReadyModeBody() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-card">
      <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${SIDEBAR_GUTTER} py-3`}>
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Recently tested
        </p>
        <p className="text-role-caption leading-relaxed text-text-soft">
          Every testing verdict appears in the main history. Eligible units receive a channel
          recommendation for FBA prep, pre-box and stock, or hold.
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
