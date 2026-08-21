'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { setCommandAliases } from '@/lib/stations/command-alias-store';

/**
 * Load this tenant's command aliases once per session and hand them to the
 * synchronous resolver.
 *
 * Mounted at the app root, beside the global wedge listener. Aliases ride with
 * the session the way the permission set does, and for the same reason: the
 * scan path has to answer "is this a command?" in the same tick the trigger was
 * pulled, so the answer must already be in memory.
 *
 * A failure is silent by design. Built-in codes keep working from the code
 * registries; only custom names are unavailable, and an unresolved custom code
 * nacks with "unknown command" — which is the honest thing to tell an operator
 * whose alias list did not load.
 */
export function useCommandAliasHydration(): void {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['station-command-aliases'],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/station-commands/aliases');
      if (!res.ok) return { aliases: [] };
      return (await res.json()) as {
        aliases?: Array<{
          code: string;
          target_code: string;
          label: string;
          sort_order: number;
        }>;
      };
    },
  });

  useEffect(() => {
    if (!data?.aliases) return;
    setCommandAliases(
      data.aliases.map((a) => ({
        code: a.code,
        targetCode: a.target_code,
        label: a.label,
        sortOrder: a.sort_order,
      })),
    );
  }, [data]);
}
