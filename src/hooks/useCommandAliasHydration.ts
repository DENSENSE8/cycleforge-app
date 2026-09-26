'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { setCommandAliases } from '@/lib/stations/command-alias-store';

/** Load this tenant's command aliases once per session and hand them to the synchronous resolver. */
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
