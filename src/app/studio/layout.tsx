import type { ReactNode } from 'react';
import { DogfoodSurfaceGate } from '@/components/dogfood/DogfoodSurfaceGate';

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <DogfoodSurfaceGate surface="studio">{children}</DogfoodSurfaceGate>;
}
