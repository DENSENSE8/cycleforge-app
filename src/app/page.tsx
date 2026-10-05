import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TaskBoard } from '@/features/task-board/TaskBoard';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { supportHref } from '@/lib/nav/route-tree';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || null;
}

/** The retired Tasks → Support view ids that read as a local status on /support; every other id keeps its name. */
const LEGACY_VIEW_STATUS: Readonly<Record<string, string>> = {
  waiting: 'pending',
  resolved: 'solved,closed',
};

/** `task=<work_assignments.id>` → the Support item whose primary task it is, read in the caller's org; null when none. */
async function supportItemForTask(rawTask: string | null): Promise<number | null> {
  const taskId = rawTask && /^\d{1,15}$/.test(rawTask) ? Number(rawTask) : null;
  if (taskId == null || taskId <= 0 || !Number.isSafeInteger(taskId)) return null;
  const user = await getCurrentUserBySid(readSessionSid(await cookies()));
  if (!user) return null;
  const orgId = user.organizationId as OrgId;
  const { rows } = await tenantQuery<{ id: number | string }>(
    orgId,
    `SELECT id FROM support_tickets WHERE organization_id = $1::uuid AND primary_task_id = $2 LIMIT 1`,
    [orgId, taskId],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * Tasks (`/`, was Daily) — the follow-up desk: tasks, the shift checklist, projects. Support lives on
 * /support: the legacy `/?tab=ticket[&view=][&task=][&q=]` door forwards there server-side, and so does a
 * `/?task=` link that names a Support item's primary task (the board never lists those).
 */
export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const item = await supportItemForTask(first(params.task));
  if (first(params.tab) === 'ticket') {
    const view = first(params.view);
    const status = view ? (LEGACY_VIEW_STATUS[view] ?? null) : null;
    redirect(supportHref({ q: first(params.q), view: status ? null : view, status, item }));
  }
  if (item != null) redirect(supportHref({ item }));
  return (
    <Suspense>
      <TaskBoard />
    </Suspense>
  );
}
