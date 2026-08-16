'use client';

/**
 * Testing (QC) Station Displays carton Macro floor:
 *   [ ⋯ ][ Edit ][ Delete ]
 *
 * Thin station recipe over {@link CartonDisplaysActionFloor} (no Print, no Sync).
 * Print stays on the dock Pass · Print terminal. Never desk `InspectorActionFloor`.
 */

import { CartonDisplaysActionFloor } from '@/components/station/displays';
import type { TestingDisplayTab } from './build-testing-displays';

export function TestingDisplaysActionFloor({
  receivingId,
  isUnfound,
  openDisplays,
  onDeleted,
  editSelected = false,
}: {
  receivingId: number | null | undefined;
  isUnfound: boolean;
  /** Testing Edit / Resolve open the carton↔PO Linkage leaf (Unbox analog). */
  openDisplays: (tab: TestingDisplayTab) => void;
  /** After successful delete — close Displays / workspace. */
  onDeleted?: () => void;
  /** Underline Edit when the Linkage leaf is open. */
  editSelected?: boolean;
}) {
  return (
    <CartonDisplaysActionFloor
      testIdPrefix="testing"
      receivingId={receivingId}
      isUnfound={isUnfound}
      onDeleted={onDeleted}
      editSelected={editSelected}
      onEdit={() => openDisplays('linkage')}
      onLink={() => openDisplays('linkage')}
    />
  );
}
