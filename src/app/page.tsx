import { Suspense } from 'react';
import { HomeWorkspace } from '@/features/home/HomeWorkspace';

/** Daily (`/`, was Home) — the start-of-shift checklist, single surface. */
export default function Home() {
  return (
    <Suspense>
      <HomeWorkspace />
    </Suspense>
  );
}
