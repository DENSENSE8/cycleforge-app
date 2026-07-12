import type { ReactNode } from 'react';
import { DogfoodSurfaceGate } from '@/components/dogfood/DogfoodSurfaceGate';

/** Legacy `/ai` entry — same dogfood park as `/ai-chat`. */
export default function AiLayout({ children }: { children: ReactNode }) {
  return <DogfoodSurfaceGate surface="ai-chat">{children}</DogfoodSurfaceGate>;
}
