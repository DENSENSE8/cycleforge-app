'use client';

import { Suspense } from 'react';
import { TaskBoard } from '@/features/task-board/TaskBoard';

/** Tasks (`/`, was Daily) — the follow-up desk: tasks, ticket follow-ups, the shift checklist, projects. */
export default function Home() {
  return (
    <Suspense>
      <TaskBoard />
    </Suspense>
  );
}
