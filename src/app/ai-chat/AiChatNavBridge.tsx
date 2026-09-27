'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionHeader } from '@/components/session/session-title-store';
import { AI_CHAT_NEW_EVENT } from '@/lib/app-events';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { usePublishNavLiveRecent } from '@/lib/nav/recents/live';
import { assistantSessionRecentRow } from '@/lib/nav/recents/assistant-sessions';

/**
 * What `/ai-chat` hands the contextual sidebar — through the generic seams,
 * never a sidebar component of its own:
 * - `ai-chat:new` (the `chat.new` verb): the old Chat-row `+`, verbatim —
 *   `AI_CHAT_NEW_EVENT`, then `/ai-chat?new=1`;
 * - the live thread as `assistant.sessions`' live record, so it tops Today
 *   (and lights) before its first server row lands.
 */
export function AiChatNavBridge() {
  const router = useRouter();
  useNavIntent('ai-chat:new', () => {
    window.dispatchEvent(new CustomEvent(AI_CHAT_NEW_EVENT));
    router.push('/ai-chat?new=1');
  });

  const { sessionId, title } = useSessionHeader();
  const live = useMemo(
    () => (sessionId ? assistantSessionRecentRow({ id: sessionId, title, updatedAt: new Date().toISOString() }) : null),
    [sessionId, title],
  );
  usePublishNavLiveRecent('assistant.sessions', live);
  return null;
}
