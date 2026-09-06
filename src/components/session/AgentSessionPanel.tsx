'use client';

/**
 * AgentSessionPanel — the LEFT side of home: the chat itself. Dedicated
 * nothing — search, recents, and the session name live in the GLOBAL HEADER
 * (SessionSwitcher, published via useHeader panelContent); the New
 * conversation verb routes through ⌘N / Ctrl+N, the sidebar nav entry
 * (`/?new=1`), and the header switcher. The panel is chat only: transcript,
 * suggestions, composer mouth.
 *
 * Streaming reuses useAssistantChat + /api/assistant/chat unchanged. Old
 * threads load READ-ONLY from /api/ai/chat-sessions/[id]/messages — opened via
 * `/?session=<id>` (URL-as-state; the header switcher navigates there).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUp, Loader2, Mic, Sparkles } from '@/components/Icons';
import { ComposerContextRing } from '@/components/composer/ComposerContextRing';
import { ComposerPlusMenuPanel } from '@/components/composer/ComposerPlusMenu';
import { StationComposerHost } from '@/components/composer/StationComposerHost';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import { Button } from '@/design-system/primitives';
import { motion, useReducedMotion } from '@/design-system/motion';
import { useActiveAssistantContext, useAssistantContext } from '@/hooks/useAssistantContext';
import { cn } from '@/utils/_cn';
import { useAssistantChat } from '@/components/assistant/useAssistantChat';
import { requestComposerSeed, getLatestComposerSeed } from '@/lib/assistant/composer-seed-store';
import { extractGfmTables, type ArtifactTable } from '@/lib/assistant/ui-artifacts';
import { AI_CHAT_NEW_EVENT, SESSION_ARTIFACT_EVENT } from '@/lib/app-events';
import { toolActivityPhrase } from '@/lib/assistant/tool-activity';
import { publishSessionTitle } from './session-title-store';
import { SessionPlusMenu } from './SessionPlusMenu';

interface HistoryMessage {
  id: number;
  role: string;
  content: string;
}

/**
 * The empty-state teaching row. Daily · Today · Tasks stopped being home
 * MODES on 2026-09-05 and became answers, so the first thing an operator sees
 * is the sentence that produces each of them (`get_daily_checks`,
 * `get_my_day`, `get_project_tasks` → `render_artifact`).
 */
const SUGGESTIONS = [
  "What's on my day?",
  "Did the team run today's daily checks?",
  'My open project tasks',
];

