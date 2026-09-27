import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { PickPageContent } from '@/components/pick/PickPageContent';
import { getCurrentUser } from '@/lib/auth/current-user';

/** Picker desk page shell (`/pick`) — scan band + shipping workspace. The phone twin is `/m/pick`. */
export async function PickSurfacePage() {
  const user = await getCurrentUser();
  if (!user) {
    const h = await headers();
    const path = h.get('x-pathname') || '/pick';
    redirect(`/signin?next=${encodeURIComponent(path)}`);
  }

  return (
    <Suspense fallback={null}>
      <PickPageContent pickerId={String(user.staffId)} />
    </Suspense>
  );
}
