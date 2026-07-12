import type { ReactNode } from 'react';
import { DogfoodSurfaceGate } from '@/components/dogfood/DogfoodSurfaceGate';

export default function WarehouseLayout({ children }: { children: ReactNode }) {
  return <DogfoodSurfaceGate surface="warehouse">{children}</DogfoodSurfaceGate>;
}
