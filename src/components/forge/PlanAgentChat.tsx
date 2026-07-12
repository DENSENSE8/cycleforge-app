'use client';

/**
 * Plan-agent chat (ALP-3.4) — Vercel AI SDK `useChat` against
 * POST /api/forge/chat. Streams text + typed tool parts; mutations the agent
 * makes land in the shared Yjs doc and the plan region above updates live via
 * Ably (no refresh). This is the AI SDK beachhead — the global dock assistant
 * is a separate SSE stack and is not touched.
 */

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai';
import { Button } from '@/design-system/primitives';
import { Loader2 } from '@/components/Icons';

function ToolPartRow({ part }: { part: { type: string; state: string; output?: unknown } }) {
  const isMutate = part.type === 'tool-mutate_master_plan';
  const label = isMutate ? 'Updating master plan' : 'Reading master plan';
  if (part.state === 'output-available') {
    const out = (part.output ?? {}) as { ok?: boolean; ticketId?: string; previousStatus?: string; status?: string; error?: string };
    if (isMutate) {
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-micro font-black uppercase tracking-widest ring-1 ring-inset ${
            out.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
          }`}
        >
          {out.ok ? `${out.ticketId}: ${out.previousStatus ?? '—'} → ${out.status}` : `mutation failed: ${out.error}`}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-surface-sunken px-1.5 py-0.5 text-micro font-black uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
        read plan
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-micro font-semibold uppercase tracking-widest text-text-faint">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {label}…
    </span>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className="space-y-1.5">
      <p className="text-eyebrow font-black uppercase tracking-widest text-text-faint">
        {isUser ? 'You' : 'Plan agent'}
      </p>
      <div className="space-y-1.5">
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <p key={`${message.id}-${i}`} className="whitespace-pre-wrap text-caption leading-relaxed text-text-default">
                {part.text}
              </p>
            );
          }
          if (isToolUIPart(part)) {
            return (
              <div key={`${message.id}-${i}`}>
                <ToolPartRow part={part as unknown as { type: string; state: string; output?: unknown }} />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export function PlanAgentChat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/forge/chat' }),
  });
  const busy = status === 'submitted' || status === 'streaming';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput('');
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 text-eyebrow font-black uppercase tracking-[0.18em] text-text-faint">Plan agent</p>
      <div className="mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain border-t border-border-hairline pt-3">
        {messages.length === 0 && (
          <p className="text-caption text-text-muted">
            Ask the agent to read the plan or flip a ticket — e.g. “mark ALP-3.4 deployed”. Changes merge live into the
            plan for everyone.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {error && (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-3 py-2 text-caption text-rose-700">
            {error.message || 'The plan agent hit an error. Try again.'}
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="mt-3 flex shrink-0 items-center gap-2 border-t border-border-hairline pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the plan agent…"
          className="h-9 flex-1 rounded-lg border border-border-default bg-surface-card px-3 text-caption text-text-default placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!input.trim() || busy}>
          Send
        </Button>
      </form>
    </section>
  );
}
