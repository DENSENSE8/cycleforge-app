import type { ReactNode } from 'react';
import { DogfoodSurfaceGate } from '@/components/dogfood/DogfoodSurfaceGate';

export default function SourcingLayout({ children }: { children: ReactNode }) {
  return <DogfoodSurfaceGate surface="sourcing">{children}</DogfoodSurfaceGate>;
}
