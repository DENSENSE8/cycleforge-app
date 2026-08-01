import { Suspense } from 'react';
import { HomeWorkspace } from '@/features/home/HomeWorkspace';

/**
 * Home (`/`) — the personal triage + collaboration workbench (plan §3.1). A
 * mode rail (Today | Tasks | Collab | Plan | Brief) over `?mode=` URL state;
 * `today` composes the real My Day feed, `forge` the live master-plan console.
 *
 * Unparked: bare `/` mounts the workspace instead of redirecting to the
 * dashboard, and the row ships in the Overview drill. The former deep-link
 * escape hatches (`?welcome=1`, any `?mode=`) are now just ordinary entry
 * points — `/forge` → `/?mode=forge&view=live` still lands the same way.
 *
 * `Suspense` wraps the client workspace because it reads `useSearchParams` for
 * the `?mode=` state (same mount shape as the Operations page).
 */
export default function Home() {
  return (
    <Suspense>
      <HomeWorkspace />
    </Suspense>
  );
}
