import type { ReactNode } from 'react';
import { DogfoodSurfaceGate } from '@/components/dogfood/DogfoodSurfaceGate';

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return <DogfoodSurfaceGate surface="inventory">{children}</DogfoodSurfaceGate>;
}
