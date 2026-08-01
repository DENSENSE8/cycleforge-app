import type { ReactNode } from 'react';
import { DogfoodSurfaceGate } from '@/components/dogfood/DogfoodSurfaceGate';

export default function AiChatLayout({ children }: { children: ReactNode }) {
  return <DogfoodSurfaceGate surface="ai-chat">{children}</DogfoodSurfaceGate>;
}
