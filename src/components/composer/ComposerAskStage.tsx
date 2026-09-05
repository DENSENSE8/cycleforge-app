'use client';

/**
 * Ask working set + thread — welded ABOVE the one StationComposerHost dock.
 * Never a Popover, Dialog, FAB, or nested composer.
 */

import { useEffect, useRef } from 'react';
import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { PageContextSection } from '@/components/assistant/PageContextSection';
import { RecentDetailStacksSection } from '@/components/assistant/RecentDetailStacksSection';
import { StudioNodeDetail } from '@/components/assistant/StudioNodeDetail';
import { AssistantEditsTray } from '@/components/assistant/AssistantEditsTray';
import type { AssistantChatState } from '@/components/assistant/useAssistantChat';
import { useActiveAssistantContext } from '@/hooks/useAssistantContext';
import { cn } from '@/utils/_cn';

const SUGGESTIONS = [
  'Why are units failing testing this week?',
  'Top return reasons this month',
  'How do we compare to typical?',
];

export function ComposerAskStage({ chat }: { chat: AssistantChatState }) {
  const context = useActiveAssistantContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isEmpty = chat.messages.length === 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.messages]);

  return (
    <div
      className="flex min-h-0 max-h-[min(52vh,28rem)] flex-col overflow-hidden"
      data-testid="composer-ask-stage"
      role="region"
      aria-label="Ask working set"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Working set</p>
        <Button variant="ghost" size="sm" onClick={chat.reset} ariaLabel="New conversation">
          New
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border-hairline">
        <PageContextSection variant="working-set" />
        <RecentDetailStacksSection />
        <div ref={scrollRef} className="flex flex-col px-3 py-2">
          {!isEmpty ? (
            <div className="space-y-2">
              {chat.messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-lg px-3 py-2 text-role-caption leading-5',
                    m.role === 'user'
                      ? 'ml-8 bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-100'
                      : m.error
                        ? 'mr-2 bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
                        : 'mr-8 bg-surface-canvas text-text-default ring-1 ring-inset ring-border-hairline',
                  )}
                >
                  <p className="whitespace-pre-wrap">
                    {m.content || (m.streaming ? '…' : '')}
                  </p>
                </div>
              ))}
              {chat.activeTool ? (
                <p className="flex items-center gap-1.5 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />{' '}
                  {chat.activeTool.replaceAll('_', ' ')}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-0.5 pb-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void chat.send(s, context)}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-role-caption font-medium text-text-muted hover:bg-surface-sunken"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <StudioNodeDetail />
        <AssistantEditsTray />
      </div>
    </div>
  );
}
