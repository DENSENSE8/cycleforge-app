'use client';

/**
 * The task record's **Docs** tab — the task's documents (the Brief is the
 * short note on Overview; a Doc is the long plan beside it). Each row opens
 * the document editor (`TaskDocumentEditor`); "New doc" starts blank or from
 * the Master plan template (Goal · Definition of done per owner ·
 * Deliverables · a live tasks block · a status pie derived from those tasks).
 */

import { useState } from 'react';
import { ChevronDown, FileText, Plus, Trash2 } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { requestConfirm } from '@/design-system/components/confirm';
import { Button, IconButton } from '@/design-system/primitives';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/design-system/primitives/DropdownMenu';
import { masterPlanTemplate } from '@/lib/tasks/doc-templates';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import type { TaskDocumentMeta } from '@/lib/tasks/task-documents-shared';
import { useTaskDocuments } from '@/lib/tasks/use-task-workspace';
import { toast } from '@/lib/toast';
import { TaskDocumentEditor } from './TaskDocumentEditor';

function caption(doc: TaskDocumentMeta): string {
  if (doc.source === 'repo') return doc.repoPath ?? 'Plan file';
  const when = new Date(doc.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${doc.createdBy ? `${doc.createdBy.name} · ` : ''}updated ${when}`;
}

export function TaskDocsTab({ task, title }: { task: TaskDeskRow; title: string }) {
  const { user } = useAuth();
  const docs = useTaskDocuments(task.id);
  const [openDocId, setOpenDocId] = useState<number | null>(null);

  const create = async (template: 'blank' | 'master') => {
    const docTitle = template === 'master' ? `${title} — Master plan` : 'Untitled doc';
    const content =
      template === 'master'
        ? masterPlanTemplate({ title: docTitle, owners: task.assignees, projectName: task.projectName })
        : `# ${docTitle}\n\n`;
    try {
      const doc = await docs.add.mutateAsync({ source: 'upload', title: docTitle.slice(0, 200), content });
      setOpenDocId(doc.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the doc.');
    }
  };

  return (
    <section aria-label="Docs" className="flex flex-col gap-3 pt-1" data-testid="task-docs">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-role-micro font-medium text-text-muted">Docs</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              iconRight={<ChevronDown className="h-3.5 w-3.5" />}
              loading={docs.add.isPending}
              data-testid="task-docs-new"
            >
              New doc
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void create('blank')} data-testid="task-docs-new-blank">
              Blank
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void create('master')} data-testid="task-docs-new-master">
              Master plan
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {docs.loading ? <p className="text-role-caption text-text-muted">Loading docs…</p> : null}
      {!docs.loading && docs.documents.length === 0 ? (
        <p className="text-role-caption text-text-muted">
          No docs yet. A doc holds the long plan — owners’ definitions of done, live task lists, charts and comments.
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border-hairline rounded-mode border border-border-hairline bg-surface-card">
        {docs.documents.map((doc) => (
          <li key={doc.id} className="flex items-center gap-2 px-3 py-2">
            <FileText aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
            {/* ds-raw-button: the row's title is the door into the document */}
            <button
              type="button"
              onClick={() => setOpenDocId(doc.id)}
              className="min-w-0 flex-1 text-left"
              data-testid="task-docs-open"
            >
              <span className="block truncate text-role-data font-semibold text-text-default hover:underline">{doc.title}</span>
              <span className="block truncate text-role-micro text-text-muted">{caption(doc)}</span>
            </button>
            <IconButton
              ariaLabel={`Remove ${doc.title}`}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() =>
                void requestConfirm({
                  title: 'Remove this doc?',
                  description: `“${doc.title}” and its comments leave this task.`,
                  confirmLabel: 'Remove',
                  tone: 'danger',
                }).then((ok) => {
                  if (ok) docs.remove.mutate(doc.id);
                })
              }
              className="rounded-md p-1.5 text-text-muted hover:bg-surface-strong hover:text-text-default"
            />
          </li>
        ))}
      </ul>

      <TaskDocumentEditor
        taskId={task.id}
        docId={openDocId}
        viewerStaffId={user?.staffId ?? null}
        onClose={() => setOpenDocId(null)}
      />
    </section>
  );
}