export function AgentSessionPanel({
  className,
  variant = 'split',
  onStartedChange,
}: {
  className?: string;
  /**
   * `start` = the Grok/Codex-style landing: one centered column (greeting ·
   * composer · suggestions) owns the whole width until the first message,
   * then the surface morphs to the split panes. `split` = the permanent
   * chat-left / view-right layout.
   */
  variant?: 'start' | 'split';
  /** Fires when the first message starts (or a reset returns to) the start state. */
  onStartedChange?: (started: boolean) => void;
}) {
  const context = useActiveAssistantContext();
  // The surface registers ITSELF so the model knows the view panel is mounted —
  // the render_artifact-first law keys off this page name. `home` since the
  // surface became `/`.
  useAssistantContext({ page: 'home' });
  // Shared 'station' thread: the composer host's ASK mode commits through the
  // same store this panel renders — one transcript, whichever mode commits.
  const chat = useAssistantChat({ shared: 'station' });
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<{ id: string; title: string; messages: HistoryMessage[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [csvOffer, setCsvOffer] = useState<{ rows: number; cols: number; text: string } | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.messages]);

  // Voice + cross-component drafts land through the seed bus — the host's
  // visible field (ask mode owns its own draft) and the label draft both apply.
  useEffect(() => {
    const seed = getLatestComposerSeed();
    if (seed?.text) setDraft(seed.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Voice: mic (no text) → recording (stop = transcribe) → editable draft.
  // The transcript lands as a DRAFT — STT mangles SKUs; the operator fixes
  // before sending. Never auto-sends.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopRecording = useCallback(() => {
    mediaRef.current?.stop();
    mediaRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          const fd = new FormData();
          fd.append('audio', blob, 'dictation.webm');
          const res = await fetch('/api/ai/transcribe', { method: 'POST', body: fd });
          const data = (await res.json().catch(() => null)) as { text?: string } | null;
          // The transcript lands through the seed bus: it fills the VISIBLE
          // field (ask mode owns its own draft) as an editable draft — never
          // auto-sends.
          if (res.ok && data?.text) requestComposerSeed({ text: data.text, autoSend: false });
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
    } catch {
      // Mic denied or unavailable — the button simply stays a mic.
    }
  }, []);

  // ── New conversation: ONE verb, three doors — ⌘N / Ctrl+N here, the sidebar
  // nav entry (`/?new=1`), and AI_CHAT_NEW_EVENT from the header switcher.
  // Depend on `chat.reset`, NOT on `chat`: useAssistantChat returns a fresh
  // object literal every render, so `[chat]` made this callback unstable, which
  // made the `?new=1` effect below re-fire on every render it caused —
  // reset() mints a new thread object each time, so setState never bails and
  // React trips its nested-update limit ("Maximum update depth exceeded").
  // `reset` itself is already referentially stable.
  const newConversation = useCallback(() => {
    setHistory(null);
    chat.reset();
  }, [chat.reset]);

  useEffect(() => {
    const onNew = () => newConversation();
    window.addEventListener(AI_CHAT_NEW_EVENT, onNew);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newConversation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(AI_CHAT_NEW_EVENT, onNew);
      window.removeEventListener('keydown', onKey);
    };
  }, [newConversation]);

  // ── URL-as-state: `?session=<id>` opens read-only history; `?new=1` (the
  // sidebar entry) resets and strips itself.
  const sessionParam = searchParams.get('session');
  const newParam = searchParams.get('new');
  useEffect(() => {
    if (newParam) {
      newConversation();
      router.replace('/');
      return;
    }
    if (!sessionParam) return;
    void (async () => {
      try {
        // Resolve the human title from the session list, then load read-only.
        let title = 'Session';
        try {
          const listRes = await fetch('/api/ai/chat-sessions');
          if (listRes.ok) {
            const list = (await listRes.json()) as { sessions?: Array<{ id: string; title: string | null }> };
            title = list.sessions?.find((s) => s.id === sessionParam)?.title ?? title;
          }
        } catch { /* title fallback fine */ }
        const res = await fetch(`/api/ai/chat-sessions/${encodeURIComponent(sessionParam)}/messages`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: HistoryMessage[] };
        setHistory({ id: sessionParam, title, messages: data.messages ?? [] });
      } catch {
        /* stays on the live thread on failure */
      }
    })();
  }, [newParam, newConversation, router, sessionParam]);

  // Publish the thread's name — the header switcher's trigger face. Mirrors how
  // chat-persistence derives a session title: first user message.
  const currentTitle =
    history?.title ??
    chat.messages.find((m) => m.role === 'user')?.content.slice(0, 60) ??
    'New conversation';
  useEffect(() => {
    publishSessionTitle(currentTitle);
  }, [currentTitle]);

  const send = useCallback((live?: string) => {
    const text = (live ?? draft).trim();
    if (!text || chat.status === 'streaming') return;
    setHistory(null);
    setDraft('');
    void chat.send(text, context);
  }, [chat, context, draft]);

  const isEmpty = chat.messages.length === 0 && !history;
  const startMode = variant === 'start' && isEmpty;

  // The surface morphs start → split on the first message (and back on reset).
  useEffect(() => {
    onStartedChange?.(variant === 'start' ? !isEmpty : true);
  }, [variant, isEmpty, onStartedChange]);

  const shown: Array<{ id: string; role: 'user' | 'assistant'; content: string; error?: boolean; streaming?: boolean }> = history
    ? history.messages.map((m) => ({ id: `h-${m.id}`, role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content }))
    : chat.messages;

  // ── The context ring: a REAL reflection of what the next turn sends the
  // model — page context, thread length, staged attachments. Count = items.
  const contextItems = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];
    items.push({ label: 'Page', value: context?.page ?? 'home' });
    if (context?.mode) items.push({ label: 'Composer mode', value: context.mode });
    if (context?.selection) items.push({ label: 'Selection', value: `${context.selection.kind} ${context.selection.id}` });
    if (context?.skill) items.push({ label: 'Skill', value: 'attached' });
    items.push({ label: 'Thread', value: `${chat.messages.length} messages in context` });
    if (csvOffer) items.push({ label: 'Staged CSV', value: `${csvOffer.rows} rows — triage offered` });
    return items;
  }, [context, chat.messages.length, csvOffer]);
  const contextCount = contextItems.length;
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [ringOpen, setRingOpen] = useState(false);
  const inlineRing = (
    <div ref={ringRef} className="relative" data-testid="composer-context">
      <ComposerContextRing
        count={contextCount}
        pressed={ringOpen}
        label="Model context"
        onClick={() => setRingOpen((v) => !v)}
      />
      {ringOpen ? (
        <ComposerPlusMenuPanel
          open={ringOpen}
          onClose={() => setRingOpen(false)}
          anchorRef={ringRef}
          ariaLabel="Model context"
          placement="bottom-end"
        >
          <ul className="flex flex-col gap-1 px-2 py-1.5" data-testid="model-context-list">
            {contextItems.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-role-caption">
                <span className="text-text-faint">{item.label}</span>
                <span className="min-w-0 truncate font-medium text-text-default">{item.value}</span>
              </li>
            ))}
          </ul>
        </ComposerPlusMenuPanel>
      ) : null}
    </div>
  );

  const composerMouth = (
    <StationComposerHost
      presenceKind="station"
      textareaRef={composerRef}
      labelValue={draft}
      onLabelChange={setDraft}
      onLabelCommit={(live) => send(live)}
      onTextareaKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
          return true;
        }
        return false;
      }}
      labelCommitDisabled={chat.status === 'streaming'}
      labelCommitAriaLabel="Send message"
      labelCommitTooltip="Send (Enter)"
      labelPlaceholder="Ask the agent…"
      chrome="raised"
      animateMount={false}
      inlineComposerRow
      inlineRing={inlineRing}
      plusMenuContent={
        <SessionPlusMenu onClose={() => undefined} />
      }
      renderInlineCommit={({ hasText, busy, commit }) => (
        <button
          type="button"
          data-testid="composer-voice-commit"
          aria-label={
            recording
              ? 'Stop recording'
              : transcribing
                ? 'Transcribing'
                : hasText
                  ? 'Send message'
                  : 'Dictate'
          }
          disabled={transcribing || busy}
          onClick={() => {
            if (recording) {
              stopRecording();
              return;
            }
            if (hasText) {
              commit();
              return;
            }
            void startRecording();
          }}
          className={cn(
            'ds-raw-button flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
            recording
              ? 'bg-rose-600 text-white'
              : hasText
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'text-text-faint hover:bg-surface-hover',
          )}
        >
          {transcribing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : recording ? (
            // ds-allow-raw-neutral: paper-white recording pulse on the blue send face — scheme-independent by design.
            <span className="h-2.5 w-2.5 animate-pulse rounded-[2px] bg-white" />
          ) : hasText ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    />
  );

  /**
   * The AI helper ABOVE the composer: a multi-line CSV paste is almost always
   * pending orders. Offer the triage verb instead of making the operator ask.
   * The paste still lands in the draft — the offer never hijacks the input.
   */
  const looksLikeCsv = (text: string): { rows: number; cols: number } | null => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2 || lines.length > 500) return null;
    const cols = lines[0].split(',').length;
    if (cols < 2) return null;
    return { rows: lines.length - 1, cols };
  };
  const onComposerPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    const detected = text ? looksLikeCsv(text) : null;
    if (detected) setCsvOffer({ ...detected, text: text.trim() });
  };
  const triagePastedCsv = useCallback(() => {
    if (!csvOffer) return;
    const text = csvOffer.text;
    setCsvOffer(null);
    setDraft('');
    void chat.send(
      `Triage this pasted CSV of pending orders for import — which rows are accepted, which need resolution and why:\n\n${text}`,
      context,
    );
  }, [chat, context, csvOffer]);
  const composerBlock = (
    <>
      {csvOffer ? (
        <div
          className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-border-hairline bg-surface-sunken px-2.5 py-1.5"
          data-csv-helper
        >
          <p className="min-w-0 text-role-micro text-text-muted">
            CSV detected — {csvOffer.rows} rows × {csvOffer.cols} columns. Triage for order import?
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="primary" onClick={triagePastedCsv} ariaLabel="Triage pasted CSV">
              Triage
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCsvOffer(null)} ariaLabel="Dismiss CSV helper">
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
      {composerMouth}
    </>
  );

  // START — the landing state: one centered column owns the screen.
  if (startMode) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)} aria-label="Agent session">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-16">
          <div className="flex w-full max-w-2xl flex-col items-stretch gap-4" data-session-start>
            <WelcomeGreeting />
            <div className="w-full" onPaste={onComposerPaste}>{composerBlock}</div>
            <div className="flex flex-wrap justify-center gap-1.5 pt-0.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setDraft('');
                    void chat.send(s, context);
                  }}
                  className="rounded-full border border-border-hairline px-2.5 py-1 text-role-micro font-medium text-text-muted transition-colors hover:bg-surface-sunken"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col border-r border-border-hairline', className)} aria-label="Agent session">
      {/* transcript — chat only; everything else lives in the global header */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2.5">
        {history ? (
          <p className="mb-1.5 text-role-micro uppercase tracking-widest text-text-faint">
            Read-only · {history.title}
          </p>
        ) : null}
        {!isEmpty ? (
          <div className="mt-auto space-y-2.5">
            {shown.map((m) =>
              m.role === 'user' ? (
                <div
                  key={m.id}
                  className="ml-8 rounded-lg bg-blue-50 px-3 py-1.5 text-role-caption leading-5 text-blue-900 ring-1 ring-inset ring-blue-100"
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              ) : m.error ? (
                <p key={m.id} className="mr-2 text-role-caption leading-5 text-rose-700">
                  {m.content}
                </p>
              ) : (
                // Agent replies are PROSE: plain black markdown, no bubble, no
                // tables — data belongs to the artifact panel on the right.
                <AssistantReply key={m.id} id={m.id} content={m.content} streaming={m.streaming} />
              ),
            )}
            {chat.activeTool ? (
              // The phase line: what the agent is doing right now, in the
              // operator's words (tool-activity.ts), not the tool id. Sentence
              // case at caption size so it reads as one of the transcript's
              // own lines and not as a shouted eyebrow label; polite live
              // region because it is the only signal the turn is moving.
              <p
                aria-live="polite"
                className="flex items-center gap-1.5 text-role-caption leading-5 text-text-muted"
              >
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                {toolActivityPhrase(chat.activeTool)}…
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* suggestions when idle — recents live in the header switcher */}
      {isEmpty ? (
        <div className="shrink-0 space-y-0.5 border-t border-border-hairline px-3 pt-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setDraft('');
                void chat.send(s, context);
              }}
              className="block w-full rounded-lg px-2 py-1 text-left text-role-micro font-medium text-text-muted hover:bg-surface-sunken"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* composer mouth */}
      <div className="shrink-0 px-1.5 pb-1.5 pt-0.5" onPaste={onComposerPaste}>{composerBlock}</div>
    </div>
  );
}

// ─── The welcome greeting ────────────────────────────────────────────────────

/**
 * The landing sentence — the ONE line allowed to shine. Warm, time-aware copy
 * in serif italic with a gradient phrase, because this surface serves people,
 * not queues (no hardened WMS voice). Entrance is a soft staggered rise via
 * the house motion barrel; `useReducedMotion` turns it into a plain fade.
 */
const GREETINGS: Array<{ hello: string; shine: string }> = [
  { hello: 'Good morning', shine: "we're ready when you are." },
  { hello: 'Good afternoon', shine: 'the floor is humming along.' },
  { hello: 'Good afternoon', shine: 'your business, beautifully in hand.' },
  { hello: 'Good evening', shine: 'winding down, keeping watch.' },
  { hello: 'Working late', shine: "we're right here with you." },
];

function greetingForHour(hour: number): { hello: string; shine: string } {
  if (hour >= 5 && hour < 11) return GREETINGS[0];
  if (hour >= 11 && hour < 14) return GREETINGS[1];
  if (hour >= 14 && hour < 18) return GREETINGS[2];
  if (hour >= 18 && hour < 22) return GREETINGS[3];
  return GREETINGS[4];
}

const riseStagger = (reduced: boolean, index: number) =>
  reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { type: 'spring' as const, stiffness: 120, damping: 18, delay: index * 0.08 },
      };

