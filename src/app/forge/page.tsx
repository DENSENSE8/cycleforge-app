'use client';

/**
 * /forge — redirects into Operations ▸ Plans live console for the bridged
 * agentic-loop plan. Bookmarks and Hermes docs can keep using /forge; the
 * product home is Operations where ops_plans tables already live.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from '@/components/Icons';
import {
  MASTER_PLAN_OPS_TITLE,
  agenticLoopLiveHref,
  fetchPlansList,
} from '@/components/sidebar/operations/plans-shared';

export default function ForgePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const go = async () => {
      try {
        // Ensure the bridge has projected at least once (creates the Neon plan
        // if tickets exist). Safe no-op when the room is empty.
        await fetch('/api/forge/master-plan', { cache: 'no-store' }).catch(() => null);
        if (cancelled) return;

        const { plans } = await fetchPlansList('');
        if (cancelled) return;

        const bridged = plans.find((p) => p.title === MASTER_PLAN_OPS_TITLE);
        if (bridged) {
          router.replace(agenticLoopLiveHref(bridged.id));
          return;
        }

        // Plan not projected yet (no tickets / first boot) — land on Plans mode.
        router.replace('/operations?mode=plans');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not open Operations Plans');
        }
      }
    };

    void go();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      {error ? (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-caption text-rose-700">
          {error}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-caption text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening Operations ▸ Plans (live master plan)…
        </p>
      )}
    </div>
  );
}
