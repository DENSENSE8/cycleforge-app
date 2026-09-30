'use client';

/**
 * AgentSessionPanel — the AI session's one column: transcript + composer.
 *
 * No frame, no card: the PAGE AREA is the scrollport (full width beside the
 * side panel, so the scrollbar sits at its edge) and a fixed-width column is
 * centred in it. Two faces, ONE composer node:
 *   • EMPTY — a one-line greeting, the composer and at most three quiet
 *     suggestion chips, centred in the column. Nothing else.
 *   • CHATTING — the operator's turns are soft right-aligned bubbles, the
 *     answers plain prose; the composer docks to the bottom of the viewport
 *     (sticky, same width, over a canvas fade) and the transcript scrolls
 *     under it. The dock holds its own space, so the last line never hides.
 *
 * The first send flips the face and the composer GLIDES from the middle to the
 * bottom: it is the same element in both faces (a Motion shared-layout node),
 * so the move is one transform, and the draft, caret and voice state survive
 * it. Greeting and chips pop out of flow as it leaves.
 *
 * The display rule (`artifact-placement.ts`): DATA renders inline under the
 * answer that produced it — a product answer reads title → id chips → table →
 * one summary sentence → follow-ups; a long table previews and "Show all"
 * opens the side panel. DOCUMENTS open in the side panel on arrival, with a
 * compact card in the column that re-opens them (`SessionSurface`,
 * `useSessionArtifacts`). While a turn works, one shimmering line says what it
 * is doing; after, the lightbulb in the action row opens its "Thought process".
 *
 * Threads are continuable: `?session=<id>` loads the thread from
 * `GET /api/ai/chat-sessions/[id]` into the live engine, so the next send
 * appends to it; a fresh thread writes its id back to the URL once its first
 * turn ends. The recents list lives in the sidebar under Chat. Every turn has
 * an icon row (Copy · Regenerate · 👍 / 👎 · Thought process; Copy · Edit on
 * the operator's bubbles), and the keyboard is `useSessionHotkeys`.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Copy, Loader2, Mic, Pencil, Plus, RefreshCw, Stop, Thought, ThumbsDown, ThumbsUp, X } from '@/components/Icons';
import { ComposerPlusMenuPanel } from '@/components/composer/ComposerPlusMenu';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import { ThinkingLine, ThinkingTrace } from '@/components/ai/ThinkingTrace';
import { AnimatePresence, motion, useReducedMotion, type Transition } from '@/design-system/motion';
import {
  AI_ACTION_CLASS,
  AI_CHIP_CLASS,
  AI_COLUMN_CLASS,
  AI_COMPOSER_DOCK_CLASS,
  AI_COMPOSER_LAYOUT_ID,
  AI_FOCUS_CLASS,
  AI_ICON_BUTTON_CLASS,
  AI_LABEL_CLASS,
  AI_NOTICE_CLASS,
  AI_PRIMARY_BUTTON_CLASS,
  AI_STOP_BUTTON_CLASS,
  AI_USER_BUBBLE_CLASS,
  AiArtifactCard,
  AiComposer,
  AiTurn,
  AiTurnActions,
  aiPresence,
  aiTransition,
  useAiActionStates,
  useMotionPresence,
  useMotionTransition,
  type AiTurnAction,
} from '@/design-system/ai';
import { useActiveAssistantContext, useAssistantContext } from '@/hooks/useAssistantContext';
import { useVoiceDictation } from '@/hooks/useVoiceDictation';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import { writeClipboardText } from '@/lib/clipboard';
import { toast } from '@/lib/toast';
import {
  isAddressableMessageId,
  useAssistantChat,
  type AssistantMessage,
} from '@/components/assistant/useAssistantChat';
import type { ChatHistoryRow } from '@/lib/assistant/chat-persistence';
import type { AssistantPageContext } from '@/lib/assistant/context-store';
import {
  getComposerSeedSeq,
  getLatestComposerSeed,
  requestComposerSeed,
  subscribeComposerSeed,
} from '@/lib/assistant/composer-seed-store';
import { extractGfmTables, type ArtifactTable } from '@/lib/assistant/ui-artifacts';
import { isInlineArtifact } from '@/lib/assistant/artifact-placement';
import { answerCopyIds, emphasizeAnswer, type AnswerIdKind } from '@/lib/assistant/answer-emphasis';
import { normalizeAssistantProse } from '@/lib/assistant/prose-normalize';
import { NO_ANSWER_FALLBACK } from '@/lib/assistant/turn-trace';
import { WRITE_TOOL_NAMES } from '@/lib/assistant/tool-activity';
import {
  AI_CHAT_NEW_EVENT,
  AI_CHAT_SESSIONS_CHANGED_EVENT,
  SESSION_ARTIFACT_EVENT,
  type SessionArtifactEventDetail,
} from '@/lib/app-events';
import { publishSessionTitle } from './session-title-store';
import { displaySessionTitle } from '@/lib/ai/session-title-text';
import { SessionPlusMenu } from './SessionPlusMenu';
import { ConnectAppPill } from './ConnectAppPill';
import { ChatPrintJobCard } from '@/components/assistant/ChatPrintJobCard';
import { useSessionArtifacts, type SessionArtifactEntry } from './useSessionArtifacts';
import { useSessionHotkeys } from './useSessionHotkeys';
import { useComposerMentions } from './composer/useComposerMentions';
import { useAssistantAccessMode } from './composer/useAssistantAccessMode';
import { AccessModeSwitch } from './composer/AccessModeSwitch';
import { ContextUsageRing } from './composer/ContextUsageRing';
import { useComposerAttachments } from './composer/useComposerAttachments';
import { ComposerDropzone } from './composer/ComposerAttachments';
import { artifactSummary } from './artifacts/artifact-summary';
import { AnswerIdChip, InlineArtifact } from './artifacts/InlineArtifact';
import { DocumentArtifactCard } from './artifacts/DocumentArtifact';
import { useCapabilityStarters } from '@/hooks/useOrgCapabilities';

/**
 * The empty-state chips — each sentence lands on a tool this lane's registry
 * serves (`get_packing_kpi`, `list_support_followups`, `get_my_tech_queue`),
 * so the first thing an operator taps gets an answer. Three, never more.
 */
