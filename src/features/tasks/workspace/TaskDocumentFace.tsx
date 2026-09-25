'use client';

/**
 * One task document, full height in the evidence column — the plan or SOP
 * read as a page, rendered from markdown (no raw HTML). A linked plan file is
 * fetched as it is NOW on every open, so an edited plan reads its new words.
 */

import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { useTaskDocument } from '@/lib/tasks/use-task-workspace';

export function TaskDocumentFace({ taskId, docId }: { taskId: number; docId: number }) {
  const doc = useTaskDocument(taskId, docId);

  if (doc.isLoading) return <EvidenceNotice>Loading document…</EvidenceNotice>;
  if (doc.isError || !doc.data) {
    return <EvidenceNotice tone="warn">{doc.error instanceof Error ? doc.error.message : 'Could not load the document.'}</EvidenceNotice>;
  }
  const { title, repoPath, content } = doc.data;

  return (
    <article className="flex flex-col" data-testid="task-document-face">
      <header className="border-b border-mode-rule px-4 py-2">
        <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>{repoPath ? 'Plan file' : 'Document'}</p>
        <h3 className="text-role-body font-bold text-mode-ink">{title}</h3>
        {repoPath ? <p className={cn(RECORD_ID_CLASS, 'select-all break-all text-role-caption text-mode-muted')}>{repoPath}</p> : null}
      </header>
      {content == null ? (
        <EvidenceNotice tone="warn">This plan file no longer exists in the codebase.</EvidenceNotice>
      ) : (
        <div className="px-4 py-3">
          <MarkdownRenderer content={content} />
        </div>
      )}
    </article>
  );
}
