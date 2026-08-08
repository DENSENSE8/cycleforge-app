'use client';

/**
 * Dock control for `classify` — mounts the shared TriageClassifySection via
 * `classifySlot` (adapter-composed; never the controller in this bag).
 *
 * Band 1 grows for this step only (UnboxDockHost `expandBand`) so the editor
 * is thumb-reachable on a phone viewport without leaving the dock. Do not fork
 * a second classify surface — Displays still mounts the same section.
 */

import type { UnboxStepDockContext } from './types';

function MissingSlot({ what }: { what: string }) {
  return <p className="truncate text-role-caption text-text-soft">{what}</p>;
}

export function ClassifyDockControl({ classifySlot }: UnboxStepDockContext) {
  if (!classifySlot) {
    return <MissingSlot what="Nothing to classify on this carton." />;
  }
  return (
    <div
      className="flex max-h-[min(50vh,24rem)] w-full min-w-0 flex-col overflow-y-auto overflow-x-hidden"
      data-unbox-classify-dock
    >
      {classifySlot}
    </div>
  );
}