const SUGGESTIONS = [
  'How is packing pace today?',
  'Which support follow-ups are waiting on me?',
  "What's in my tech queue?",
];

/** The day reshapes the first chip: Monday looks back, Friday closes out. */
function suggestionsForToday(day: number): string[] {
  if (day === 1) return ['What carried over from last week?', ...SUGGESTIONS.slice(1)];
  if (day === 5) return ['What should close out before the weekend?', ...SUGGESTIONS.slice(1)];
  return SUGGESTIONS;
}

/** Why an answer was bad — one tap, then an optional note. */
const THUMBS_DOWN_REASONS = ['Wrong data', "Didn't answer", 'Other'] as const;

/** A failure the operator can re-run (a foreign / deleted thread cannot). */
const RETRYABLE_ERROR_CODES: Readonly<Record<string, true>> = {
  provider_unreachable: true,
  internal: true,
  network: true,
  rate_limited: true,
};

/** The sentinel counts as "at the bottom" this far below the viewport edge. */
const PIN_SLACK_PX = 96;

export function AgentSessionPanel({
  className,
  panelDocked,
}: {
  className?: string;
  /** The side panel is docked beside the column — the column re-centres (animated). */
  panelDocked: boolean;
}) {
  const context = useActiveAssistantContext();
  // The surface registers ITSELF so the model knows artifacts can be shown
  // here — the render_artifact-first law keys off this page name.
  useAssistantContext({ page: 'home' });
  const artifacts = useSessionArtifacts();
  // Shared 'station' thread: one transcript, whichever surface commits. A
  // regenerate / edit drops the superseded answers' cards with them.
  const [accessMode, setAccessMode] = useAssistantAccessMode();
  // SIMPLE-FIRST: a chat-only workspace sees what it can switch on instead.
  const capabilityStarters = useCapabilityStarters();
  const attachments = useComposerAttachments();
  const clearAttachments = attachments.clear;
  const chat = useAssistantChat({ shared: 'station', onSupersede: artifacts.dropMessages, accessMode });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [csvOffer, setCsvOffer] = useState<{ rows: number; cols: number; text: string } | null>(null);
  const reduced = useReducedMotion();
  const actionStates = useAiActionStates();
  const streaming = chat.status === 'streaming';

  // ── Edit-and-resend: the bubble's text in the composer; `stash` is the draft
  // it replaced, restored on cancel.
  const [editing, setEditing] = useState<{ messageId: string; stash: string } | null>(null);
  const mentions = useComposerMentions({ value: draft, onChange: setDraft, textareaRef: composerRef });

  // ── Scroll: follow the live end only while the operator is AT it. The
  // sentinel under the last turn is watched in the scrollport; reading up the
  // thread unpins (the transcript holds still) and shows ↓.
  const [pinned, setPinned] = useState(true);
  const pinnedRef = useRef(true);
  const scrollToEnd = useCallback(
    (behavior: ScrollBehavior) => {
      pinnedRef.current = true;
      setPinned(true);
      const root = scrollRef.current;
      root?.scrollTo({ top: root.scrollHeight, behavior: reduced ? 'auto' : behavior });
    },
    [reduced],
  );
  useLayoutEffect(() => {
    if (!pinnedRef.current) return;
    // Smooth follow between turns; INSTANT while streaming — a chunked stream
    // re-fires this tens of times a second and smooth scroll fights itself
    // into jank. Reduced motion never animates the scrollport.
    const behavior: ScrollBehavior = reduced || streaming ? 'auto' : 'smooth';
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, [chat.messages, streaming, artifacts.entries.length, artifacts.pending, reduced]);

  // ── Voice: mic → recording → transcript lands in the DRAFT (STT mangles
  // SKUs; the operator fixes before sending). Server first; on a 503 the hook
  // switches to the browser's own recognition for the rest of the session.
  const voice = useVoiceDictation({
    onFinal: (text) => {
      setDraft((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
      composerRef.current?.focus();
    },
  });

  // ── New conversation: ONE verb, several doors — the hotkeys, the sidebar's
  // `+` (`?new=1` / AI_CHAT_NEW_EVENT). Depend on the stable callbacks, NOT on
  // `chat`: useAssistantChat returns a fresh object every render, and an
  // unstable callback here re-fires the URL effects below.
  const resetChat = chat.reset;
  const clearArtifacts = artifacts.clear;
  const resetMentions = mentions.reset;
  const [renamedTitle, setRenamedTitle] = useState<string | null>(null);
  const newConversation = useCallback(() => {
    resetChat();
    clearArtifacts();
    resetMentions();
    setEditing(null);
    setRenamedTitle(null);
  }, [resetChat, clearArtifacts, resetMentions]);

  useEffect(() => {
    const onNew = () => newConversation();
    window.addEventListener(AI_CHAT_NEW_EVENT, onNew);
    return () => window.removeEventListener(AI_CHAT_NEW_EVENT, onNew);
  }, [newConversation]);

  // ── URL-as-state. `?new=1` resets and strips itself; `?session=<id>` loads
  // that thread into the engine (continuable). Keyed on the PARAM only: the
  // engine's own session id changing (a reset, a load) must never re-fire it.
  const sessionParam = searchParams.get('session');
  const newParam = searchParams.get('new');
  const liveSessionIdRef = useRef(chat.sessionId);
  liveSessionIdRef.current = chat.sessionId;
  const loadThread = chat.load;
  const hydrateArtifacts = artifacts.hydrate;
  const [opening, setOpening] = useState(false);
  // The param value last acted on — callbacks re-rendering must not re-open
  // a thread the operator just left (⌘⇧O resets before the URL catches up).
  const handledParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (newParam) {
      newConversation();
      router.replace(pathname);
      return;
    }
    if (sessionParam === handledParamRef.current) return;
    handledParamRef.current = sessionParam;
    if (!sessionParam || sessionParam === liveSessionIdRef.current) return;
    let cancelled = false;
    let settled = false;
    setOpening(true);
    void (async () => {
      try {
        const res = await fetch(`/api/ai/chat-sessions/${encodeURIComponent(sessionParam)}`);
        if (cancelled) return;
        if (!res.ok) {
          // Deleted, foreign or gone: a new conversation, and the dead param goes.
          toast.error(res.status === 404 ? 'That conversation no longer exists' : 'Could not open that conversation');
          newConversation();
          router.replace(pathname);
          return;
        }
        const data = (await res.json()) as { session: { id: string; title: string | null }; messages: ChatHistoryRow[] };
        if (cancelled) return;
        setEditing(null);
        setRenamedTitle(null);
        hydrateArtifacts(loadThread(data.session.id, data.messages, data.session.title));
        pinnedRef.current = true;
      } catch {
        if (!cancelled) toast.error('Could not open that conversation');
      } finally {
        settled = true;
        if (!cancelled) setOpening(false);
      }
    })();
    return () => {
      cancelled = true;
      // An interrupted open (StrictMode, a quick second click) may run again.
      if (!settled) handledParamRef.current = null;
      setOpening(false);
    };
  }, [newParam, sessionParam, newConversation, loadThread, hydrateArtifacts, pathname, router]);

  // A fresh thread's id goes into the URL once its first turn ends, so a
  // reload restores it and the sidebar highlights it.
  const hasTurns = chat.messages.some((m) => m.role === 'user');
  useEffect(() => {
    if (sessionParam || newParam || streaming || !hasTurns) return;
    router.replace(`${pathname}?session=${encodeURIComponent(chat.sessionId)}`);
  }, [sessionParam, newParam, streaming, hasTurns, chat.sessionId, pathname, router]);

  // ── The sidebar's rename / soft-delete broadcasts
  // AI_CHAT_SESSIONS_CHANGED_EVENT. For the thread on screen: deleted → a new
  // conversation and the dead param goes; renamed → re-read the title.
  useEffect(() => {
    const onSessionsChanged = () => {
      const openId = liveSessionIdRef.current;
      if (!hasTurns) return;
      void (async () => {
        try {
          const res = await fetch(`/api/ai/chat-sessions/${encodeURIComponent(openId)}`);
          if (res.status === 404) {
            newConversation();
            router.replace(pathname);
            return;
          }
          if (!res.ok) return;
          const data = (await res.json()) as { session: { title: string | null } };
          setRenamedTitle(data.session.title);
        } catch {
          /* the pane keeps what it has on a failed read */
        }
      })();
    };
    window.addEventListener(AI_CHAT_SESSIONS_CHANGED_EVENT, onSessionsChanged);
    return () => window.removeEventListener(AI_CHAT_SESSIONS_CHANGED_EVENT, onSessionsChanged);
  }, [hasTurns, newConversation, pathname, router]);

  // Publish the thread's name — the sidebar's current row: a rename, then the
  // stored / live AI summary, then an optimistic slice of the first message.
  const currentTitle =
    displaySessionTitle(renamedTitle ?? chat.title, '') ||
    chat.messages.find((m) => m.role === 'user')?.content.slice(0, 60) ||
    'New conversation';
  // The ID travels with the name so the row can RENAME in place; a thread
  // with no stored row publishes `null`, which disarms the rename.
  const renameableSessionId = chat.messages.length > 0 ? chat.sessionId : null;
  useEffect(() => {
    publishSessionTitle(currentTitle, renameableSessionId);
  }, [currentTitle, renameableSessionId]);

  /** The page context plus this message's `@` references and uploaded files. */
  const turnContext = useCallback((): AssistantPageContext | null => {
    const picked = mentions.mentions.length > 0 ? mentions.mentions : null;
    const files = attachments.ready.length > 0 ? attachments.ready : null;
    if (!context) return picked || files ? { page: 'home', mentions: picked, attachments: files } : null;
    return { ...context, mentions: picked, attachments: files };
  }, [context, mentions.mentions, attachments.ready]);

  const send = useCallback(
    (live?: string) => {
      const text = (live ?? draft).trim();
      if (!text || streaming) return;
      if (attachments.uploading) {
        toast.error('Still uploading — send once the files show Uploaded');
        return;
      }
      const ctx = turnContext();
      setDraft('');
      resetMentions();
      clearAttachments();
      scrollToEnd('smooth');
      if (editing && live === undefined) {
        setEditing(null);
        void chat.editAndResend(editing.messageId, text, ctx);
        return;
      }
      void chat.send(text, ctx);
    },
    [attachments.uploading, chat, clearAttachments, draft, editing, resetMentions, scrollToEnd, streaming, turnContext],
  );

  const startEdit = useCallback(
    (m: AssistantMessage) => {
      if (streaming || !isAddressableMessageId(m.id)) return;
      setEditing((prev) => ({ messageId: m.id, stash: prev ? prev.stash : draft }));
      setDraft(m.content);
      window.requestAnimationFrame(() => {
        const field = composerRef.current;
        field?.focus();
        field?.setSelectionRange(field.value.length, field.value.length);
      });
    },
    [draft, streaming],
  );
  const cancelEdit = useCallback(() => {
    if (!editing) return;
    setDraft(editing.stash);
    setEditing(null);
  }, [editing]);

  // ── Seeds (voice transcripts, "Ask about this row", the + menu) land here:
  // a draft to edit, or — when asked — a send.
  const seedSeq = useSyncExternalStore(subscribeComposerSeed, getComposerSeedSeq, () => 0);
  const appliedSeedRef = useRef(0);
  useEffect(() => {
    if (seedSeq === appliedSeedRef.current) return;
    appliedSeedRef.current = seedSeq;
    const seed = getLatestComposerSeed();
    if (!seed?.text) return;
    if (seed.autoSend) {
      send(seed.text);
      return;
    }
    setDraft(seed.text);
    composerRef.current?.focus();
  }, [seedSeq, send]);

  const lastAnswer = chat.messages.findLast((m) => m.role === 'assistant');
  const copyText = useCallback(
    (key: string, text: string, announce?: string) => {
      const ok = writeClipboardText(text);
      actionStates.set(key, ok ? 'done' : 'error');
      if (!ok) toast.error('Copy failed — the browser blocked the clipboard');
      else if (announce) toast.success(announce);
    },
    [actionStates],
  );

  useSessionHotkeys({
    onNewChat: () => {
      window.dispatchEvent(new CustomEvent(AI_CHAT_NEW_EVENT));
      if (sessionParam) router.replace(pathname);
      composerRef.current?.focus();
    },
    onFocusComposer: () => composerRef.current?.focus(),
    streaming,
    onStop: chat.stop,
    onCopyLastAnswer: () => {
      if (lastAnswer && !lastAnswer.streaming && lastAnswer.content) {
        copyText(`${lastAnswer.id}:copy`, lastAnswer.content, 'Copied the last answer');
      }
    },
  });

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    mentions.onKeyDown(e);
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (e.key === 'Escape' && editing) {
      e.preventDefault();
      cancelEdit();
      return;
    }
    // ↑ in an empty composer picks up the last question for editing.
    if (e.key === 'ArrowUp' && !draft && !streaming && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const lastQuestion = chat.messages.findLast((m) => m.role === 'user');
      if (lastQuestion && isAddressableMessageId(lastQuestion.id)) {
        e.preventDefault();
        startEdit(lastQuestion);
      }
    }
  };

  // ── Regenerate. A turn that proposed changes (write tools) asks first:
  // the proposals stay in the review queue and a re-run may propose again.
  const [confirmRegenerate, setConfirmRegenerate] = useState<string | null>(null);
  const regenerate = useCallback(
    (m: AssistantMessage, confirmed = false) => {
      const wrote = m.steps.some((s) => s.kind === 'tool' && (WRITE_TOOL_NAMES as readonly string[]).includes(s.name));
      if (wrote && !confirmed) {
        setConfirmRegenerate(m.id);
        return;
      }
      setConfirmRegenerate(null);
      scrollToEnd('smooth');
      void chat.regenerate(turnContext());
    },
    [chat, scrollToEnd, turnContext],
  );

  // ── "Thought process": the one answer whose trace is open — only ever by a
  // click on its lightbulb. × or Esc (focus in the transcript, not the
  // composer, and never while a turn runs — Esc is Stop then) closes it and
  // hands focus back to the lightbulb.
  const [traceFor, setTraceFor] = useState<string | null>(null);
  const closeTrace = useCallback(() => {
    const open = traceFor;
    setTraceFor(null);
    if (!open) return;
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(open)}"] [data-action="thinking"]`)?.focus(),
    );
  }, [traceFor]);
  useEffect(() => {
    if (!traceFor || streaming) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const focus = document.activeElement;
      const inTranscript = focus === document.body || (scrollRef.current?.contains(focus) ?? false);
      if (!inTranscript || focus?.closest('[data-testid="session-composer-dock"]')) return;
      e.preventDefault();
      closeTrace();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [traceFor, streaming, closeTrace]);

  // ── Feedback: optimistic thumbs; 👎 records at once, then offers reasons.
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reasonNote, setReasonNote] = useState('');
  const rate = useCallback(
    async (messageId: string, rating: -1 | 0 | 1, key: string, note?: string) => {
      actionStates.set(key, 'busy');
      const ok = await chat.rate(messageId, rating, note);
      actionStates.set(key, ok ? 'done' : 'error');
      if (!ok) toast.error('Could not save your feedback');
      return ok;
    },
    [actionStates, chat],
  );
  const submitReason = async (messageId: string, reason: string) => {
    const note = reason === 'Other' ? reasonNote.trim() : [reason, reasonNote.trim()].filter(Boolean).join(' — ');
    setReasonFor(null);
    setReasonNote('');
    if (note && (await rate(messageId, -1, `${messageId}:down`, note))) toast.success('Thanks — feedback saved');
  };

  // ── Retry after a rate limit waits out its cooldown; the label counts down.
  const [now, setNow] = useState(() => Date.now());
  const coolingUntil = lastAnswer?.error ? (lastAnswer.retryAfter ?? 0) : 0;
  useEffect(() => {
    if (coolingUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= coolingUntil) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [coolingUntil]);

  // Each result sits under the answer that produced it; a result with no
  // message (a printer report) sits at the foot. The same pass collects the
  // identifiers each answer's results carry — the only ids its prose may chip.
  const { cardsByMessage, idsByMessage } = useMemo(() => {
    const byMessage = new Map<string | null, SessionArtifactEntry[]>();
    const all = artifacts.pending ? [...artifacts.entries, artifacts.pending] : artifacts.entries;
    for (const entry of all) {
      const list = byMessage.get(entry.messageId) ?? [];
      list.push(entry);
      byMessage.set(entry.messageId, list);
    }
    const ids = new Map<string, ReadonlyMap<string, AnswerIdKind>>();
    for (const [messageId, list] of byMessage) {
      if (messageId === null) continue;
      ids.set(messageId, answerCopyIds(list.flatMap((e) => (e.artifact ? [e.artifact] : []))));
    }
    return { cardsByMessage: byMessage, idsByMessage: ids };
  }, [artifacts.entries, artifacts.pending]);
  const footCards = cardsByMessage.get(null) ?? [];

  const started = chat.messages.length > 0 || footCards.length > 0 || opening;

  // The sentinel exists only while chatting — re-observe when it mounts.
  useEffect(() => {
    const root = scrollRef.current;
    const end = endRef.current;
    if (!root || !end) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        pinnedRef.current = entry.isIntersecting;
        setPinned(entry.isIntersecting);
      },
      { root, rootMargin: `0px 0px ${PIN_SLACK_PX}px 0px` },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [started]);

  // The display rule: data inline, a document (or anything worked through
  // like one) as a compact card that opens the side panel.
  const renderResults = (entries: readonly SessionArtifactEntry[] | undefined) =>
    entries && entries.length > 0 ? (
      <div className="flex min-w-0 flex-col gap-4" data-session-artifact-cards>
        {entries.map((entry) => {
          const summary = artifactSummary(entry);
          const artifact = entry.artifact;
          const selected = artifacts.opened?.id === entry.id;
          const open = () => artifacts.open(entry.id);
          if (artifact && artifact.kind === 'document') {
            return <DocumentArtifactCard key={entry.id} artifact={artifact} onOpen={open} active={selected} />;
          }
          if (artifact && isInlineArtifact(artifact)) {
            return <InlineArtifact key={entry.id} artifact={artifact} summary={summary} open={selected} onExpand={open} />;
          }
          return (
            <AiArtifactCard
              key={entry.id}
              title={summary.title}
              kind={summary.kind}
              count={summary.count}
              icon={summary.icon}
              pending={entry.pending === true}
              stale={entry.staleAt !== undefined}
              selected={selected}
              onOpen={open}
            />
          );
        })}
      </div>
    ) : null;

  // ── The AI helper ABOVE the composer: a multi-line CSV paste is almost
  // always pending orders. Offer the triage verb instead of making the
  // operator ask. The paste still lands in the draft — the offer never
  // hijacks the input.
  const onComposerPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain').trim();
    const lines = text.split(/\r?\n/);
    const cols = lines[0]?.split(',').length ?? 0;
    if (lines.length >= 2 && lines.length <= 500 && cols >= 2) setCsvOffer({ rows: lines.length - 1, cols, text });
  };
  const triagePastedCsv = () => {
    if (!csvOffer) return;
    setCsvOffer(null);
    send(
      `Triage this pasted CSV of pending orders for import — which rows are accepted, which need resolution and why:\n\n${csvOffer.text}`,
    );
  };

  // ── The + menu and the voice / send / stop key ──────────────────────────
  const [plusOpen, setPlusOpen] = useState(false);
  const plusAnchorRef = useRef<HTMLButtonElement | null>(null);
  const closePlus = useCallback(() => setPlusOpen(false), []);
  const hasText = draft.trim().length > 0;
  const listening = voice.state === 'listening';
  const transcribing = voice.state === 'transcribing';

  const plusMenu = (
    <>
      <button
        ref={plusAnchorRef}
        type="button"
        aria-label="Add context"
        aria-expanded={plusOpen}
        onClick={() => setPlusOpen((v) => !v)}
        className={cn('ds-raw-button', AI_ICON_BUTTON_CLASS, AI_FOCUS_CLASS)}
      >
        <Plus className="h-4 w-4" />
      </button>
      <ComposerPlusMenuPanel open={plusOpen} onClose={closePlus} anchorRef={plusAnchorRef} ariaLabel="Add context menu">
        <SessionPlusMenu onClose={closePlus} onAttachFiles={attachments.add} />
      </ComposerPlusMenuPanel>
    </>
  );

  // While a turn runs the send slot IS Stop — a square key a size up from send
  // (tooltip "Stop (Esc)"); a draft typed ahead waits for the turn to end.
  const voiceOrSend = streaming ? (
    <button
      type="button"
      data-testid="composer-stop"
      aria-label="Stop generating"
      title="Stop (Esc)"
      onClick={chat.stop}
      className={cn('ds-raw-button', AI_STOP_BUTTON_CLASS, AI_FOCUS_CLASS)}
    >
      <Stop className="h-3.5 w-3.5" />
    </button>
  ) : (
    <button
      type="button"
      data-testid="composer-voice-commit"
      aria-label={
        listening ? 'Stop recording' : transcribing ? 'Transcribing' : hasText ? (editing ? 'Send edited message' : 'Send message') : 'Dictate'
      }
      title={listening ? 'Stop recording' : hasText ? 'Send (Enter)' : 'Dictate'}
      disabled={transcribing || (!hasText && voice.state === 'unsupported')}
      onClick={() => {
        if (listening) voice.stop();
        else if (hasText) send();
        else voice.toggle();
      }}
      className={cn(
        'ds-raw-button',
        AI_FOCUS_CLASS,
        listening
          ? cn(AI_PRIMARY_BUTTON_CLASS, 'bg-fill-danger hover:bg-fill-danger')
          : hasText
            ? AI_PRIMARY_BUTTON_CLASS
            : AI_ICON_BUTTON_CLASS,
      )}
    >
      {transcribing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : listening ? (
        <span className="h-2.5 w-2.5 animate-pulse rounded-sm bg-ai-solid-ink" />
      ) : hasText ? (
        <ArrowUp className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );

  const composerGlide = useMotionTransition(aiTransition.composerGlide);
  const columnShift = useMotionTransition(aiTransition.columnShift);
  const chipsPresence = useMotionPresence(aiPresence.chips);
  const popPresence = useMotionPresence(aiPresence.glyph);
  const popTransition = useMotionTransition(aiTransition.morph);
  const leaveTransition = useMotionTransition(aiTransition.leave);

  const lastIndex = chat.messages.length - 1;

  const renderAnswer = (m: AssistantMessage, index: number) => {
    const isLast = index === lastIndex;
    const settled = !m.streaming;
    const rateable = settled && !m.error && m.content.length > 0 && isAddressableMessageId(m.id);
    const upKey = `${m.id}:up`;
    const downKey = `${m.id}:down`;
    const actions: AiTurnAction[] = [];
    if (settled && !m.error && m.content) {
      actions.push({
        id: 'copy',
        label: 'Copy',
        hint: 'Copy answer',
        icon: <Copy className="h-3.5 w-3.5" />,
        onClick: () => copyText(`${m.id}:copy`, m.content),
        state: actionStates.get(`${m.id}:copy`),
      });
    }
    if (isLast && settled && !m.error && !streaming) {
      actions.push({
        id: 'regenerate',
        label: 'Regenerate',
        hint: 'Ask again for a new answer',
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        onClick: () => regenerate(m),
      });
    }
    if (rateable) {
      actions.push(
        {
          id: 'up',
          label: m.feedback === 1 ? 'Remove rating' : 'Good answer',
          icon: <ThumbsUp className="h-3.5 w-3.5" />,
          pressed: m.feedback === 1,
          onClick: () => void rate(m.id, m.feedback === 1 ? 0 : 1, upKey),
          state: actionStates.get(upKey),
        },
        {
          id: 'down',
          label: m.feedback === -1 ? 'Remove rating' : 'Bad answer',
          icon: <ThumbsDown className="h-3.5 w-3.5" />,
          pressed: m.feedback === -1,
          onClick: () => {
            if (m.feedback === -1) {
              setReasonFor(null);
              void rate(m.id, 0, downKey);
              return;
            }
            void rate(m.id, -1, downKey);
            setReasonNote('');
            setReasonFor(m.id);
          },
          state: actionStates.get(downKey),
        },
      );
    }
    // "Thought process": the turn's steps, reasoning and cost, folded into one
    // small lightbulb once the answer has landed. Nothing opens it but a click.
    const traceable = settled && (m.steps.length > 0 || m.thinkingMs !== null);
    if (traceable) {
      actions.push({
        id: 'thinking',
        label: 'Thought process',
        icon: <Thought className="h-3.5 w-3.5" />,
        pressed: traceFor === m.id,
        onClick: () => (traceFor === m.id ? closeTrace() : setTraceFor(m.id)),
      });
    }
    const retryable = isLast && m.error && !streaming && RETRYABLE_ERROR_CODES[m.errorCode ?? 'internal'] === true;
    const coolSeconds = Math.max(0, Math.ceil(((m.retryAfter ?? 0) - now) / 1000));
    return (
      <AiTurn key={m.id} className="group/turn flex min-w-0 flex-col gap-3" data-message-id={m.id} data-role="assistant">
        {renderResults(cardsByMessage.get(m.id))}
        {m.streaming && !m.content ? <ThinkingLine steps={m.steps} /> : null}
        {m.error ? (
          <div className="flex flex-wrap items-center gap-2" data-turn-error={m.errorCode ?? 'internal'}>
            <p className="text-ai-prose text-text-danger">{m.content}</p>
            {retryable ? (
              <button
                type="button"
                disabled={coolSeconds > 0}
                onClick={() => {
                  scrollToEnd('smooth');
                  void chat.regenerate(turnContext());
                }}
                className={cn('ds-raw-button gap-1.5 disabled:opacity-50', AI_CHIP_CLASS, AI_FOCUS_CLASS)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {coolSeconds > 0 ? `Retry in ${coolSeconds}s` : 'Retry'}
              </button>
            ) : null}
            {isLast && m.errorCode === 'foreign_session' ? (
              <button
                type="button"
                onClick={() => {
                  newConversation();
                  router.replace(pathname);
                }}
                className={cn('ds-raw-button', AI_CHIP_CLASS, AI_FOCUS_CLASS)}
              >
                Start a new chat
              </button>
            ) : null}
          </div>
        ) : (
          <AssistantReply
            id={m.id}
            content={m.content || (settled && m.steps.length > 0 && !m.stopped ? NO_ANSWER_FALLBACK : '')}
            streaming={m.streaming}
            ids={idsByMessage.get(m.id) ?? NO_IDS}
          />
        )}
        {m.stopped ? (
          <p className={AI_LABEL_CLASS} data-turn-stopped>
            Stopped
          </p>
        ) : null}
        {chat.printJobs
          .filter((job) => job.messageId === m.id)
          .map((job) => (
            <ChatPrintJobCard key={job.id} job={job} setPhase={chat.setPrintPhase} />
          ))}
        {isLast && settled && !streaming && !m.error && m.suggestions && m.suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2" data-follow-ups>
            {m.suggestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => send(item)}
                className={cn('ds-raw-button text-left', AI_CHIP_CLASS, AI_FOCUS_CLASS)}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
        {actions.length > 0 ? (
          <AiTurnActions actions={actions} visible={isLast || reasonFor === m.id}>
            {reasonFor === m.id ? (
              <div
                role="group"
                aria-label="What went wrong?"
                className={cn(AI_NOTICE_CLASS, 'absolute left-0 top-full z-10 mt-1 flex w-80 max-w-[85vw] flex-col gap-2 bg-ai-surface shadow-ai-card')}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setReasonFor(null);
                  }
                }}
                data-feedback-reasons
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ai-prose-sm text-ai-muted">What went wrong?</p>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setReasonFor(null)}
                    className={cn('ds-raw-button h-6 w-6', AI_ICON_BUTTON_CLASS, AI_FOCUS_CLASS)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value.slice(0, 500))}
                  placeholder="Add a note (optional)"
                  aria-label="Feedback note"
                  className="rounded-ai-control border border-ai-line bg-ai-canvas px-2.5 py-1.5 text-ai-prose-sm text-ai-ink outline-none placeholder:text-ai-faint focus:border-ai-line-strong"
                />
                <div className="flex flex-wrap gap-1.5">
                  {THUMBS_DOWN_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => void submitReason(m.id, reason)}
                      className={cn('ds-raw-button', AI_CHIP_CLASS, AI_FOCUS_CLASS)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </AiTurnActions>
        ) : null}
        {traceable ? (
          <ThinkingTrace open={traceFor === m.id} steps={m.steps} thinkingMs={m.thinkingMs} usage={m.usage} onClose={closeTrace} />
        ) : null}
        {confirmRegenerate === m.id ? (
          <div className={cn(AI_NOTICE_CLASS, 'flex items-center justify-between gap-3')} data-regenerate-confirm>
            <p className="min-w-0 text-ai-prose-sm text-ai-muted">
              This answer proposed changes; regenerating may propose them again.
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => regenerate(m, true)} className={cn('ds-raw-button', AI_ACTION_CLASS, AI_FOCUS_CLASS)}>
                Regenerate
              </button>
              <button type="button" onClick={() => setConfirmRegenerate(null)} className={cn('ds-raw-button', AI_CHIP_CLASS, AI_FOCUS_CLASS)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </AiTurn>
    );
  };

  const renderQuestion = (m: AssistantMessage) => {
    const addressable = isAddressableMessageId(m.id);
    const actions: AiTurnAction[] = [
      {
        id: 'copy',
        label: 'Copy',
        icon: <Copy className="h-3.5 w-3.5" />,
        onClick: () => copyText(`${m.id}:copy`, m.content),
        state: actionStates.get(`${m.id}:copy`),
      },
    ];
    if (addressable) {
      actions.push({
        id: 'edit',
        label: 'Edit',
        icon: <Pencil className="h-3.5 w-3.5" />,
        disabled: streaming,
        pressed: editing?.messageId === m.id,
        onClick: () => startEdit(m),
      });
    }
    return (
      <AiTurn key={m.id} className="group/turn flex flex-col items-end gap-1" data-message-id={m.id} data-role="user">
        {/* The operator's turn is markdown too — a pasted list or **bold**
            formats in the bubble exactly as the reply does. */}
        <div
          className={cn(
            AI_USER_BUBBLE_CLASS,
            '[&>*:last-child]:mb-0 transition-opacity duration-150',
            editing?.messageId === m.id && 'opacity-60',
          )}
        >
          <MarkdownRenderer content={m.content} variant="ai-bubble" />
        </div>
        <AiTurnActions actions={actions} align="end" />
      </AiTurn>
    );
  };

  return (
    // The page area IS the scrollport; the column centres inside it and
    // re-centres (a layout transform) when the side panel docks beside it.
    <motion.div
      ref={scrollRef}
      layoutScroll
      className={cn('flex h-full min-h-0 flex-col overflow-y-auto', className)}
      aria-label="AI conversation"
      data-session-column={started ? 'chatting' : 'empty'}
      data-session-transcript
    >
      {started ? (
        <motion.div
          layout={reduced ? false : 'position'}
          layoutDependency={panelDocked}
          transition={columnShift}
          className={cn(AI_COLUMN_CLASS, 'flex flex-1 flex-col gap-ai-turn pb-6 pt-8')}
        >
          {opening && chat.messages.length === 0 ? (
            <p className={cn(AI_LABEL_CLASS, 'flex items-center gap-2')} data-session-opening>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening conversation…
            </p>
          ) : null}
          {chat.messages.map((m, index) => (m.role === 'user' ? renderQuestion(m) : renderAnswer(m, index)))}
          {renderResults(footCards)}
          {/*
            In-chat OAuth handoffs sit at the FOOT of the transcript, after
            the sentence that raised them, so the ask and the button read as
            one thought.
          */}
          {chat.connectionPrompts.map((prompt) => (
            <AiTurn key={prompt.id}>
              <ConnectAppPill
                prompt={prompt}
                onConnected={(landed) => {
                  // Resume where the operator left off: seed the question
                  // that needed the app and let THEM press Enter.
                  const askedFor = chat.messages.findLast((m) => m.role === 'user')?.content;
                  if (askedFor) requestComposerSeed({ text: askedFor, autoSend: false });
                  window.setTimeout(() => chat.dismissConnectionPrompt(landed.id), 4000);
                }}
              />
            </AiTurn>
          ))}
          <div ref={endRef} aria-hidden className="h-px" data-session-end />
        </motion.div>
      ) : (
        <div className="flex-1" aria-hidden />
      )}

      <div className={cn('shrink-0', started && cn(AI_COMPOSER_DOCK_CLASS, 'pt-6'))}>
        <div className={cn(AI_COLUMN_CLASS, 'relative pb-3')}>
          <AnimatePresence initial={false}>
            {started && !pinned ? (
              <motion.button
                key="to-end"
                type="button"
                {...popPresence}
                transition={popTransition}
                onClick={() => scrollToEnd('smooth')}
                aria-label="Scroll to latest"
                data-scroll-to-end
                className={cn(
                  'ds-raw-button',
                  AI_ICON_BUTTON_CLASS,
                  AI_FOCUS_CLASS,
                  'absolute -top-10 left-1/2 -ml-4 rounded-full border border-ai-line bg-ai-surface shadow-ai-card',
                )}
              >
                <ArrowDown className="h-4 w-4" />
                {streaming ? (
                  <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-ai-solid" aria-hidden data-new-below />
                ) : null}
              </motion.button>
            ) : null}
          </AnimatePresence>
          <AnimatePresence mode="popLayout" initial={false}>
            {started ? null : <FocusGreeting key="greeting" exitTransition={leaveTransition} />}
          </AnimatePresence>
          {csvOffer ? (
            <AiTurn className={cn(AI_NOTICE_CLASS, 'mb-2 flex items-center justify-between gap-3')} data-csv-helper>
              <p className="min-w-0 text-ai-prose-sm text-ai-muted">
                CSV detected — {csvOffer.rows} rows × {csvOffer.cols} columns. Triage it for order import?
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={triagePastedCsv} className={cn('ds-raw-button', AI_ACTION_CLASS, AI_FOCUS_CLASS)}>
                  Triage
                </button>
                <button type="button" onClick={() => setCsvOffer(null)} className={cn('ds-raw-button', AI_CHIP_CLASS, AI_FOCUS_CLASS)}>
                  Dismiss
                </button>
              </div>
            </AiTurn>
          ) : null}
          {voice.error ? (
            <p className={cn(AI_NOTICE_CLASS, 'mb-2 text-ai-prose-sm text-ai-muted')} role="status" data-voice-notice>
              {voice.error}
            </p>
          ) : null}
          {editing ? (
            <div className="mb-2 flex items-center gap-2" data-editing-chip>
              <span className={cn(AI_CHIP_CLASS, 'gap-1.5 hover:bg-ai-surface')}>
                <Pencil className="h-3 w-3" /> Editing · Esc to cancel
              </span>
              <button
                type="button"
                aria-label="Cancel editing"
                onClick={cancelEdit}
                className={cn('ds-raw-button h-7 w-7', AI_ICON_BUTTON_CLASS, AI_FOCUS_CLASS)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <motion.div
            layoutId={AI_COMPOSER_LAYOUT_ID}
            layout={reduced ? false : 'position'}
            layoutDependency={`${started}:${panelDocked}`}
            transition={composerGlide}
            data-testid="session-composer-dock"
          >
            {/* Calm while a turn runs: no edge, no shimmer — the Stop key says it is working. */}
            <ComposerDropzone items={attachments.items} onFiles={attachments.add} onRemove={attachments.remove}>
              <AiComposer
                textareaRef={composerRef}
                value={draft}
                onChange={setDraft}
                onSubmit={() => send()}
                onPaste={onComposerPaste}
                onKeyDown={onComposerKeyDown}
                overlay={mentions.overlay}
                placeholder={editing ? 'Edit your message…' : started ? 'Reply…' : 'Ask anything…'}
                leading={
                  <>
                    {plusMenu}
                    <AccessModeSwitch mode={accessMode} onChange={setAccessMode} fieldRef={composerRef} />
                  </>
                }
                trailing={
                  <>
                    <ContextUsageRing messages={chat.messages} title={currentTitle} />
                    {voiceOrSend}
                  </>
                }
              />
            </ComposerDropzone>
          </motion.div>
          <AnimatePresence mode="popLayout" initial={false}>
            {started ? null : (
              <motion.div
                key="suggestions"
                {...chipsPresence}
                transition={leaveTransition}
                className="mt-4 flex flex-wrap justify-center gap-2"
                data-session-suggestions
              >
                {(capabilityStarters ?? suggestionsForToday(new Date().getDay())).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className={cn('ds-raw-button', AI_CHIP_CLASS, AI_FOCUS_CLASS)}
                  >
                    {s}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {started ? null : <div className="flex-1" aria-hidden />}
    </motion.div>
  );
}

// ─── The greeting ────────────────────────────────────────────────────────────

/** "Good afternoon, Mia" — the time of day and the operator's first name, nothing else. */
function FocusGreeting({ exitTransition }: { exitTransition: Transition }) {
  const presence = useMotionPresence(aiPresence.greeting);
  const enter = useMotionTransition(aiTransition.turn);
  const firstName = useAuth().user?.name.trim().split(/\s+/)[0] ?? '';
  // Warehouse-zone hour, not the host's: the server (UTC) and the browser must
  // print the same greeting, or hydration throws React #418 and re-renders.
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: WAREHOUSE_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(new Date()),
  );
  const partOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <motion.p
      initial={presence.initial}
      animate={{ ...presence.animate, transition: enter }}
      exit={{ ...presence.exit, transition: exitTransition }}
      className="mb-7 text-balance text-center text-ai-greeting text-ai-ink"
      data-session-start
    >
      {firstName ? `${partOfDay}, ${firstName}` : partOfDay}
    </motion.p>
  );
}

// ─── The answer ──────────────────────────────────────────────────────────────

/** One dispatch per table per reply — survives re-renders and StrictMode. */
const dispatchedTables = new Set<string>();

/** An answer whose turn returned no identifiers. */
const NO_IDS: ReadonlyMap<string, AnswerIdKind> = new Map();

/**
 * AssistantReply — the answer's PROSE. A GFM table the model leaks into text
 * is MOVED to a result under this answer (the same validated pipeline as
 * render_artifact, rendered inline like any data) and stripped from the text.
 * Dispatch waits for the turn to settle so partial streaming tables never fire.
 *
 * Scannable for triage: numbers with units turn bold, and the identifiers this
 * turn's tools returned (`ids`, never a guess from the text) become copy chips.
 */
function AssistantReply({
  id,
  content,
  streaming,
  ids,
}: {
  id: string;
  content: string;
  streaming?: boolean;
  ids: ReadonlyMap<string, AnswerIdKind>;
}) {
  // Normalize BEFORE extraction so the table mover and the renderer see the
  // same coerced text — an H1 or a tab-indented list is fixed once, here.
  const { tables, text } = useMemo(() => extractGfmTables(normalizeAssistantProse(content)), [content]);
  const emphasized = useMemo(() => emphasizeAnswer(text, ids), [text, ids]);
  const renderInlineCode = useCallback((code: string) => {
    const kind = ids.get(code);
    return kind ? <AnswerIdChip value={code} kind={kind} /> : null;
  }, [ids]);
  useEffect(() => {
    if (streaming || tables.length === 0) return;
    tables.forEach((t, idx) => {
      const key = `${id}:${idx}:${t.rows.length}`;
      if (dispatchedTables.has(key)) return;
      dispatchedTables.add(key);
      const artifact: ArtifactTable = { kind: 'table', title: t.title, columns: t.columns, rows: t.rows };
      const detail: SessionArtifactEventDetail = { artifact, messageId: id };
      window.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_EVENT, { detail }));
    });
  }, [id, tables, streaming]);
  if (!text && !streaming) return null;
  return (
    <div className="min-w-0" data-answer-prose>
      <MarkdownRenderer content={emphasized} variant="ai" renderInlineCode={renderInlineCode} />
    </div>
  );
}
