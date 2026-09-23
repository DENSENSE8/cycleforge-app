'use client';

import { Suspense } from 'react';
import { FbaOutboundWorkspace } from '@/components/fba/FbaOutboundWorkspace';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/** `/shipping/fba` — the FBA board, behind its own suspense boundary. */
export function FbaWorkspace() {
  return (
    <Suspense
      fallback={(
        <div className="flex h-full w-full items-center justify-center bg-surface-card">
          <LoadingSpinner size="lg" className="text-text-accent" />
        </div>
      )}
    >
      <FbaOutboundWorkspace />
    </Suspense>
  );
}
