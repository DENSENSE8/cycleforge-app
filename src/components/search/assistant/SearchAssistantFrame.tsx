'use client';

/**
 * Search × AI (owner 2026-09-27): the assistant, asked from `/search`, with the
 * open record (`?sel=`) and the query (`?q=`) as its context.
 *
 * Three states, one choreography (Motion + Motion+):
 * - **closed** — a pill floats at the foot of the search ("Ask about Order …",
 *   typing its prompt with Motion+ `Typewriter`). ⌘J / Ctrl+J opens it.
 * - **composing** — the pill morphs (shared `layoutId`) into the AI composer,
 *   still floating over the record, already carrying the record as a chip.
 * - **conversing** — on the first send the conversation pane slides in from the
 *   LEFT and the composer glides into its foot; the search record / results
 *   stay live on the right. A `/search?sel=` link in an answer re-opens the
 *   record on the right instead of leaving the page.
 *
 * The thread is this search visit's own (`useAssistantChat()`); "Open in Chat"
 * continues it on `/ai-chat?session=`. Desktop only — the phone keeps
 * `/m/assistant`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from '@/design-system/motion';
import { Typewriter } from '@/design-system/motion/plus';
import {
  AI_CHIP_CLASS,
  AI_COMPOSER_SHELL_CLASS,
  AI_FOCUS_CLASS,
  AI_ICON_BUTTON_CLASS,
  AI_LABEL_CLASS,
  AI_PRIMARY_BUTTON_CLASS,
  AI_STOP_BUTTON_CLASS,
  AI_SURFACE_CLASS,
  AI_USER_BUBBLE_CLASS,
  AiArtifactCard,
  AiComposer,
  AiTurn,
  aiTransition,
} from '@/design-system/ai';
import { ArrowUp, Maximize2, Plus, Sparkles, Stop, X } from '@/components/Icons';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import { ThinkingLine } from '@/components/ai/ThinkingTrace';
import { useAssistantChat, type AssistantMessage } from '@/components/assistant/useAssistantChat';
import { ensureSessionArtifactListener, useSessionArtifacts, type SessionArtifactEntry } from '@/components/session/useSessionArtifacts';
import { InlineArtifact } from '@/components/session/artifacts/InlineArtifact';
import { artifactSummary } from '@/components/session/artifacts/artifact-summary';
import { isInlineArtifact } from '@/lib/assistant/artifact-placement';
import { normalizeAssistantProse } from '@/lib/assistant/prose-normalize';
import { searchOrderByIdResolveQuery } from '@/lib/search/search-order-resolve-query';
import { parseSearchSel, type SearchSelection } from '@/lib/search/search-selection';
import { cn } from '@/utils/_cn';
import { zIndex } from '@/design-system/tokens/z-index';
import {
  searchAssistantContext,
  searchAssistantPrompt,
  type SearchAssistantRecord,
} from './search-assistant-context';
import { KeyboardKey } from '@/design-system/primitives';

/** Shared-layout id: the pill, the floating composer and the pane's composer are ONE node. */
const COMPOSER_LAYOUT_ID = 'search-ai-composer';
/** The conversation pane's width once open (px — Motion springs a number, not `min()`). */
const PANE_WIDTH_PX = 440;

const KIND_LABEL: Record<SearchSelection['entityType'], string> = {
  order: 'Order',
  receiving: 'Carton',
  unit: 'Unit',
  sku: 'SKU',
  repair: 'Repair',
  fba: 'FBA shipment',
  warranty: 'Warranty',
  ticket: 'Ticket',
  location: 'Bin',
};

const NO_CARDS: readonly SessionArtifactEntry[] = [];

type FrameState = 'closed' | 'composing' | 'conversing';