function WelcomeGreeting() {
  const reduced = useReducedMotion();
  const greeting = greetingForHour(new Date().getHours());
  return (
    <div className="flex flex-col items-center gap-0.5 py-1 text-center">
      <motion.div
        {...riseStagger(Boolean(reduced), 0)}
        className="flex items-center justify-center gap-1.5"
      >
        <Sparkles className="h-3.5 w-3.5 text-blue-600" />
        <p className="font-serif text-sm italic text-text-muted">{greeting.hello} —</p>
      </motion.div>
      <motion.p
        {...riseStagger(Boolean(reduced), 1)}
        className="mx-auto w-fit font-serif text-2xl italic leading-snug"
      >
        <span
          className="bg-clip-text text-transparent"
          style={{ backgroundImage: 'linear-gradient(90deg, #2563eb 0%, #6d28d9 55%, #f59e0b 100%)' }}
        >
          {greeting.shine}
        </span>
      </motion.p>
    </div>
  );
}

/** One dispatch per table per reply — survives re-renders and StrictMode. */
const dispatchedTables = new Set<string>();

/**
 * AssistantReply — the left side is PROSE ONLY. Agent replies render as plain
 * black markdown (no bubble, no box); a GFM table the model leaks into text is
 * MOVED to the artifact panel through the same validated pipeline as
 * render_artifact, and stripped from the rendered text. Dispatch waits for the
 * turn to settle so partial streaming tables never fire.
 */
function AssistantReply({ id, content, streaming }: { id: string; content: string; streaming?: boolean }) {
  const { tables, text } = useMemo(() => extractGfmTables(content), [content]);
  useEffect(() => {
    if (streaming || tables.length === 0) return;
    tables.forEach((t, idx) => {
      const key = `${id}:${idx}:${t.rows.length}`;
      if (dispatchedTables.has(key)) return;
      dispatchedTables.add(key);
      const artifact: ArtifactTable = {
        kind: 'table',
        title: t.title,
        columns: t.columns,
        rows: t.rows,
      };
      window.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_EVENT, { detail: artifact }));
    });
  }, [id, tables, streaming]);
  return <MarkdownRenderer content={text} />;
}
