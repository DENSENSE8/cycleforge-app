'use client';

/**
 * Ask transcript — Composer / Claude / ChatGPT grammar:
 * the operator's turn is a bubble; the model is display copy, not a second card.
 */

import { useEffect, useRef } from 'react';
import type { AssistantChatState } from '@/components/assistant/useAssistantChat';
import { cn } from '@/utils/_cn';

export function AskThread({
  chat,
  emptyLabel = 'Ask about this workspace.',
}: {
  chat: AssistantChatState;
  emptyLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isEmpty = chat.messages.length === 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.messages]);

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
      data-testid="ask-thread"
    >
      {isEmpty ? (
        <p className="text-role-caption text-text-faint">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {chat.messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <p
                  className={cn(
                    'max-w-[min(36rem,85%)] rounded-2xl px-3 py-2 text-role-caption leading-5',
                    'bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-100',
                  )}
                >
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={m.id} className="min-w-0">
                <p
                  className={cn(
                    'whitespace-pre-wrap text-role-caption leading-6 text-text-default',
                    m.error && 'text-rose-700',
                  )}
                >
                  {m.content || (m.streaming ? '…' : '')}
                </p>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
