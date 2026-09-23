'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAiChat } from '@/components/ai/useAiChat';
import AiChatConversation from '@/components/ai/AiChatConversation';
import { AiChatArtifactPane } from '@/components/ai/AiChatArtifactPane';
import { AI_CHAT_PROMPT_EVENT, AI_CHAT_NEW_EVENT } from '@/components/ai/ai-chat-events';

/**
 * Full-page assistant surface for /ai-chat. Conversation is the left work
 * plane; model-created tables and structured live-data answers are promoted
 * into the read-only artifact plane on the right. Both consume the same chat
 * state, so the export is a projection of the answer rather than a second data
 * fetch or a workflow-specific screen.
 */
export default function AiChatWorkspace() {
  const { has, isLoaded } = useAuth();
  const chat = useAiChat();
  const { send, reset } = chat;
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail.trim()) send(detail);
    };
    const onNew = () => reset();
    window.addEventListener(AI_CHAT_PROMPT_EVENT, onPrompt);
    window.addEventListener(AI_CHAT_NEW_EVENT, onNew);
    return () => {
      window.removeEventListener(AI_CHAT_PROMPT_EVENT, onPrompt);
      window.removeEventListener(AI_CHAT_NEW_EVENT, onNew);
    };
  }, [send, reset]);

  if (isLoaded && !has('dashboard.view')) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-role-caption font-semibold text-text-soft">
        Requires the “View dashboard” permission.
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col lg:flex-row"
      data-ai-chat-surface
      data-chat-ready={ready ? 'true' : 'false'}
    >
      <div className="flex min-h-0 min-w-0 flex-1 border-b border-border-hairline lg:border-b-0 lg:border-r" aria-label="Assistant chat">
        <AiChatConversation variant="full" chat={chat} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1">
        <AiChatArtifactPane messages={chat.messages} />
      </div>
    </div>
  );
}
