'use client';

/**
 * Ask transcript — Composer / Claude / ChatGPT grammar:
 * the operator's turn is a bubble; the model is display copy, not a second card.
 */

import { useEffect, useRef } from 'react';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import type { AssistantChatState } from '@/components/assistant/useAssistantChat';
import { ChatPrintJobCard } from '@/components/assistant/ChatPrintJobCard';
import { NO_ANSWER_FALLBACK } from '@/lib/assistant/turn-trace';

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
                <div className="max-w-[min(36rem,85%)] rounded-2xl bg-surface-info px-3 py-2 text-role-caption leading-5 text-text-info ring-1 ring-inset ring-border-info [&>*:last-child]:mb-0">
                  {/* ONE renderer: the operator's markdown formats in the
                      bubble exactly as the model's formats below it. Bubble
                      face: no heading tags inside a chat bubble. */}
                  <MarkdownRenderer content={m.content} variant="bubble" />
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex min-w-0 flex-col gap-2">
                {m.error ? (
                  // Error copy stays plain — it is UI text, not prose.
                  <p className="whitespace-pre-wrap text-role-caption leading-6 text-text-danger">{m.content}</p>
                ) : (
                  <div className="min-w-0 [&>*:last-child]:mb-0">
                    {/* A turn that worked but found no answer says so — never an empty reply. */}
                    <MarkdownRenderer
                      content={m.content || (m.streaming ? '…' : m.steps.length > 0 ? NO_ANSWER_FALLBACK : '')}
                    />
                  </div>
                )}
                {chat.printJobs
                  .filter((job) => job.messageId === m.id)
                  .map((job) => (
                    <ChatPrintJobCard key={job.id} job={job} setPhase={chat.setPrintPhase} />
                  ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
