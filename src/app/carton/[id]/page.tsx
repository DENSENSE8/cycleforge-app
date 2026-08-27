'use client';

/**
 * `/carton/[id]` — the read-only carton record (plan D4).
 *
 * The URL names the job: inspect one carton. `/unbox` stays the WORK surface;
 * this is the read door that did not exist, which is why "let me see what
 * happened to this box" used to mean opening the editor. `searchHitHref`
 * (`RECEIVING`) points here, so every search / ⌘K / AI hit lands on the record
 * instead of the bench.
 *
 * Thin by design — the surface lives in `CartonInspector` so it can also be
 * mounted somewhere else later (a right-rail occupant, a slide-over) without
 * dragging the route with it.
 */

import { use } from 'react';
import { CartonInspector } from '@/components/receiving/inspector/CartonInspector';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';


export default function CartonInspectorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const receivingId = Number(id);

  if (!Number.isFinite(receivingId) || receivingId <= 0) {
    return (
      // The house empty face, not a soft-radius dashed Panel: this is the same
      // "you asked for a record that cannot exist" state `/search` paints, and
      // the two are one click apart.
      <div className="flex h-full w-full items-center justify-center bg-surface-canvas p-6">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Not a carton id"
          description={`“${id}” is not a number this surface can open. Check the link, or search for the carton.`}
        />
      </div>
    );
  }

  return <CartonInspector receivingId={receivingId} />;
}
