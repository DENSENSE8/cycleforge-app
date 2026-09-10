'use client';

/**
 * AgentSessionPanel — the LEFT column of home: the operator's one column.
 *
 * Two faces, ONE tree, ONE composer node (the power-up law):
 *   • CALM — the resting face. The greeting question hangs over the mouth,
 *     suggestions under it, the mouth centered on the pane's middle line.
 *     Nobody is driving; the room is quiet.
 *   • FOCUS — the mission frame (woke by pointer/key activity, see
 *     useFocusWake). A header strip and the ranked TriageLedger assemble
 *     above the mouth while motion `layout` tweens the dock from the middle
 *     line to the bottom edge. Sending flips the ledger to the transcript;
 *     ◀ TRIAGE flips back without dropping the thread.
 *
 * The mouth (StationComposerHost, modes=['ask'] + askOwnedBySurface) is
 * mounted in BOTH faces as the same element, so the calm→focus transition
 * never remounts the field: no lost draft, no lost voice state, no refocus.
 *
 * Session chrome (name · search · recents · New) stays UP in the global
 * header (SessionSwitcher via useHeader panelContent). Streaming reuses
 * useAssistantChat + /api/assistant/chat unchanged; old threads load
 * READ-ONLY from /api/ai/chat-sessions/[id]/messages (`/?session=<id>`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUp, Loader2, Mic, Sparkles } from '@/components/Icons';
import { ComposerContextRing } from '@/components/composer/ComposerContextRing';
import { ComposerPlusMenuPanel } from '@/components/composer/ComposerPlusMenu';
import { StationComposerHost } from '@/components/composer/StationComposerHost';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import { Button } from '@/design-system/primitives';
import { AnimatePresence, motion, motionRole, useMotionRole, useReducedMotion } from '@/design-system/motion';
import { ChatTurn } from '@/components/ai/ChatTurn';
import { ChatPhaseLine } from '@/components/ai/ChatPhaseLine';
import { StreamingCaret } from '@/components/ai/StreamingCaret';
import { useActiveAssistantContext, useAssistantContext } from '@/hooks/useAssistantContext';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAssistantChat } from '@/components/assistant/useAssistantChat';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import { extractGfmTables, type ArtifactTable } from '@/lib/assistant/ui-artifacts';
import { normalizeAssistantProse } from '@/lib/assistant/prose-normalize';
import { AI_CHAT_NEW_EVENT, AI_CHAT_SESSIONS_CHANGED_EVENT, SESSION_ARTIFACT_EVENT } from '@/lib/app-events';
import { IconButton } from '@/design-system/primitives';
import { MotionLab } from './motion-lab/MotionLab';
import { publishSessionTitle } from './session-title-store';
import { displaySessionTitle } from '@/lib/ai/session-title-text';
import { SessionPlusMenu } from './SessionPlusMenu';
import { TriageLedger } from './TriageLedger';
import { ConnectAppPill } from './ConnectAppPill';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { INSTRUMENT_ACTION_CELL, INSTRUMENT_PLATE, INSTRUMENT_VALUE } from '@/design-system/tokens/instrument';
import { springConcierge } from '@/design-system/motion/tokens';
import type { PulseItem } from '@/lib/assistant/operator-pulse';

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
  focused,
  pulse,
  onStartedChange,
}: {
  className?: string;
  /**
   * The wake state from `useFocusWake` (SessionSurface owns it — the mission
   * pane must wake in lockstep with this column). `false` + empty thread =
   * the calm landing; anything else is the mission frame.
   */
  focused: boolean;
  /** The ranked first-plane feed — one /api/home-board read, polled by the surface. */
  pulse: { items: PulseItem[]; loading: boolean };
  /** Fires when the first message starts (or a reset empties the thread). */
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
  const [labOpen, setLabOpen] = useState(false);
  // Ledger ↔ transcript: the left column's content switch. Sending flips to
  // talk; ◀ TRIAGE flips back to the ledger WITHOUT resetting the thread.
  const [leftView, setLeftView] = useState<'ledger' | 'talk'>('ledger');
  const reduced = useReducedMotion();

  useEffect(() => {
    // Smooth follow between turns; INSTANT while streaming — a chunked stream
    // re-fires this effect tens of times a second and smooth scroll fights
    // itself into jank. Reduced motion never animates the scrollport.
    const behavior: ScrollBehavior = reduced || chat.status === 'streaming' ? 'auto' : 'smooth';
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, [chat.messages, chat.status, reduced]);

  // Seeds (voice transcripts, cross-component drafts) arrive through the
  // composer host, which now writes THIS draft because the surface owns the
  // ask field (`askOwnedBySurface`). The panel used to read the bus itself on
  // mount as well — two readers, one of them stale by a render.

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
    setLeftView('ledger');
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
      // Motion lab — the operator's taste-testing surface for chat motion
      // (⌘⇧M / Ctrl+Shift+M; ⌘M stays the OS mute). A testing verb, not chrome.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setLabOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(AI_CHAT_NEW_EVENT, onNew);
      window.removeEventListener('keydown', onKey);
    };
  }, [newConversation]);

  // ── The spine's write side (rename / soft-delete, `useSessionActions`)
  // broadcasts AI_CHAT_SESSIONS_CHANGED_EVENT. That event is a LIST signal by
  // contract, so the pane has to decide for itself what it means for the
  // thread on screen — and it means two things:
  //
  //   • the open `?session=<id>` was deleted → keep painting a thread that no
  //     longer exists, with its title still published into the global header.
  //     Fall back to a new conversation and strip the dead param.
  //   • the open thread was renamed → `history.title` is now stale, and the
  //     header switcher's face is fed from it. Re-read the row.
  //
  // Both are cheap: one list read, only when a session actually changed, and
  // only when this pane is showing a stored session.
  useEffect(() => {
    const onSessionsChanged = () => {
      const openId = history?.id;
      if (!openId) return;
      void (async () => {
        try {
          const res = await fetch('/api/ai/chat-sessions');
          if (!res.ok) return;
          const data = (await res.json()) as { sessions?: Array<{ id: string; title: string | null }> };
          const row = data.sessions?.find((s) => s.id === openId);
          if (!row) {
            newConversation();
            router.replace('/');
            return;
          }
          const nextTitle = row.title ?? 'Session';
          setHistory((prev) => (prev && prev.id === openId && prev.title !== nextTitle ? { ...prev, title: nextTitle } : prev));
        } catch {
          /* the pane keeps what it has on a failed read */
        }
      })();
    };
    window.addEventListener(AI_CHAT_SESSIONS_CHANGED_EVENT, onSessionsChanged);
    return () => window.removeEventListener(AI_CHAT_SESSIONS_CHANGED_EVENT, onSessionsChanged);
  }, [history?.id, newConversation, router]);

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
        setLeftView('talk');
        setHistory({ id: sessionParam, title, messages: data.messages ?? [] });
      } catch {
        /* stays on the live thread on failure */
      }
    })();
  }, [newParam, newConversation, router, sessionParam]);

  // Publish the thread's name — the header switcher's trigger face AND the
  // spine's current-session row. Preference order: a reopened session's stored
  // title, then the live AI summary pushed over the `title` SSE frame, then an
  // optimistic slice of the first message while that summary is in flight. The
  // generic placeholder only ever shows for a thread with no message yet.
  // A REOPENED session's title comes straight off the row, so it gets the same
  // display guard as every list: a pre-strip `<|channel|>analysis…` row must
  // not become the header's face.
  const currentTitle =
    displaySessionTitle(history?.title ?? chat.title, '') ||
    chat.messages.find((m) => m.role === 'user')?.content.slice(0, 60) ||
    'New conversation';
  useEffect(() => {
    publishSessionTitle(currentTitle);
  }, [currentTitle]);

  const send = useCallback((live?: string) => {
    const text = (live ?? draft).trim();
    if (!text || chat.status === 'streaming') return;
    setHistory(null);
    setDraft('');
    // Asking is a TALK act: the column flips to the transcript so the answer
    // lands where the operator is looking. ◀ TRIAGE brings the ledger back.
    setLeftView('talk');
    void chat.send(text, context);
  }, [chat, context, draft]);

  const isEmpty = chat.messages.length === 0 && !history;
  // CALM = not woken AND nothing live. A thread with messages in it pins the
  // mission frame even before the wake trigger fires (sending wakes anyway).
  const calm = !focused && isEmpty;

  // The surface morphs calm → focus on the first message (and back on reset).
  useEffect(() => {
    onStartedChange?.(!isEmpty);
  }, [isEmpty, onStartedChange]);

  const openCount = pulse.items.reduce((sum, item) => sum + item.count, 0);

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

  /**
   * The composer — ONE display, ONE field, ONE commit.
   *
   * `modes={['ask']}` + `askOwnedBySurface`: home is the assistant, so the only
   * destination the mouth honors is the model, and the field it shows is THIS
   * panel's draft. Before, the same textarea hid three drafts behind the
   * station's shared mode — Unbox wrote a sticker note wired to `send()`,
   * Ticket wrote a Zendesk claim body whose Enter committed nowhere (no
   * `onTicketCommit` on this surface), and Ask ran a SECOND
   * `useAssistantChat.send` off a draft the panel could not see. Shift+Tab
   * cycled between them on the home screen and the send/mic button reported the
   * wrong field's state.
   */
  const composerMouth = (
    <StationComposerHost
      presenceKind="station"
      modes={['ask']}
      askOwnedBySurface
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
    setLeftView('talk');
    void chat.send(
      `Triage this pasted CSV of pending orders for import — which rows are accepted, which need resolution and why:\n\n${text}`,
      context,
    );
  }, [chat, context, csvOffer]);
  // NO second highlight around the mouth. The dock owns focus feedback
  // (`focusRing('wrapper','accent')` + `focus-within:ring-2` on the outline
  // itself). A `-inset-1` ring painted on THIS wrapper sat outside the host's
  // own `px-3` gutter, so the operator saw two blue rings with a ~16px gap
  // between the outer one and the composer it was supposed to be highlighting.
  const composerBlock = (
    <div className="relative">
      {csvOffer ? (
        <ChatTurn
          data-csv-helper
          className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-border-hairline bg-surface-sunken px-2.5 py-1.5"
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
        </ChatTurn>
      ) : null}
      {composerMouth}
    </div>
  );

  // The Motion Lab door — a testing verb, not session chrome: one quiet icon
  // at the pane's corner plus the ⌘⇧M chord. Opens the replayable showcase of
  // every chat-motion preset (the "look at it" step of the loop protocol).
  const motionLabButton = (
    <IconButton
      ariaLabel="Motion lab (Command or Control+Shift+M)"
      icon={<Sparkles className="h-3.5 w-3.5" />}
      onClick={() => setLabOpen(true)}
      className="absolute right-2 top-2 z-30 text-text-faint hover:bg-surface-sunken hover:text-text-muted"
    />
  );
  // ── THE POWER-UP ──────────────────────────────────────────────────────────
  // One tree, one composer node. CALM: the mouth is the only in-flow child and
  // centers itself on the pane's middle line (`my-auto`); the greeting hangs
  // off it (`bottom-full`), suggestions under it (`top-full`). WAKE: the
  // mission body (header strip + ledger/transcript) assembles above the mouth
  // and motion `layout` tweens the dock from the middle line to the bottom
  // edge — the room assembles around the SAME mouth. No remount: the draft,
  // the voice state and the caret survive the transition. Reduced motion
  // collapses every tween to a hard swap (the impeccable skill's law).
  const transcriptPane = (
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
              <ChatTurn
                key={m.id}
                className="ml-8 rounded-lg bg-blue-50 px-3 py-1.5 text-role-caption leading-5 text-blue-900 ring-1 ring-inset ring-blue-100 [&>*:last-child]:mb-0"
              >
                {/* The operator's turn is markdown too — a pasted list or
                    **bold** must format in the bubble exactly as the reply
                    formats below it: ONE renderer, MarkdownRenderer. The
                    bubble face keeps it flat — no heading tags in a bubble. */}
                <MarkdownRenderer content={m.content} variant="bubble" />
              </ChatTurn>
            ) : m.error ? (
              <ChatTurn key={m.id} className="mr-2 text-role-caption leading-5 text-rose-700">
                {m.content}
              </ChatTurn>
            ) : (
              // Agent replies are PROSE: plain black markdown, no bubble, no
              // tables — data belongs to the artifact panel on the right.
              <ChatTurn key={m.id} className="mr-2 min-w-0">
                <AssistantReply id={m.id} content={m.content} streaming={m.streaming} />
              </ChatTurn>
            ),
          )}
          {chat.activeTool ? (
            // The phase line: what the agent is doing right now, in the
            // operator's words (tool-activity.ts), not the tool id. Sentence
            // case at caption size so it reads as one of the transcript's
            // own lines; polite live region because it is the only signal
            // the turn is moving.
            <ChatTurn>
              <ChatPhaseLine tool={chat.activeTool} />
            </ChatTurn>
          ) : null}
          {/*
            In-chat OAuth handoffs. They sit at the FOOT of the transcript,
            after the sentence that raised them, so the ask and the button
            read as one thought. Newest first, capped in the store — a stack
            of consent prompts is a UI that gets clicked blindly.
          */}
          {chat.connectionPrompts.map((prompt) => (
            <ChatTurn key={prompt.id}>
              <ConnectAppPill
                prompt={prompt}
                onConnected={(landed) => {
                  // Resume where the operator left off: seed the question that
                  // needed the app, and let THEM press Enter. Auto-sending
                  // after an OAuth round trip is how an agent surprises
                  // somebody with a tool call they did not re-authorize.
                  const askedFor = [...chat.messages]
                    .reverse()
                    .find((m) => m.role === 'user')?.content;
                  if (askedFor) requestComposerSeed({ text: askedFor, autoSend: false });
                  window.setTimeout(() => chat.dismissConnectionPrompt(landed.id), 4000);
                }}
              />
            </ChatTurn>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col',
        !calm && 'border-r border-border-hairline',
        className,
      )}
      aria-label="Agent session"
    >
      {motionLabButton}
      <AnimatePresence initial={false}>
        {!calm ? (
          <motion.div
            key="mission-body"
            initial={reduced ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -10 }}
            transition={springConcierge}
            className="flex min-h-0 flex-1 flex-col"
            data-session-focus
          >
            {/*
              The header strip. In ledger view it names the instrument and
              states the count; in talk view it carries the ◀ TRIAGE back
              control — the tasks↔talk swap is a VIEW of this column, never a
              navigation, so the live thread is never dropped.
            */}
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-hairline px-3">
              {leftView === 'talk' ? (
                <button
                  type="button"
                  data-testid="triage-back"
                  onClick={() => setLeftView('ledger')}
                  className={cn(
                    'ds-raw-button rounded-sm px-1.5 py-0.5 text-role-caption font-medium text-text-muted',
                    'transition-colors hover:bg-surface-hover hover:text-text-default',
                    focusRing('control', 'accent'),
                  )}
                >
                  ◀ Triage
                </button>
              ) : (
                <>
                  <span className={sectionLabel}>Triage</span>
                  {openCount > 0 ? (
                    <span className={INSTRUMENT_VALUE} data-testid="triage-open-count">
                      {openCount.toLocaleString()} open
                    </span>
                  ) : null}
                </>
              )}
              {leftView === 'talk' ? (
                <span className="ml-auto min-w-0 truncate text-role-micro text-text-faint">
                  {currentTitle}
                </span>
              ) : null}
            </div>
            {leftView === 'talk' ? (
              transcriptPane
            ) : (
              <TriageLedger
                items={pulse.items}
                loading={pulse.loading}
                onPick={(question) => {
                  setDraft(question);
                  composerRef.current?.focus();
                }}
                fallback={
                  <div className="flex flex-1 items-center justify-center p-6 text-center">
                    <p className="max-w-xs text-sm text-text-muted">
                      Nothing is stuck. <span className="font-semibold text-text-gilt">All clear</span> —
                      the floor feed on the right is live; ask below for anything else.
                    </p>
                  </div>
                }
              />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/*
        THE MOUTH — the one node both faces share. In calm it carries the
        greeting above and the suggestion plate below (both absolute, so the
        mouth's own box — and therefore its mid-page pin — never changes).
      */}
      <motion.div
        layout={!reduced}
        transition={springConcierge}
        data-testid="session-composer-dock"
        className={cn('relative', calm ? 'my-auto w-full max-w-2xl px-6' : 'shrink-0 px-1.5 pb-1.5 pt-1')}
      >
        <AnimatePresence>
          {calm ? (
            <div className="absolute inset-x-0 bottom-full mb-8 flex justify-center" data-session-start>
              <WelcomeGreeting />
            </div>
          ) : null}
        </AnimatePresence>
        <ChatTurn className="w-full" onPaste={onComposerPaste}>{composerBlock}</ChatTurn>
        {/*
          The suggestion strip wears the machined grammar of the telemetry
          readings: ONE plate, divided cells, sentence ink. Calm only — in
          focus the ledger's rows ARE the suggestions.
        */}
        {calm ? (
          <div className="absolute inset-x-0 top-full mt-3 flex justify-center">
            <div className={INSTRUMENT_PLATE}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setDraft('');
                    setLeftView('talk');
                    void chat.send(s, context);
                  }}
                  className={cn('ds-raw-button', INSTRUMENT_ACTION_CELL, focusRing('control', 'accent'))}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </motion.div>
      <AnimatePresence>{labOpen ? <MotionLab onClose={() => setLabOpen(false)} /> : null}</AnimatePresence>
    </div>
  );
}

// ─── The focus question ──────────────────────────────────────────────────────

/**
 * ONE LINE, ONE ROW (2026-09-06). The landing asks the operator a single
 * question — what to focus on right now — and nothing else. It is time-aware
 * because a 6am shift and a 10pm shift are looking at different work, and it
 * carries exactly ONE lifted word: the verb, italic in `text-gilt` (cream on
 * dark schemes, caramel-bronze on light). That single warm word IS the premium
 * note; everything else stays quiet display ink.
 *
 * It replaced a two-row block (a "Good evening" greeting over a separate
 * sentence): two stacked rows of decoration above the mouth said nothing about
 * the shift and pushed the composer off the page's middle. A greeting is not a
 * prompt. The question is.
 *
 * Entrance is ONE authored deblur-rise on the line; the reduced-motion bridge
 * collapses it to a fade.
 */
type FocusPrompt = {
  /**
   * Prose before and after the lifted verb — quiet ink, upright. Stored
   * without edge whitespace; the render inserts the separators.
   */
  before: string;
  /** The ONE gilt italic phrase: the verb the question turns on. */
  verb: string;
  after: string;
};

const FOCUS_PROMPTS: FocusPrompt[] = [
  { before: 'What should we', verb: 'start', after: 'with this morning?' },
  { before: 'What should we', verb: 'move', after: 'before the afternoon?' },
  { before: 'What should we', verb: 'focus', after: 'on this afternoon?' },
  { before: 'What should we', verb: 'close out', after: 'tonight?' },
  { before: 'What should we', verb: 'finish', after: 'before you log off?' },
];

function focusPromptForHour(hour: number): FocusPrompt {
  if (hour >= 5 && hour < 11) return FOCUS_PROMPTS[0];
  if (hour >= 11 && hour < 14) return FOCUS_PROMPTS[1];
  if (hour >= 14 && hour < 18) return FOCUS_PROMPTS[2];
  if (hour >= 18 && hour < 22) return FOCUS_PROMPTS[3];
  return FOCUS_PROMPTS[4];
}

function WelcomeGreeting() {
  const { presence, transition } = useMotionRole(motionRole.chat.land);
  const prompt = focusPromptForHour(new Date().getHours());
  // No leading glyph: an icon beside the words centers the GROUP, which leaves
  // the question itself off-axis from the composer under it.
  //
  // ONE authored entrance on the LINE — deblur-rise via `motionRole.chat.land`,
  // already routed through the reduced-motion bridge, so this collapses to a
  // plain fade without a second branch here.
  //
  // It does NOT use Motion+ `AnimateText` + `framerVariants.chatWordRise*`
  // (2026-09-06). That pattern renders the line INVISIBLE: `AnimateText`
  // splits the string into its own word wrappers and character spans, and
  // those wrappers mount AFTER the parent `motion.p` has already dispatched
  // `animate="show"`. They inherit `initial="hidden"` from variant context,
  // never receive the `show` command, and sit at `opacity: 0;
  // filter: blur(4px)` permanently — measured in the browser: word wrappers
  // at opacity 0, the character spans inside them at opacity 1, so the line
  // still occupies its box and paints nothing.
  //
  // A per-word cascade is also wrong for this slot on the merits now: the row
  // above the composer re-polls the board every 60s, and re-typewriting live
  // operational copy on every refresh is motion for its own sake.
  return (
    <motion.p
      {...presence}
      transition={transition}
      className="mx-auto w-fit text-balance text-role-display text-text-default"
    >
      {prompt.before} <em className="italic text-text-gilt">{prompt.verb}</em> {prompt.after}
    </motion.p>
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
  // Normalize BEFORE extraction so the artifact mover and the renderer see
  // the same coerced text — an H1 or a tab-indented list is fixed once, here.
  const { tables, text } = useMemo(
    () => extractGfmTables(normalizeAssistantProse(content)),
    [content],
  );
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
  return (
    <div className="min-w-0">
      <MarkdownRenderer content={text} />
      {streaming ? <StreamingCaret className="-mt-1" /> : null}
    </div>
  );
}
