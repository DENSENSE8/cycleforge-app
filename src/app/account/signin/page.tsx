'use client';

/** /account/signin → /signin (canonical unified login). */

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
