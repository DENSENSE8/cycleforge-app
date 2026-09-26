'use client';

/** SurfaceGate — decides at render time whether an operator surface shows its data-driven composition (SurfaceRenderer) or its hard-coded… */

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import type { SurfaceKey } from '@/lib/stations/surface-keys';

// The composed branch is live but OFF the default paint:
const SurfaceRenderer = dynamic(
  () => import('./SurfaceRenderer').then((m) => m.SurfaceRenderer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface-canvas" />
    ),
  },
);

interface SurfaceResolveResp {
  success?: boolean;
  render?: 'legacy' | 'composed';
}

function surfaceResolveQuery(surfaceKey: SurfaceKey) {
  return {
    queryKey: ['surface-resolve', surfaceKey] as const,
    queryFn: async (): Promise<SurfaceResolveResp> => {
      try {
        const res = await fetch(`/api/surfaces/${surfaceKey}/resolve`, { cache: 'no-store' });
        if (!res.ok) return { render: 'legacy' as const };
        return (await res.json()) as SurfaceResolveResp;
      } catch {
        return { render: 'legacy' as const };
      }
    },
    // Composition changes on publish; a long staleTime + no refetch loop.
    staleTime: 5 * 60_000,
  };
}

export function SurfaceGate({
  surfaceKey,
  children,
}: {
  surfaceKey: SurfaceKey;
  children: ReactNode;
}) {
  const { data } = useQuery(surfaceResolveQuery(surfaceKey));
  if (data?.render === 'composed') return <SurfaceRenderer surfaceKey={surfaceKey} />;
  return <>{children}</>;
}
