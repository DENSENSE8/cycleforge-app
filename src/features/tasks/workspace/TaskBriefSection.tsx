'use client';

/** Task evidence — the **Brief**: markdown instructions with Write/Preview editing and a read-only full-screen reader. */

import { useId, useState } from 'react';
import { ClipboardList, Maximize2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { MarkdownReaderSlideOver } from '@/design-system/components/MarkdownReaderSlideOver';
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
const LABEL = 'Brief';

export function TaskBriefSection({
  note,
  onSave,
  title,
  readerOpen: readerOpenProp,
  onReaderOpenChange,
  bare = false,
}: {
  note: string;
  /** Resolves once the PATCH lands; throws the refusal otherwise. */
  onSave: (next: string | null) => Promise<unknown>;
  /** The record's title — heads the reader (the section itself is always "Brief"). */
  title?: string;
  /** Controlled reader state (a board key opens it); omit to let the Expand verb own it. */
  readerOpen?: boolean;
  onReaderOpenChange?: (open: boolean) => void;
  /** No evidence-card chrome — a plain labelled field for the rail's Overview stack. */
  bare?: boolean;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [pane, setPane] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [readerOpenLocal, setReaderOpenLocal] = useState(false);
  const readerOpen = readerOpenProp ?? readerOpenLocal;
  const setReaderOpen = (open: boolean) => {
    if (readerOpenProp === undefined) setReaderOpenLocal(open);
    onReaderOpenChange?.(open);
  };
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
      toast.error(err instanceof Error ? err.message : 'Could not save the brief.');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    setPane('write');
    setDraft(note);
  };

  // The reader shows what is SAVED — a half-typed draft is not the brief yet.
  const action = editing ? null : (
    <div className="flex shrink-0 items-center gap-1">
      {note ? (
        <HoverTooltip label="Read full screen" asChild>
          <button
            type="button"
            aria-label="Read the brief full screen"
            className={cn(evidenceVerbClass(false), SMALL_VERB, 'px-2')}
            onClick={() => setReaderOpen(true)}
            data-testid="task-brief-expand"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </HoverTooltip>
      ) : null}
      <button type="button" className={cn(evidenceVerbClass(false), SMALL_VERB)} onClick={startEditing} data-testid="task-brief-edit">
        Edit
      </button>
    </div>
  );

  const body = editing ? (
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
            Task brief (markdown)
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
      <span className="text-role-data font-bold text-mode-ink">No brief yet</span>
      <span className="text-role-caption text-mode-muted">Write the steps in markdown so whoever picks it up can finish it.</span>
    </button>
  );

  const reader = (
    <MarkdownReaderSlideOver
      open={readerOpen}
      onClose={() => setReaderOpen(false)}
      title={title ?? LABEL}
      meta={title ? LABEL : undefined}
      content={note}
      onEdit={() => {
        setReaderOpen(false);
        startEditing();
      }}
    />
  );

  return bare ? (
    <section aria-label={LABEL} data-testid="task-brief" className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center gap-2">
        <h3 className="flex-1 text-role-micro font-medium text-text-muted">{LABEL}</h3>
        {action}
      </div>
      {body}
      {reader}
    </section>
  ) : (
    <EvidenceSection label={LABEL} testId="task-brief" card tone={note ? 'info' : 'neutral'} icon={<ClipboardList />} action={action}>
      {body}
      {reader}
    </EvidenceSection>
  );
}
