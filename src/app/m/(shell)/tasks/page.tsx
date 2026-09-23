'use client';

/**
 * `/m/tasks` — retired 2026-09-23. Redirects to `/m/home`.
 *
 * Operator ruling: *"there should just be only one task system"*. Assigned
 * tasks (`work_assignments` `FOLLOW_UP`) and daily checks now render as ONE
 * list on `/m/home` — same row, same tick — so this route is no longer a
 * surface, only a door someone may still have bookmarked or deep-linked from
 * an older inbox notification.
 *
 * It stays as a redirect rather than a 404 because the phone's assigned-work
 * list did not disappear; it moved.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MobileTasksPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/m/home');
  }, [router]);

  return null;
}
