import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { TechPageContent } from '@/components/tech/TechPageContent';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { getCurrentUser } from '@/lib/auth/current-user';

/** Shared Testing-surface page shell — mounted by BOTH `/tech` (legacy) and `/test` (the first-class Test surface, Studio-driven operator… */
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
