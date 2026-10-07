'use client';

/**
 * The header's clean split (owner 2026-09-29):
 *  - TOP-LEFT is what YOU do next — {@link HeaderNextAction}: on Unbox, the
 *    last scan's feedback the instant it is known (found / unfound, and for an
 *    unfound carton the Zendesk ticket linked to it), with this session's scan
 *    history one click away; then the newest unread follow-up alert a
 *    teammate sent you (R7 — click opens `/?task=<id>` and reads it);
 *    otherwise this page's next step on the floor
 *    (`@/lib/nav/next-actions`), rolling only while hovered (the FindField
 *    law). It never repeats Find / ⌘K.
 *  - TOP-RIGHT is what the SYSTEM is doing — Sync spins while anything syncs or
 *    prints, and a print job exists ONLY as {@link PrintJobOverlay}'s cards
 *    (no header pill, no second counter anywhere).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';
import { RollingHint, useHintActivity } from '@/design-system/components/FindField';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence } from '@/design-system/foundations/motion-presets-hooks';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { Popover } from '@/design-system/primitives/Popover';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useBackgroundWork, type WorkItem } from '@/lib/background-work/store';
import { DURABLE_INBOX_QUERY_KEY, followUpDueLabel, useFollowUpAlerts } from '@/lib/notifications/use-durable-inbox';
import { inboxContactsLine } from '@/lib/notifications/inbox-contacts';
import { scrubRelayAddresses } from '@/lib/support/contact-face';
import type { InboxItemDto } from '@/lib/notifications/types';
import { pageNextActions } from '@/lib/nav/next-actions';
import { useStationHeadlineShown } from '@/lib/station/next-action/headline-presence';
import { unboxFeedbackFace, unboxFeedbackLine } from '@/lib/receiving/unbox-scan-feedback';
import { retireUnboxScanLine, useUnboxScanFeedback } from '@/lib/receiving/unbox-scan-feedback-store';
import { cn } from '@/utils/_cn';
import { HEADER_ICON_CLUSTER, HEADER_ICON_WRAP } from './header-shell';
import { PrintJobBanner } from './PrintJobBanner';
import { FACE_TONE, FaceGlyph, UnboxScanHistory, type LineFace } from './UnboxScanHistory';

function OverflowLine({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const node = textRef.current;
    if (!viewport || !node) return;
    const measure = () => {
      setOverflow(Math.max(0, Math.ceil(node.scrollWidth - viewport.clientWidth)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  const travel = overflow > 0 && !reduce;
  return (
    <span ref={viewportRef} className="relative block h-full overflow-hidden">
      <motion.span
        ref={textRef}
        className={cn('inline-block whitespace-nowrap', className)}
        animate={
          travel
            ? { transform: ['translateX(0px)', `translateX(-${overflow}px)`, 'translateX(0px)'] }
            : { transform: 'translateX(0px)' }
        }
        transition={
          travel
            ? { duration: Math.max(6, overflow / 28), repeat: Infinity, ease: 'linear', repeatDelay: 1.2 }
            : { duration: 0 }
        }
      >
        {text}
      </motion.span>
    </span>
  );
}

// ── Top-left: your next step ─────────────────────────────────────────────────

const NO_HINTS: readonly string[] = [];

export function HeaderNextAction() {
  const look = useHintActivity();
  const pageId = useNavContext(useCurrentNavPath()).data?.page.id;
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const onUnbox = pathname?.startsWith('/unbox') ?? false;
  const { line, log } = useUnboxScanFeedback();
  // The line belongs to the Unbox bench; leaving it retires the line (the
  // history stays for this session).
  useEffect(() => {
    if (!onUnbox) retireUnboxScanLine();
  }, [onUnbox]);
  const shown = onUnbox ? line : null;
  // R7 — the newest unread "follow up" a teammate sent YOU (the feed is per
  // staffer). The contacts the task linked when it was sent lead — the task's
  // own title is long and the slot truncates. A scan's feedback still outranks
  // it on the bench.
  const alert = useFollowUpAlerts({ enabled: Boolean(user?.staffId) })[0] ?? null;
  const alertLine = alert
    ? `${alert.eventLabel}: ${[inboxContactsLine(alert.contacts), alert.title ? scrubRelayAddresses(alert.title) : `Task ${alert.entityId}`, followUpDueLabel(alert.dueAt)]
        .filter(Boolean)
        .join(' · ')}`
    : null;
  // An open station record paints its own next step in the centre headline;
  // the static page line stays for the idle station only.
  const headlineShown = useStationHeadlineShown();
  const pageHints = headlineShown ? NO_HINTS : pageNextActions(pageId);
  const feedbackLine = shown ? unboxFeedbackLine(shown) : null;
  const topLine = feedbackLine ?? alertLine;
  const hints = useMemo(() => (topLine ? [topLine] : pageHints), [topLine, pageHints]);
  const face: LineFace = shown ? unboxFeedbackFace(shown) : alert ? 'alert' : 'next';
  const glyph = useMotionPresence(motionPresence.statusMessage);
  const hasHistory = onUnbox && log.length > 0;
  const [historyOpen, setHistoryOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setHistoryOpen(false), [pathname]);
  if (hints.length === 0 && !hasHistory) return <div className={HEADER_ICON_CLUSTER} data-header-zone="next" />;

  /** Opening the alert is reading it: the task opens and the line moves on to the next alert. */
  const openAlert = (item: InboxItemDto) => {
    router.push(item.href);
    queryClient.setQueryData<InboxItemDto[]>(DURABLE_INBOX_QUERY_KEY, (prev) => (prev ?? []).filter((x) => x.id !== item.id));
    void fetch(`/api/inbox/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    }).finally(() => void queryClient.invalidateQueries({ queryKey: DURABLE_INBOX_QUERY_KEY }));
  };

  const lineBody = (
    <>
      <span className={HEADER_ICON_WRAP} aria-hidden>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={face} className="inline-flex" {...glyph} transition={motionTransition.chipCopyFeedback}>
            <FaceGlyph face={face} />
          </motion.span>
        </AnimatePresence>
      </span>
      {/* A scan line carries the FULL tracking number — give it the wider slot. */}
      <span className={cn('relative h-full min-w-0', feedbackLine ? 'w-lg' : 'w-96')}>
        {topLine ? (
          <OverflowLine
            text={topLine}
            className={cn('text-role-caption font-medium', FACE_TONE[face])}
          />
        ) : (
          <RollingHint
            hints={hints.length > 0 ? hints : ['Recent scans']}
            active={look.active}
            className={cn('text-role-caption font-medium', FACE_TONE[face])}
          />
        )}
      </span>
    </>
  );

  return (
    <div className={cn(HEADER_ICON_CLUSTER, 'min-w-0 shrink')} data-header-zone="next">
      {alert && !feedbackLine ? (
        <button
          type="button"
          {...look.bind}
          onClick={() => openAlert(alert)}
          aria-label={`${alertLine} — open the task`}
          className={cn('ds-raw-button flex h-8 min-w-0 items-center pr-2 text-left', focusRing('control'))}
          data-testid="header-next-action"
          data-face={face}
          data-inbox-item-id={alert.id}
        >
          {lineBody}
        </button>
      ) : hasHistory ? (
        <button
          ref={anchorRef}
          type="button"
          {...look.bind}
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          aria-label={`${feedbackLine ?? 'Recent scans'} — show recent scans`}
          className={cn('ds-raw-button flex h-8 min-w-0 items-center pr-2 text-left', focusRing('control'))}
          data-testid="header-next-action"
          data-face={face}
        >
          {lineBody}
        </button>
      ) : (
        <div
          {...look.bind}
          className="flex h-8 min-w-0 items-center pr-2"
          data-testid="header-next-action"
          data-face={face}
        >
          {lineBody}
        </div>
      )}
      {/* One polite announcement per feedback change; the page step is read on focus only. */}
      <span className="sr-only" aria-live={feedbackLine || alertLine ? 'polite' : 'off'}>
        {feedbackLine ?? alertLine ?? (hints[0] ? `Next: ${hints[0]}` : '')}
      </span>
      {hasHistory ? (
        <Popover
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          anchorRef={anchorRef}
          gap={4}
          role="group"
          aria-label="Recent scans"
          className="w-lg"
          data-testid="unbox-scan-history"
        >
          <UnboxScanHistory log={log} onNavigate={() => setHistoryOpen(false)} />
        </Popover>
      ) : null}
    </div>
  );
}

// ── Top-right: print jobs, as cards only ─────────────────────────────────────

/** A printed or cancelled job's card lingers this long, then folds away on its own. */
const BANNER_SETTLE_MS = 4_000;

export function PrintJobOverlay() {
  const work = useBackgroundWork();
  const prints = useMemo(() => work.items.filter((item) => item.kind === 'print'), [work]);
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [pathname]);
  // Focus goes back to whatever opened the sheet (the "+N more" key).
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Dismissed cards, by job id → the start they were dismissed at (a job id
  // that starts again is a new run and gets a new card).
  const [dismissed, setDismissed] = useState<ReadonlyMap<string, number>>(() => new Map());
  const dismiss = useCallback(
    (item: WorkItem) => setDismissed((prev) => new Map(prev).set(item.id, item.startedAt)),
    [],
  );
  const banners = useMemo(() => prints.filter((item) => dismissed.get(item.id) !== item.startedAt), [prints, dismissed]);

  useEffect(() => {
    const timers = banners
      .filter((item) => item.status === 'done' || item.status === 'cancelled')
      .map((item) => window.setTimeout(() => dismiss(item), Math.max(0, (item.endedAt ?? 0) + BANNER_SETTLE_MS - Date.now())));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [banners, dismiss]);

  const close = useCallback(() => setExpanded(false), []);
  const open = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setExpanded(true);
  }, []);

  return (
    <PrintJobBanner
      banners={banners}
      jobs={prints}
      expanded={expanded}
      onDismiss={dismiss}
      onExpand={open}
      onClose={close}
      returnFocusRef={returnFocusRef}
    />
  );
}
