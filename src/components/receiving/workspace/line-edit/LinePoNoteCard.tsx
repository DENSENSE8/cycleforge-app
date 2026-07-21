'use client';

import { Loader2 } from '@/components/Icons';
import {
  WorkspaceCard,
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
} from '@/design-system/components';

const NOTES_TEXTAREA_FOCUS =
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/**
 * Synced PO-note editor — content-only. The carton-level note that lives on the
 * linked purchase order in the connected inventory system.
 *
 * Save / Sync actions live on the panel-level StationTerminalDock (DoorDash/
 * Uber sticky-CTA pattern) — this card never renders an inline footer so the
 * primary action is never duplicated.
 *
 * Draft state is owned by {@link usePoNoteTabState} at the panel level.
 */
export function LinePoNoteCard({
  draft,
  onDraftChange,
  loading = false,
}: {
  draft: string;
  onDraftChange: (next: string) => void;
  /** Sync-from-inventory in flight — shows a subtle status under the textarea. */
  loading?: boolean;
}) {
  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
      <div className="space-y-1">
        <textarea
          rows={6}
          aria-label="Synced PO note"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Carton note on the linked PO — edits overwrite the synced note"
          className={`min-h-[8rem] w-full resize-y ${WORKSPACE_NESTED_FIELD} ${WORKSPACE_NESTED_FIELD_PAD} text-role-caption text-text-default placeholder:text-text-faint ${NOTES_TEXTAREA_FOCUS}`}
        />
        {loading ? (
          <span className="inline-flex items-center gap-1 text-role-micro font-semibold uppercase tracking-wide text-blue-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Syncing from inventory…
          </span>
        ) : null}
      </div>
    </WorkspaceCard>
  );
}
