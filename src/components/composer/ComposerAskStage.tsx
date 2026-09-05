'use client';

/**
 * Desk Ask thread — welded above the desk mouth only. Station Ask lives in
 * {@link StationAskPane} (Unbox display), not here.
 */

import { AskThread } from './AskThread';
import type { AssistantChatState } from '@/components/assistant/useAssistantChat';

export function ComposerAskStage({ chat }: { chat: AssistantChatState }) {
  return (
    <div
      className="flex min-h-0 max-h-[min(52vh,28rem)] flex-col overflow-hidden"
      data-testid="composer-ask-stage"
      role="region"
      aria-label="Ask"
    >
      <AskThread chat={chat} emptyLabel="Ask about this page." />
    </div>
  );
}
