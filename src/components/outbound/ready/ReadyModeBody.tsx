'use client';

import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { fbaOutboundHref } from '@/lib/fba/fba-modes';
import Link from 'next/link';

/**
 * FBA Ready-stage sidebar body — teaching copy for the allocation queue.
 * Scoped search lives in the workbench chrome beside the lifecycle stage tabs.
 */
export function ReadyModeBody() {
  return (
    <div className={`${SIDEBAR_GUTTER} space-y-3 py-3`}>
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
        Recently tested
      </p>
      <p className="text-role-caption leading-relaxed text-text-soft">
        Every testing verdict appears in the main history. Eligible units receive a channel
        recommendation for FBA prep, pre-box and stock, or hold.
      </p>
      <Link
        href={fbaOutboundHref({ fbaMode: 'plan' })}
        className="inline-flex text-role-caption font-semibold uppercase tracking-widest text-text-accent hover:underline"
      >
        Open Plan →
      </Link>
    </div>
  );
}