export function SearchAssistantFrame({
  sel,
  query,
  onSelect,
  children,
}: {
  sel: SearchSelection | null;
  query: string;
  /** Open a record on the right (an answer's `/search?sel=` link). */
  onSelect: (next: SearchSelection) => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;
  const router = useRouter();
  const chat = useAssistantChat();
  const artifacts = useSessionArtifacts();
  useEffect(() => {
    ensureSessionArtifactListener();
  }, []);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const state: FrameState = !open ? 'closed' : chat.messages.length > 0 ? 'conversing' : 'composing';

  // The open order's face, from the record's own resolve (same key → cache hit, no request).
  const orderPk = sel?.entityType === 'order' ? sel.id : 0;
  const { data: resolvedOrder } = useQuery({ ...searchOrderByIdResolveQuery(orderPk), enabled: orderPk > 0 });
  const record = useMemo<SearchAssistantRecord | null>(() => {
    if (!sel) return null;
    const orderNumber =
      sel.entityType === 'order' && resolvedOrder?.status === 'ok'
        ? String(resolvedOrder.order.order_id ?? '').trim()
        : '';
    return { sel, label: `${KIND_LABEL[sel.entityType]} ${orderNumber || sel.id}`, orderNumber: orderNumber || null };
  }, [sel, resolvedOrder]);
  const context = useMemo(() => searchAssistantContext(record, query), [record, query]);
  const prompt = searchAssistantPrompt(record, query);
  const streaming = chat.status === 'streaming';

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const openAssistant = useCallback(() => {
    setOpen(true);
    focusComposer();
  }, [focusComposer]);

  // ⌘J / Ctrl+J toggles the assistant from anywhere on the search.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'j' || event.altKey || event.shiftKey) return;
      event.preventDefault();
      setOpen((was) => {
        if (!was) focusComposer();
        return !was;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusComposer]);

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || streaming) return;
      setDraft('');
      void chat.send(message, context);
      focusComposer();
    },
    [chat, context, streaming, focusComposer],
  );

  // An answer's `/search?sel=` link opens that record on the right, in place.
  const onTranscriptClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== '/search') return;
      const next = parseSearchSel(url.searchParams.get('sel'));
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      onSelect(next);
    },
    [onSelect],
  );

  const composer = (
    <AiComposer
      value={draft}
      onChange={setDraft}
      onSubmit={() => send(draft)}
      placeholder={prompt}
      ariaLabel="Ask the assistant about this search"
      textareaRef={textareaRef}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
      }}
      leading={<ContextChips record={record} query={query} />}
      trailing={
        streaming ? (
          <button type="button" aria-label="Stop" onClick={() => chat.stop()} className={cn('ds-raw-button', AI_STOP_BUTTON_CLASS, AI_FOCUS_CLASS)}>
            <Stop className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Send"
            disabled={!draft.trim()}
            onClick={() => send(draft)}
            className={cn('ds-raw-button', AI_PRIMARY_BUTTON_CLASS, AI_FOCUS_CLASS)}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )
      }
    />
  );

  const cardsByMessage = useMemo(() => artifactsByMessage(artifacts.entries, artifacts.pending), [artifacts.entries, artifacts.pending]);
  const cardsFor = (messageId: string) => cardsByMessage.get(messageId) ?? NO_CARDS;
  const openInChat = () => router.push(`/ai-chat?session=${encodeURIComponent(chat.sessionId)}`);

  return (
    <LayoutGroup id="search-ai">
      <div className="relative flex min-h-0 w-full flex-1 overflow-hidden" data-search-ai={state}>
        <AnimatePresence initial={false}>
          {state === 'conversing' ? (
            <motion.aside
              key="search-ai-pane"
              data-ai-surface
              aria-label="Assistant"
              data-testid="search-ai-pane"
              className={cn(AI_SURFACE_CLASS, 'relative flex h-full shrink-0 flex-col overflow-hidden border-r border-ai-line')}
              initial={reduced ? { opacity: 0, width: PANE_WIDTH_PX } : { opacity: 0, width: 0, x: -24 }}
              animate={{ opacity: 1, width: PANE_WIDTH_PX, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, width: 0, x: -24 }}
              transition={reduced ? { duration: 0 } : aiTransition.panel}
            >
              <div className="flex h-full flex-col" style={{ width: PANE_WIDTH_PX }}>
                <header className="flex shrink-0 items-center gap-2 border-b border-ai-line px-4 py-2.5">
                  <Sparkles className="h-4 w-4 text-ai-muted" aria-hidden />
                  <p className="min-w-0 flex-1 truncate text-ai-prose-sm text-ai-ink">{record ? record.label : 'Search assistant'}</p>
                  <button type="button" title="New conversation" aria-label="New conversation" onClick={() => chat.reset()} className={cn('ds-raw-button', AI_ICON_BUTTON_CLASS, AI_FOCUS_CLASS)}>
                    <Plus className="h-4 w-4" />
                  </button>
                  <button type="button" title="Open in Chat" aria-label="Open in Chat" onClick={openInChat} className={cn('ds-raw-button', AI_ICON_BUTTON_CLASS, AI_FOCUS_CLASS)}>
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <button type="button" title="Close (Esc)" aria-label="Close assistant" onClick={() => setOpen(false)} className={cn('ds-raw-button', AI_ICON_BUTTON_CLASS, AI_FOCUS_CLASS)}>
                    <X className="h-4 w-4" />
                  </button>
                </header>
                <Transcript
                  messages={chat.messages}
                  streaming={streaming}
                  cardsFor={cardsFor}
                  onFollowUp={send}
                  onOpenCard={openInChat}
                  onClick={onTranscriptClick}
                />
                <motion.div layoutId={COMPOSER_LAYOUT_ID} transition={aiTransition.composerGlide} className="shrink-0 px-3 pb-3 pt-1">
                  {composer}
                </motion.div>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {/* The search itself — the record / results, live on the right while chatting. */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {children}
          {state !== 'conversing' ? (
            // Above the detail workspace's panel layer, below its popovers.
            <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4" style={{ zIndex: zIndex.panel + 2 }}>
              {state === 'composing' ? (
                <motion.div
                  layoutId={COMPOSER_LAYOUT_ID}
                  data-ai-surface
                  data-testid="search-ai-composer"
                  className={cn(AI_SURFACE_CLASS, 'pointer-events-auto w-full max-w-2xl bg-transparent')}
                  transition={reduced ? { duration: 0 } : aiTransition.composerGlide}
                >
                  {composer}
                </motion.div>
              ) : (
                <motion.button
                  type="button"
                  layoutId={COMPOSER_LAYOUT_ID}
                  data-ai-surface
                  data-testid="search-ai-pill"
                  onClick={openAssistant}
                  transition={reduced ? { duration: 0 } : aiTransition.composerGlide}
                  whileHover={reduced ? undefined : { y: -2 }}
                  whileTap={reduced ? undefined : { scale: 0.97 }}
                  className={cn(
                    'ds-raw-button pointer-events-auto flex h-11 max-w-md items-center gap-2.5 px-4 text-left',
                    AI_SURFACE_CLASS,
                    AI_COMPOSER_SHELL_CLASS,
                    AI_FOCUS_CLASS,
                  )}
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-ai-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ai-prose-sm text-ai-muted">
                    {reduced ? prompt : <Typewriter speed="fast">{prompt}</Typewriter>}
                  </span>
                  {chat.messages.length > 0 ? <span className={AI_LABEL_CLASS}>Resume</span> : null}
                  <KeyboardKey size="xs">⌘J</KeyboardKey>
                </motion.button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </LayoutGroup>
  );
}

/** What the question carries: the open record and the query, as quiet chips. */
function ContextChips({ record, query }: { record: SearchAssistantRecord | null; query: string }) {
  const q = query.trim();
  if (!record && !q) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5" data-testid="search-ai-context">
      {record ? <span className={cn(AI_CHIP_CLASS, 'max-w-[14rem] truncate px-2.5 py-0.5')}>{record.label}</span> : null}
      {q ? <span className={cn(AI_CHIP_CLASS, 'max-w-[10rem] truncate px-2.5 py-0.5')}>“{q}”</span> : null}
    </span>
  );
}

function artifactsByMessage(
  entries: readonly SessionArtifactEntry[],
  pending: SessionArtifactEntry | null,
): Map<string, SessionArtifactEntry[]> {
  const out = new Map<string, SessionArtifactEntry[]>();
  for (const entry of pending ? [...entries, pending] : entries) {
    if (!entry.messageId) continue;
    const list = out.get(entry.messageId);
    if (list) list.push(entry);
    else out.set(entry.messageId, [entry]);
  }
  return out;
}

function Transcript({
  messages,
  streaming,
  cardsFor,
  onFollowUp,
  onOpenCard,
  onClick,
}: {
  messages: readonly AssistantMessage[];
  streaming: boolean;
  cardsFor: (messageId: string) => readonly SessionArtifactEntry[];
  onFollowUp: (text: string) => void;
  onOpenCard: () => void;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  // Follow the answer as it streams, unless the operator scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.content, last?.steps.length]);

  return (
    <div ref={scrollRef} onClickCapture={onClick} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-testid="search-ai-transcript">
      <div className="flex flex-col gap-5">
        {messages.map((m, index) =>
          m.role === 'user' ? (
            <AiTurn key={m.id} className="flex justify-end">
              <div className={AI_USER_BUBBLE_CLASS}>{m.content}</div>
            </AiTurn>
          ) : (
            <AiTurn key={m.id} className="flex min-w-0 flex-col gap-3" data-role="assistant">
              {cardsFor(m.id).map((entry) => {
                const summary = artifactSummary(entry);
                return entry.artifact && isInlineArtifact(entry.artifact) ? (
                  <InlineArtifact key={entry.id} artifact={entry.artifact} summary={summary} open={false} onExpand={onOpenCard} />
                ) : (
                  <AiArtifactCard
                    key={entry.id}
                    title={summary.title}
                    kind={summary.kind}
                    count={summary.count}
                    icon={summary.icon}
                    pending={entry.pending === true}
                    stale={entry.staleAt !== undefined}
                    onOpen={onOpenCard}
                  />
                );
              })}
              {m.streaming && !m.content ? <ThinkingLine steps={m.steps} /> : null}
              {m.error ? (
                <p className="text-ai-prose text-text-danger">{m.content}</p>
              ) : m.content ? (
                <div className="min-w-0" data-answer-prose>
                  <MarkdownRenderer content={normalizeAssistantProse(m.content)} variant="ai" />
                </div>
              ) : null}
              {index === messages.length - 1 && !streaming && !m.error && m.suggestions?.length ? (
                <div className="flex flex-wrap gap-2">
                  {m.suggestions.map((item) => (
                    <button key={item} type="button" onClick={() => onFollowUp(item)} className={cn('ds-raw-button text-left', AI_CHIP_CLASS, AI_FOCUS_CLASS)}>
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </AiTurn>
          ),
        )}
      </div>
    </div>
  );
}
