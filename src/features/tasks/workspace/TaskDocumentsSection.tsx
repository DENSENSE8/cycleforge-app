'use client';

/** Task evidence — **Documents**: */

import { useRef, useState } from 'react';
import { FileText, X } from '@/components/Icons';
import {
  EVIDENCE_CONTROL_CLASS,
  EvidenceSection,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  TASK_DOCUMENT_CONTENT_MAX,
  TASK_DOCUMENT_TITLE_MAX,
  type TaskDocumentCreateBody,
  type TaskDocumentMeta,
} from '@/lib/tasks/task-documents-shared';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { usePlanFiles } from '@/lib/tasks/use-task-workspace';

const SMALL_VERB = 'min-h-0 py-1';
const MARKDOWN_FILE = /\.(md|markdown|mdx|txt)$/i;

type AddMode = 'plan' | 'write' | null;

/** `SOP-returns.md` → `SOP returns`: the file's name, read as a title. */
function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, TASK_DOCUMENT_TITLE_MAX) || 'Document';
}

export function TaskDocumentsSection({
  documents,
  loading,
  onAdd,
  onRemove,
  onOpen,
}: {
  documents: readonly TaskDocumentMeta[];
  loading: boolean;
  /** Resolves on success; throws the operator-facing refusal otherwise. */
  onAdd: (body: TaskDocumentCreateBody) => Promise<unknown>;
  onRemove: (doc: TaskDocumentMeta) => void;
  onOpen: (doc: TaskDocumentMeta) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<AddMode>(null);
  const [busy, setBusy] = useState(false);
  const [planQuery, setPlanQuery] = useState('');
  const [writeTitle, setWriteTitle] = useState('');
  const [writeBody, setWriteBody] = useState('');
  const plans = usePlanFiles(planQuery.trim(), mode === 'plan');
  const linkedPaths = new Set(documents.flatMap((doc) => (doc.repoPath ? [doc.repoPath] : [])));

  const add = async (body: TaskDocumentCreateBody): Promise<boolean> => {
    setBusy(true);
    try {
      await onAdd(body);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not attach that document.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (files: readonly File[]) => {
    let added = 0;
    for (const file of files) {
      if (!MARKDOWN_FILE.test(file.name) && !file.type.startsWith('text/')) {
        toast.error(`${file.name} is not a markdown file.`);
        continue;
      }
      if (file.size > TASK_DOCUMENT_CONTENT_MAX) {
        toast.error(`${file.name} is too long to attach — link it as a plan file instead.`);
        continue;
      }
      if (await add({ source: 'upload', title: titleFromFileName(file.name), content: await file.text() })) added += 1;
    }
    if (added > 0) toast.success(`Attached ${added} document${added === 1 ? '' : 's'}`);
  };

  return (
    <EvidenceSection
      label="Documents"
      testId="task-documents"
      collapsible
      lazy
      tone={documents.length > 0 ? 'info' : 'neutral'}
      icon={<FileText />}
      summary={
        loading
          ? 'Loading documents…'
          : documents.length === 0
            ? 'No supporting documents'
            : `${documents.length} document${documents.length === 1 ? '' : 's'}`
      }
      action={
        <div className="flex gap-1">
          <button
            type="button"
            className={cn(evidenceVerbClass(false), SMALL_VERB)}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Upload .md
          </button>
          <button
            type="button"
            aria-pressed={mode === 'plan'}
            className={cn(evidenceVerbClass(mode === 'plan', mode === 'plan' ? 'info' : undefined), SMALL_VERB)}
            onClick={() => setMode(mode === 'plan' ? null : 'plan')}
            data-testid="task-documents-plan"
          >
            Plan file
          </button>
          <button
            type="button"
            aria-pressed={mode === 'write'}
            className={cn(evidenceVerbClass(mode === 'write', mode === 'write' ? 'info' : undefined), SMALL_VERB)}
            onClick={() => setMode(mode === 'write' ? null : 'write')}
          >
            Write
          </button>
        </div>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,.mdx,.txt,text/markdown,text/plain"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void uploadFiles(files);
        }}
        data-testid="task-documents-input"
      />

      {mode === 'plan' ? (
        <div className="mb-3 flex flex-col gap-1">
          <input
            value={planQuery}
            onChange={(event) => setPlanQuery(event.target.value)}
            placeholder="Search plan files — path or title"
            aria-label="Search plan files"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
            autoComplete="off"
            data-testid="task-plan-search"
          />
          <ul aria-label="Plan files" className="max-h-64 overflow-y-auto border border-mode-rule">
            {plans.isLoading ? <li className={cn(RECORD_LABEL_CLASS, 'px-2 py-1.5 text-mode-muted')}>Searching…</li> : null}
            {plans.data?.length === 0 ? (
              <li className={cn(RECORD_LABEL_CLASS, 'px-2 py-1.5 text-mode-muted')}>No plan file matches.</li>
            ) : null}
            {plans.data?.map((file) => {
              const linked = linkedPaths.has(file.path);
              return (
                <li key={file.path} className="border-b border-mode-rule last:border-b-0">
                  <button
                    type="button"
                    disabled={busy || linked}
                    onClick={() => void add({ source: 'repo', path: file.path })}
                    className={cn('flex w-full flex-col px-2 py-1.5 text-left hover:bg-mode-hover disabled:opacity-50', focusRing('control'))}
                  >
                    <span className="truncate text-role-data font-bold text-mode-ink">
                      {file.title}
                      {linked ? ' · linked' : ''}
                    </span>
                    <span className={cn(RECORD_ID_CLASS, 'truncate text-role-caption text-mode-muted')}>{file.path}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {mode === 'write' ? (
        <form
          className="mb-3 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add({ source: 'upload', title: writeTitle.trim(), content: writeBody }).then((ok) => {
              if (!ok) return;
              setWriteTitle('');
              setWriteBody('');
              setMode(null);
            });
          }}
        >
          <input
            value={writeTitle}
            onChange={(event) => setWriteTitle(event.target.value)}
            maxLength={TASK_DOCUMENT_TITLE_MAX}
            placeholder="Title"
            aria-label="Document title"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
          />
          <textarea
            value={writeBody}
            onChange={(event) => setWriteBody(event.target.value)}
            rows={8}
            placeholder="# Markdown"
            aria-label="Document markdown"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-full resize-y py-1.5 font-mono')}
          />
          <button
            type="submit"
            className={cn(evidenceVerbClass(true), 'self-end')}
            disabled={busy || !writeTitle.trim() || !writeBody.trim()}
          >
            Attach document
          </button>
        </form>
      ) : null}

      {documents.length === 0 && !loading && mode === null ? (
        <p className="text-role-data text-mode-muted">Add a markdown file, connect a plan, or write a short reference.</p>
      ) : null}
      <ul className="flex flex-col" aria-label="Documents">
        {documents.map((doc) => (
          <li key={doc.id} className="flex min-w-0 items-center gap-2 border-b border-mode-rule py-1.5 last:border-b-0">
            <span className={cn(RECORD_LABEL_CLASS, 'w-10 shrink-0 text-mode-muted')}>{doc.source === 'repo' ? 'Plan' : 'Doc'}</span>
            <button
              type="button"
              onClick={() => onOpen(doc)}
              className={cn('flex min-w-0 flex-1 items-center gap-2 text-left hover:underline', focusRing('control'))}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-mode-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-role-data font-bold text-mode-ink">{doc.title}</span>
                {doc.repoPath ? (
                  <span className={cn(RECORD_ID_CLASS, 'block truncate text-role-caption text-mode-muted')}>
                    {doc.repoPath}
                    {doc.sizeBytes == null ? ' · missing' : ''}
                  </span>
                ) : null}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${doc.title}`}
              onClick={() => onRemove(doc)}
              className={cn(
                'ds-raw-button inline-flex h-7 w-7 items-center justify-center text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
                focusRing('control'),
              )}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </EvidenceSection>
  );
}
