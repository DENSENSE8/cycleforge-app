'use client';

import { useEffect } from 'react';
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { setCommandAliases } from '@/lib/stations/command-alias-store';

interface CommandAliasPayload {
  aliases?: Array<{
    code: string;
    target_code: string;
    label: string;
    sort_order: number;
  }>;
}

const commandAliasesQuery = queryOptions({
  queryKey: ['station-command-aliases'],
  staleTime: 5 * 60_000,
  queryFn: async (): Promise<CommandAliasPayload> => {
    const res = await fetch('/api/station-commands/aliases');
    if (!res.ok) return { aliases: [] };
    return (await res.json()) as CommandAliasPayload;
  },
});

function hydrate(data: CommandAliasPayload): void {
  setCommandAliases(
    (data.aliases ?? []).map((a) => ({
      code: a.code,
      targetCode: a.target_code,
      label: a.label,
      sortOrder: a.sort_order,
    })),
  );
}

/**
 * Load this tenant's command aliases once per session and hand them to the synchronous resolver.
 * `enabled` belongs to the consumer: the desk shell and every station composer hydrate at mount;
 * a surface without one (the phone shell) loads on demand via {@link loadCommandAliases}.
 */
export function useCommandAliasHydration(enabled = true): void {
  const { user } = useAuth();

  const { data } = useQuery({ ...commandAliasesQuery, enabled: enabled && Boolean(user) });

  useEffect(() => {
    if (data?.aliases) hydrate(data);
  }, [data]);
}

/** The first unknown `CMD-*` scan on a surface that never hydrated: fetch the book (shared cache) and hydrate now. */
export async function loadCommandAliases(queryClient: QueryClient): Promise<void> {
  hydrate(await queryClient.fetchQuery(commandAliasesQuery));
}
