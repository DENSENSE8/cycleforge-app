/** POST /api/pipeline/trigger */

import { NextResponse } from 'next/server';
import { discoverTasks } from '@/lib/pipeline/discover';
import { REPO_PATH } from '@/lib/pipeline/config';
import { withAuth } from '@/lib/auth/withAuth';

export const runtime = 'nodejs';

export const POST = withAuth(async () => {
  const tasks = await discoverTasks(REPO_PATH);

  return NextResponse.json({
    ok: true,
    tasksDiscovered: tasks.length,
    tasks: tasks.map((t) => ({
      hash: t.hash,
      title: t.title,
      source: t.source,
      priority: t.priority,
      filePaths: t.filePaths,
    })),
    timestamp: new Date().toISOString(),
  });
}, { permission: 'admin.manage_features' });
