'use client';

/**
 * Ask transcript — Composer / Claude / ChatGPT grammar:
 * the operator's turn is a bubble; the model is display copy, not a second card.
 */

import { useEffect, useRef } from 'react';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import type { AssistantChatState } from '@/components/assistant/useAssistantChat';

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
                <div className="max-w-[min(36rem,85%)] rounded-2xl bg-blue-50 px-3 py-2 text-role-caption leading-5 text-blue-900 ring-1 ring-inset ring-blue-100 [&>*:last-child]:mb-0">
                  {/* ONE renderer: the operator's markdown formats in the
                      bubble exactly as the model's formats below it. Bubble
                      face: no heading tags inside a chat bubble. */}
                  <MarkdownRenderer content={m.content} variant="bubble" />
                </div>
              </div>
            ) : m.error ? (
              <div key={m.id} className="min-w-0">
                {/* Error copy stays plain — it is UI text, not prose. */}
                <p className="whitespace-pre-wrap text-role-caption leading-6 text-rose-700">{m.content}</p>
              </div>
            ) : (
              <div key={m.id} className="min-w-0 [&>*:last-child]:mb-0">
                <MarkdownRenderer content={m.content || (m.streaming ? '…' : '')} />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
