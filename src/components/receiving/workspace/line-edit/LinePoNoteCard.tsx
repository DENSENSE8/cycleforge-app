'use client';

import { Check, Download, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  WorkspaceCard,
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
} from '@/design-system/components';

const NOTES_TEXTAREA_FOCUS =
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/**
 * Synced PO-note editor — the carton-level note that lives on the linked
 * purchase order in the connected inventory system.
 *
 * Save / Sync are LOCAL controls in this card's footer. They used to ride the
 * panel-level StationTerminalDock, but the dock is carton-terminal now
 * (Print · Receive) and the editor lives in the right-edge Displays column — a
 * dock button that changed meaning with a right-panel selection was
 * cross-region action-at-a-distance.
 *
 * Draft state is still owned by {@link usePoNoteTabState} at the panel level so
 * a carton switch re-seeds it.
 */
export function LinePoNoteCard({
  draft,
  onDraftChange,
  loading = false,
  dirty = false,
  saving = false,
  onSave,
  onSyncFromInventory,
}: {
  draft: string;
  onDraftChange: (next: string) => void;
  /** Sync-from-inventory in flight — shows a subtle status under the textarea. */
  loading?: boolean;
  /** Draft differs from the synced note — enables Save, blocks a clobbering sync. */
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onSyncFromInventory?: () => void;
}) {
  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
      <div className="space-y-2">
        <textarea
          rows={6}
          aria-label="Synced PO note"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Carton note on the linked PO — edits overwrite the synced note"
          className={`min-h-[8rem] w-full resize-y ${WORKSPACE_NESTED_FIELD} ${WORKSPACE_NESTED_FIELD_PAD} text-role-caption text-text-default placeholder:text-text-faint ${NOTES_TEXTAREA_FOCUS}`}
        />
        <div className="flex items-center justify-between gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-1 text-role-micro font-semibold uppercase tracking-wide text-blue-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Syncing from inventory…
            </span>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            {onSyncFromInventory ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSyncFromInventory}
                disabled={dirty || loading}
                icon={<Download className="h-3.5 w-3.5" />}
                title={
                  dirty
                    ? 'Save or discard edits first'
                    : 'Reload the latest synced note'
                }
              >
                Sync
              </Button>
            ) : null}
            {onSave ? (
              <Button
                variant="primary"
                size="sm"
                onClick={onSave}
                disabled={!dirty || saving || loading}
                loading={saving}
                icon={<Check className="h-3.5 w-3.5" />}
                title={
                  dirty
                    ? 'Save the note to the synced PO'
                    : 'Edit the note before saving'
                }
              >
                {saving ? 'Saving…' : 'Save to inventory'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </WorkspaceCard>
  );
}
