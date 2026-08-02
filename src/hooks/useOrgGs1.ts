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

/**
 * The tenant's resolved GS1 identity, for client surfaces that print.
 *
 * **This is the browser's only GLN.** The bin and rack label printers each kept
 * their own copy in `localStorage` until 2026-08-02 — a second source of truth
 * for a per-tenant fact, editable per browser, and silently able to disagree
 * with the value the print ladder and every interop projection actually read.
 * Both local fields were deleted; this hook replaced them.
 *
 * Degrade-not-fail: a failed or forbidden fetch resolves to `{ gln: '',
 * companyPrefix: '' }` rather than throwing. That is also the SAFE direction —
 * an absent GLN means `locationLabelPayload` falls back to the bare location
 * code, which scans identically in this app. A label that prints is worth more
 * than a label that was going to carry a GS1 AI.
 *
 * `staleTime: Infinity` because an org's GS1 identity changes roughly never,
 * and a printer refetching it per label would be pure noise.
 */
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
