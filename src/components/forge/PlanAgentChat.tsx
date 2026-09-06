'use client';

/**
 * Plan-agent chat (ALP-3.4) — Vercel AI SDK `useChat` against
 * POST /api/forge/chat. Streams text + typed tool parts; mutations the agent
 * makes land in the shared Yjs doc and the plan region updates live via Ably.
 *
 * Layout: thread scrolls in the center floor; composer is a centered
 * {@link OmnichannelComposerDock} (house Send SoT — middle is the work).
 */

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai';
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { Loader2 } from '@/components/Icons';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import { cn } from '@/utils/_cn';

function ToolPartRow({ part }: { part: { type: string; state: string; output?: unknown } }) {
  const isMutate = part.type === 'tool-mutate_master_plan';
  const label = isMutate ? 'Updating master plan' : 'Reading master plan';
  if (part.state === 'output-available') {
    const out = (part.output ?? {}) as {
      ok?: boolean;
      ticketId?: string;
      previousStatus?: string;
      status?: string;
      error?: string;
    };
    if (isMutate) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
            out.ok
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-rose-50 text-rose-700 ring-rose-200',
          )}
        >
          {out.ok
            ? `${out.ticketId}: ${out.previousStatus ?? '—'} → ${out.status}`
            : `mutation failed: ${out.error}`}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
        read plan
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-role-micro font-semibold uppercase tracking-widest text-text-faint">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {label}…
    </span>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className="space-y-1.5">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">
        {isUser ? 'You' : 'Plan agent'}
      </p>
      <div className="space-y-1.5 [&>*:last-child]:mb-0">
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div key={`${message.id}-${i}`}>
                {/* ONE renderer — plan-agent prose is markdown like every
                    other chat surface. Operator turns take the bubble face
                    (no heading tags); agent prose keeps heading scale. */}
                <MarkdownRenderer content={part.text} variant={isUser ? 'bubble' : 'prose'} />
              </div>
            );
          }
          if (isToolUIPart(part)) {
            return (
              <div key={`${message.id}-${i}`}>
                <ToolPartRow
                  part={part as unknown as { type: string; state: string; output?: unknown }}
                />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export function PlanAgentChat({
  className,
  seedHint,
}: {
  className?: string;
  /** Optional prefill when a TOC ticket is selected (does not auto-send). */
  seedHint?: string | null;
}) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/forge/chat' }),
  });
  const busy = status === 'submitted' || status === 'streaming';

  const commit = () => {
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput('');
  };

  const placeholder = seedHint
    ? `Ask about ${seedHint}…`
    : 'Message the plan agent…';

  return (
    <section className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col px-2">
        <p className="shrink-0 text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">
          Plan agent
        </p>
        <div className="mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain border-t border-border-hairline pt-3">
          {messages.length === 0 && (
            <p className="text-role-caption text-text-muted">
              Ask the agent to read the plan or flip a ticket — e.g. “mark ALP-3.4 deployed”. Changes
              merge live into the plan for everyone.
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {error && (
            <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-3 py-2 text-role-caption text-rose-700">
              {error.message || 'The plan agent hit an error. Try again.'}
            </div>
          )}
        </div>
        <div className="shrink-0 pt-3 pb-1">
          <OmnichannelComposerDock
            value={input}
            onChange={setInput}
            onCommit={commit}
            placeholder={placeholder}
            ariaLabel="Message the plan agent"
            disabled={busy}
            commitDisabled={!input.trim() || busy}
            commitAriaLabel="Send"
            commitTooltip="Send (Enter)"
            chrome="raised"
          />
        </div>
      </div>
    </section>
  );
}
