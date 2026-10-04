'use client';

/**
 * A fenced ```tasks``` block — a live query inside a document (Notion-style
 * linked database, P6). Each row is the task as it is now: title, status pill,
 * due, owners, and its Definition of Done read from that task's own Brief, so
 * a reader can see one person's deliverables without anyone copying them in.
 */

import Link from 'next/link';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { TaskStatusPill } from '@/design-system/components/TaskStatusPill';
import { TASK_STATUS_FACE } from '@/design-system/tokens/task-status';
import { parseTasksQuery, tasksChartMermaid } from '@/lib/tasks/doc-live';
import { taskStatusOf } from '@/lib/tasks/task-status';
import { cn } from '@/utils/_cn';
import { ChecklistGlyph } from './ChecklistGlyph';
import { useDocTasksQuery } from './doc-live-scope';
import { TaskDueFace, taskDocHref } from './DocRefChip';
import { MermaidBlock } from './MermaidBlock';

const FRAME = 'my-3 rounded-mode border border-border-soft bg-surface-card';
const QUIET = 'px-3 py-2 text-role-caption text-text-muted';

/** The filter as a sentence, so the reader knows what the block asks. */
function querySummary(source: string): string {
  const parsed = parseTasksQuery(source);
  if (!parsed.ok) return 'Tasks';
  const { owners, project, status, ids, chart } = parsed.query;
  const parts = [
    ids.length ? `#T${ids.join(', #T')}` : null,
    owners.length ? owners.join(', ') : null,
    project ? `“${project}”` : null,
    status === 'all' ? null : status,
    chart === 'pie' ? 'by status' : chart === 'bar' ? 'done %' : null,
  ].filter(Boolean);
  return `Tasks · ${parts.join(' · ')}`;
}

export function TasksQueryBlock({ source }: { source: string }) {
  const { surface, result, error } = useDocTasksQuery(source);
  const nowMs = Date.now();
  const parsed = parseTasksQuery(source);
  const chart = parsed.ok ? parsed.query.chart : 'list';

  return (
    <section className={FRAME} data-doc-tasks-block aria-label={querySummary(source)}>
      <header className="flex items-center gap-2 border-b border-border-hairline px-3 py-1.5">
        <span className="text-role-micro font-semibold text-text-muted">{querySummary(source)}</span>
        {result?.ok ? <span className="ml-auto text-role-micro tabular-nums text-text-muted">{result.rows.length}</span> : null}
      </header>
      {result === undefined ? (
        <p className={QUIET}>{error ?? 'Reading tasks…'}</p>
      ) : !result.ok ? (
        <p role="alert" className={cn(QUIET, 'text-text-default')}>
          {result.error}
        </p>
      ) : result.rows.length === 0 ? (
        <p className={QUIET}>No tasks match.</p>
      ) : chart !== 'list' ? (
        // A chart of the SAME live rows — derived, never typed in (P6).
        <div className="px-3 pb-1">
          <MermaidBlock
            source={tasksChartMermaid(
              chart,
              result.rows.map((task) => ({
                title: task.title,
                statusLabel: TASK_STATUS_FACE[taskStatusOf(task)].label,
                dod: task.dod,
              })),
            )}
          />
        </div>
      ) : (
        <ul className="divide-y divide-border-hairline">
          {result.rows.map((task) => {
            const done = task.dod.items.filter((item) => item.done).length;
            return (
              <li key={task.id} className="px-3 py-2" data-doc-task-row={task.id}>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={taskDocHref(task.id, surface)}
                    className="min-w-0 flex-1 truncate text-role-data font-semibold text-text-default hover:underline"
                  >
                    {task.title}
                  </Link>
                  <TaskStatusPill status={taskStatusOf(task)} />
                  <TaskDueFace task={task} nowMs={nowMs} />
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold">
                    {task.owners.length === 0 ? (
                      <span className="text-text-muted">Unassigned</span>
                    ) : (
                      task.owners.map((owner, index) => (
                        <span key={owner.id}>
                          {index > 0 ? <span className="text-text-muted">, </span> : null}
                          <StaffBadge staffId={owner.id} name={owner.name.split(' ')[0]} />
                        </span>
                      ))
                    )}
                  </span>
                </div>
                {task.dod.items.length > 0 ? (
                  <div className="mt-1.5">
                    <p className="text-role-micro font-medium text-text-muted">
                      {task.dod.fromHeading ? 'Definition of done' : 'Checklist'} · {done}/{task.dod.items.length}
                    </p>
                    <ul className="mt-0.5 space-y-0.5">
                      {task.dod.items.map((item, index) => (
                        <li key={index} className="relative pl-5 text-role-caption leading-5 text-text-default">
                          <ChecklistGlyph checked={item.done} className="left-0 top-[3px]" />
                          <span className={item.done ? 'text-text-muted line-through' : undefined}>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-1 text-role-micro text-text-muted">No Definition of done in this task’s brief yet.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
