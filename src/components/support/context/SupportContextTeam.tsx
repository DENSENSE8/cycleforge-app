'use client';

import { ThreadPanel, type ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { EmptyState } from '@/design-system/primitives';
import { MessageSquare } from '@/components/Icons';
import type { SupportContextBundle } from '@/lib/support/context-types';

export function SupportContextTeam({
  bundle,
  dense = false,
  externalSubmit = false,
  onBridgeChange,
}: {
  bundle: SupportContextBundle;
  dense?: boolean;
  externalSubmit?: boolean;
  onBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
}) {
  const thread = bundle.thread;
  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<MessageSquare className="h-6 w-6 text-text-faint" />}
          title="No team thread yet"
          description="Open a receiving line or order to start an internal conversation."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ThreadPanel
        entityType={thread.entityType}
        entityId={thread.entityId}
        dense={dense}
        externalSubmit={externalSubmit}
        onBridgeChange={onBridgeChange}
      />
    </div>
  );
}
