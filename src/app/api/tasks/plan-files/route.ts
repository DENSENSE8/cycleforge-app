/**
 * `/api/tasks/plan-files` — the markdown plan files in this codebase a task
 * may link as a `repo` document (`docs/**`, `master-plan.mdx`, root `*.md`).
 *
 * GET ?q= → `PlanFilesPayload`, sorted by path; `q` filters path + title.
 *
 * The allowlist and the disk walk live in `src/lib/tasks/plan-files.ts`.
 *
 * PERMISSION — `work_orders.claim`, the gate every task verb uses.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { listPlanFiles } from '@/lib/tasks/plan-files';
import type { PlanFilesPayload } from '@/lib/tasks/task-documents-shared';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async (req: NextRequest) => {
    try {
      const q = req.nextUrl.searchParams.get('q') ?? undefined;
      const payload: PlanFilesPayload = { ok: true, files: await listPlanFiles(q) };
      return NextResponse.json(payload);
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks/plan-files');
    }
  },
  { permission: 'work_orders.claim' },
);
