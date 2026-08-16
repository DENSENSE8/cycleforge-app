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
import { Panel } from '@/design-system/primitives';


export default function CartonInspectorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const receivingId = Number(id);

  if (!Number.isFinite(receivingId) || receivingId <= 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-canvas p-6">
        <Panel radius="xl" padding="none" className="border-dashed inset-empty text-center text-role-caption text-text-muted">
          “{id}” is not a carton id.
        </Panel>
      </div>
    );
  }

  return <CartonInspector receivingId={receivingId} />;
}
