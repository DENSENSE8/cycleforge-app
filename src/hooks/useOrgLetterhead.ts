'use client';

/**
 * Client letterhead for on-screen repair / agreement previews.
 * Print routes load letterhead server-side; this keeps previews in sync
 * without hardcoding tenant address/phone.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { OrgLetterhead } from '@/lib/branding/letterhead';

export function useOrgLetterhead(): OrgLetterhead {
  const { user } = useAuth();
  // Empty when unauthenticated (kiosk device principal) — never paint the
  // product placeholder "Workspace" on customer repair paper.
  const orgName = user?.organizationName?.trim() || '';
  const [letterhead, setLetterhead] = useState<OrgLetterhead>({
    name: orgName,
    addressLine1: '',
    addressLine2: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    setLetterhead((prev) => ({ ...prev, name: orgName }));
  }, [orgName]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/org/letterhead', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as OrgLetterhead;
        if (cancelled) return;
        setLetterhead({
          name: data.name || orgName,
          addressLine1: data.addressLine1 ?? '',
          addressLine2: data.addressLine2 ?? '',
          phone: data.phone ?? '',
          email: data.email ?? '',
        });
      } catch {
        /* preview falls back to org name only */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orgName]);

  return letterhead;
}
