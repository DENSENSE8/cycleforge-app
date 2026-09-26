import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/current-user';
import { DataWipeStation } from '@/components/wipe/DataWipeStation';

/** /wipe — the data-wipe (secure-erase) station landing. */
export default async function WipePage() {
  const user = await getCurrentUser();
  if (!user) {
    const h = await headers();
    const path = h.get('x-pathname') || '/wipe';
    redirect(`/signin?next=${encodeURIComponent(path)}`);
  }

  return (
    <Suspense fallback={null}>
      <DataWipeStation staffId={String(user.staffId)} userName={user.name} />
    </Suspense>
  );
}
