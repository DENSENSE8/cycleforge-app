'use client';

/**
 * Synced PO-note editor — carton-level note on the linked purchase order.
 *
 * Flush Displays body (no WorkspaceCard glass island) — parent push column
 * owns {@link DISPLAYS_BODY_INSET}. Save / Sync stay local in this footer;
 * the panel dock is carton-terminal (Print · Receive).
 */

import { Check, Download, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
} from '@/design-system/components';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


const NOTES_TEXTAREA_FOCUS =
  focusRing('field', 'accent');

const FLUSH_HOST_CLASS = cn('min-w-0', cornerClass('flush'));

/**
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
    <div className={FLUSH_HOST_CLASS}>
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
    </div>
  );
}
