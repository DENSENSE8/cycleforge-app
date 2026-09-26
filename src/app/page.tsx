import { Suspense } from 'react';
import { HomeWorkspace } from '@/features/home/HomeWorkspace';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/** Daily (`/`, was Home) — the start-of-shift checklist, single surface. */
export default function Home() {
  return (
    <Suspense>
      <ModeRegion mode="industrial" className="contents">
        <HomeWorkspace />
      </ModeRegion>
    </Suspense>
  );
}
