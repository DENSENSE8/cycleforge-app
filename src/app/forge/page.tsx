import { Suspense } from 'react';
import { AgenticLoopLiveConsole } from '@/components/forge/AgenticLoopLiveConsole';

/** `/forge` — Plans Live: */
export default function ForgePage() {
  return (
    <Suspense>
      <div className="flex h-[calc(100vh-64px)] min-h-0 flex-col overflow-hidden bg-surface-canvas px-4 py-4">
        <AgenticLoopLiveConsole />
      </div>
    </Suspense>
  );
}
