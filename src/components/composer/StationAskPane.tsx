'use client';

/**
 * Ask surface in the Unbox workbench — same occupancy as {@link StationTicketPane}.
 * The composer dock stays the mouth; this pane is the org-scoped Ask conversation.
 */

import { AskThread } from './AskThread';
import { useAssistantChat } from '@/components/assistant/useAssistantChat';
import { cn } from '@/utils/_cn';

export function StationAskPane({ className }: { className?: string }) {
  const chat = useAssistantChat({ shared: 'station' });

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-card',
        className,
      )}
      data-testid="station-ask-pane"
    >
      <AskThread chat={chat} emptyLabel="Ask about this workspace." />
    </div>
  );
}
