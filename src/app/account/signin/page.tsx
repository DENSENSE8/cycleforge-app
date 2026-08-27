'use client';

/**
 * /account/signin → /signin (canonical unified login).
 *
 * The account-level email/password/passkey flow now lives on the unified
 * `/signin` page (org-login-gate wave 3). This route is kept only as a
 * redirect so old links/bookmarks keep working; the API routes under
 * /api/auth/account/* are unchanged.
 *
 * Public: listed in PUBLIC_PATHS (src/proxy.ts) + CLIENT_PUBLIC_PATHS.
 */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function Redirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const qs = params.toString();
    router.replace(qs ? `/signin?${qs}` : '/signin');
  }, [router, params]);

  return null;
}

export default function AccountSignInRedirect() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
