import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { TechPageContent } from '@/components/tech/TechPageContent';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { getCurrentUser } from '@/lib/auth/current-user';

/** Quality Control page shell — mounted by `/test` and its legacy alias `/tech`. The Picker desk is `/pick`. */
export async function TechSurfacePage({
  fallbackPath = '/test',
}: {
  /** Path used to build the `?next=` on the belt-and-suspenders signin redirect. */
  fallbackPath?: string;
}) {
  const user = await getCurrentUser();
  if (!user) {
    const h = await headers();
    const path = h.get('x-pathname') || fallbackPath;
    redirect(`/signin?next=${encodeURIComponent(path)}`);
  }

  return (
    <Suspense fallback={null}>
      <SurfaceGate surfaceKey="test">
        <TechPageContent techId={String(user.staffId)} />
      </SurfaceGate>
    </Suspense>
  );
}
