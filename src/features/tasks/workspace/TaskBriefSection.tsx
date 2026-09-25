'use client';

/**
 * Task evidence — **Instructions**: the description the assignee works from
 * (`work_assignments.notes`), written and read as MARKDOWN — numbered steps,
 * checklists, tables, code — because a job worth handing over is usually
 * more than a sentence.
 *
 * Read mode renders it (no raw HTML — see `MarkdownRenderer`). Edit mode is a
 * Write / Preview pair so the thrower sees what the floor will see before
 * saving. Editable after the throw: the first sentence typed at the composer
 * is rarely the whole instruction, and a handoff whose words cannot be
 * corrected gets re-thrown as a second task.
 *
 * Draft is `null` while pristine (the house pattern), so a server repaint
 * after a save never fights the operator's typing.
 */

import { useId, useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import {
  EVIDENCE_CONTROL_CLASS,
  EvidenceSection,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { TASK_NOTE_MAX } from '@/lib/tasks/create-task-core';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const SMALL_VERB = 'min-h-0 py-1';

export function TaskBriefSection({
  note,
  onSave,
}: {
  note: string;
  /** Resolves once the PATCH lands; throws the refusal otherwise. */
  onSave: (next: string | null) => Promise<unknown>;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [pane, setPane] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const editing = draft !== null;
  const value = draft ?? note;
  const changed = editing && draft.trim() !== note.trim();

  const save = async () => {
    if (!changed || saving) return;
    setSaving(true);
    try {
      await onSave(value.trim() || null);
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the instructions.');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    setPane('write');
    setDraft(note);
  };

  return (
    <EvidenceSection
      label="Instructions"
      testId="task-brief"
      action={
        editing ? null : (
          <button type="button" className={cn(evidenceVerbClass(false), SMALL_VERB)} onClick={startEditing} data-testid="task-brief-edit">
            Edit
          </button>
        )
      }
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <TabSwitch
            size="sm"
            fit="hug"
            tabs={[
              { id: 'write', label: 'Write' },
              { id: 'preview', label: 'Preview' },
            ]}
            activeTab={pane}
            onTabChange={(id) => setPane(id === 'preview' ? 'preview' : 'write')}
          />
          {pane === 'write' ? (
            <>
              <label htmlFor={fieldId} className="sr-only">
                Task instructions (markdown)
              </label>
              <textarea
                id={fieldId}
                value={value}
                maxLength={TASK_NOTE_MAX}
                rows={Math.min(16, Math.max(5, value.split('\n').length + 1))}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void save();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraft(null);
                  }
                }}
                placeholder={'1. Pull the unit from the bin\n2. Photograph the serial\n- [ ] Reply on the ticket'}
                className={cn(EVIDENCE_CONTROL_CLASS, 'w-full resize-y py-1.5 font-mono leading-relaxed')}
                data-testid="task-brief-input"
                autoFocus
              />
            </>
          ) : (
            <div className="min-h-24 border border-mode-rule px-3 py-2">
              {value.trim() ? <MarkdownRenderer content={value} /> : <p className="text-role-data text-mode-muted">Nothing to preview.</p>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span role="status" aria-live="polite" className="mr-auto text-role-caption text-mode-muted">
              Markdown · {changed ? '⌘↵ saves · Esc cancels' : 'No changes'}
            </span>
            <button type="button" className={cn(evidenceVerbClass(false), SMALL_VERB)} disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={cn(evidenceVerbClass(true), SMALL_VERB)}
              disabled={!changed || saving}
              onClick={() => void save()}
              data-testid="task-brief-save"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : note ? (
        <div className="max-w-none" data-testid="task-brief-view">
          <MarkdownRenderer content={note} />
        </div>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className={cn(
            'flex w-full flex-col items-start gap-1 rounded-mode border border-dashed border-mode-control bg-mode-well px-3 py-3 text-left',
            focusRing('control'),
          )}
        >
          <span className="text-role-data font-bold text-mode-ink">No instructions yet</span>
          <span className="text-role-caption text-mode-muted">Write the steps in markdown so whoever picks it up can finish it.</span>
        </button>
      )}
    </EvidenceSection>
  );
}
