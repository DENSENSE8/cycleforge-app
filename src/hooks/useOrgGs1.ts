'use client';

import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';

interface OrgGs1Identity {
  /** The tenant's licensed GLN, or '' when they hold none (the common case). */
  gln: string;
  /** The tenant's licensed GS1 Company Prefix, or ''. */
  companyPrefix: string;
}

const EMPTY: OrgGs1Identity = { gln: '', companyPrefix: '' };

/** The tenant's resolved GS1 identity, for client surfaces that print. */
export function useOrgGs1(): { identity: OrgGs1Identity; loading: boolean } {
  const { data, isPending } = useQuery({
    queryKey: qk.orgGs1.identity(),
    queryFn: async (): Promise<OrgGs1Identity> => {
      const res = await fetch('/api/org/gs1', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return EMPTY;
      const body = (await res.json()) as Partial<OrgGs1Identity>;
      return { gln: body.gln ?? '', companyPrefix: body.companyPrefix ?? '' };
    },
    staleTime: Infinity,
    retry: false,
  });

  return { identity: data ?? EMPTY, loading: isPending };
}
