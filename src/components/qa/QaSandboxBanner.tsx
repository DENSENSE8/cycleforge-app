'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Persistent sandbox-org banner. Not a "testing mode" toggle — it reports the
 * organization environment the server stamped on the session.
 */
export function QaSandboxBanner() {
  const { user, isLoaded, has } = useAuth();
  if (!isLoaded || !user) return null;
  if (user.organizationEnvironment !== 'sandbox') return null;

  const canOpen = has('developer.qa_tools.view');

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-role-micro text-amber-950 dark:text-amber-100"
    >
      <p className="min-w-0 truncate">
        <span className="font-semibold">Sandbox organization</span>
        <span className="text-amber-900/80 dark:text-amber-100/80">
          {' '}
          — not a customer workspace. Fixtures, dry-runs, and injected failures stay here.
        </span>
      </p>
      {canOpen ? (
        <Link
          href="/developer"
          className="shrink-0 font-medium text-amber-950 underline-offset-2 hover:underline dark:text-amber-50"
        >
          QA Console
        </Link>
      ) : null}
    </div>
  );
}
