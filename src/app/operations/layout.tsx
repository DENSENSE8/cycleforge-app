import type { ReactNode } from 'react';
import { DogfoodSurfaceGate } from '@/components/dogfood/DogfoodSurfaceGate';

export default function OperationsLayout({ children }: { children: ReactNode }) {
  return <DogfoodSurfaceGate surface="operations">{children}</DogfoodSurfaceGate>;
}
