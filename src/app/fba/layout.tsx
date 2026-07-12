import type { ReactNode } from 'react';
import { DogfoodSurfaceGate } from '@/components/dogfood/DogfoodSurfaceGate';

export default function FbaLayout({ children }: { children: ReactNode }) {
  return <DogfoodSurfaceGate surface="fba">{children}</DogfoodSurfaceGate>;
}
