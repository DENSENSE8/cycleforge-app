'use client';

/**
 * StationComposerHost — Cursor / Claude Code grammar with a hard rule:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │  textarea… (auto-grows)                     │
 *   │ [+]              [Location] [↵] [Print?]    │  ← bottom action bar
 *   └─────────────────────────────────────────────┘
 *   ( ◠ ring )                                          ← context row
 *
 * Shell is flex-col (field above tools). Header tasks own Ticket versus
 * station work; this mouth does not paint Unbox | Ticket faces. Ask is
 * honored ONLY where a surface names it (`modes={['ask']}` — the `/ai-chat`
 * session panel), so a station never grows a second chat door.
 * Location pill sits in the bottom action bar left of Print and remains
 * mounted when the composer switches to Ticket.
 * Plus is circular. Enter is a bare gray icon. Unbox keeps Print·Receive;
 * Ticket hides it. Ring opens Displays (Info folded in).
 *
 * Staff reaction lives on this mouth: mount WeldedFeedbackPanel through
 * `reaction` (any mode) so the operator sees what just happened / what to
 * process next without leaving the composer. ds_contract("staff reaction on
 * the composer") ranks WeldedFeedbackPanel first. Never a second card,
 * caption band, toast, or popover.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import {
  OmnichannelComposerDock,
  type OmnichannelComposerDockHandle,
} from '@/design-system/primitives';
import { COMPOSER_SHELL_CORNER } from '@/design-system/tokens/radius';
import { CornerDownLeft, Ticket } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { useAssistantChat } from '@/components/assistant/useAssistantChat';
import { useActiveAssistantContext } from '@/hooks/useAssistantContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  stationComposerModeAriaLabel,
  stationComposerModeKeepsTrailingAction,
  stationComposerModePlaceholder,
  stationComposerTicketCommitLabel,
  type StationComposerMode,
} from '@/lib/composer/station-composer-mode';
import {
  registerStationComposerPresence,
  type StationComposerPresenceKind,
} from '@/lib/composer/station-composer-presence';
import { ComposerAskStage } from './ComposerAskStage';
import { COMPOSER_ASK_CHIP_CLASS, ComposerModeRow, STATION_COMPOSER_MODE_ICON } from './ComposerModeRow';
import {
  ComposerPlusMenuPanel,
  ComposerPlusMenuRow,
  ComposerPlusTrigger,
} from './ComposerPlusMenu';
import {
  STATION_COMPOSER_FACES,
  STATION_COMPOSER_MODE_CATALOG,
} from '@/lib/composer/station-composer-mode';
import {
  NoteComposerInsertRail,
  type NoteComposerInsertAction,
} from '@/components/receiving/workspace/NoteComposerInsertRail';
import { ComposerDrillMenu, type ComposerDrillNode } from './ComposerDrillMenu';
import { useStationComposerMode } from './useStationComposerMode';
import { useStationComposerFocusRequests } from './station-composer-focus';
import {
  getComposerSeedSeq,
  getLatestComposerSeed,
  subscribeComposerSeed,
} from '@/lib/assistant/composer-seed-store';

export type StationComposerHostProps = {
  labelValue: string;
  onLabelChange: (next: string) => void;
  onLabelCommit: (liveValue?: string) => void;
  onLabelBlur?: () => void;
  labelCommitDisabled?: boolean;
  labelCommitAriaLabel?: string;
  labelCommitTooltip?: string;
  labelPlaceholder?: string | null;
  /** @deprecated Info moved into the procedure ring — ignored. */
  headerEnd?: ReactNode;
  /**
   * Quiet putaway pill left of Enter/Print inside the outline. It remains
   * mounted across Unbox and Ticket; mode-specific trailing actions may still
   * be conditional.
   */
  locationAction?: ReactNode;
  /** Renders immediately left of {@link locationAction} in the composer footer (Quality control's Pair FNSKU). */
  locationLeading?: ReactNode;
  trailingAction?: ReactNode;
  chrome?: 'raised' | 'bare';
  animateMount?: boolean;
  textareaRef?: Ref<HTMLTextAreaElement>;
  ghostSuffix?: string;
  matchedPhrase?: string | null;
  onAcceptGhost?: () => void;
  onDismissGhost?: () => void;
  onTextareaKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean | void;
  onFocus?: () => void;
  insertActions?: NoteComposerInsertAction[];
  ticketLabel?: string | null;
  hasTicket?: boolean;
  /** The ticket channel toggle's state — the commit reads "Send public reply" or "Add internal note". Public-first default (ruling 2026-08-31). */
  ticketIsPublic?: boolean;
  ticketDraft?: string;
  onTicketDraftChange?: (next: string) => void;
  onTicketCommit?: () => void;
  ticketCommitDisabled?: boolean;
  /** Override dock commit label (e.g. Link ticket while linking an existing ticket). */
  ticketCommitLabel?: string;
  /**
   * Ticket `+` tree — “Add to message”. Replaced the free-form `ticketPlusMenu`
   * node on 2026-08-30: the old prop let a host put ANYTHING in there, and what
   * it actually put there was the Internal/Public channel switch. Channel is
   * not an insert; it moved to {@link ticketFooterStart}.
   */
  ticketDrillNodes?: ComposerDrillNode[];
  /**
   * Ticket-mode chrome inside the outline ABOVE the draft — Cc and the
   * attached-context chips, the things that describe the message. Mounted only
   * in Ticket mode; Unbox has no audience and nothing to attach.
   */
  ticketInsetTop?: ReactNode;
  /**
   * Ticket-mode trailing accessories — icon cluster in the dock top-right
   * ({@link OmnichannelComposerDock} `headerEnd`). Unbox never mounts this.
   */
  ticketHeaderEnd?: ReactNode;
  /**
   * Staff reaction welded above the dock — {@link WeldedFeedbackPanel}.
   * Any mode. This is the SoT slot for “what just happened / what to do next.”
   */
  reaction?: ReactNode;
  /**
   * Ticket-mode alias for {@link reaction} (claim type / link / seller).
   * Prefer `reaction` on new call sites so Unbox / dumb mouths can mount too.
   */
  ticketAccessory?: ReactNode;
  /**
   * Ticket-mode chrome on the bottom action bar, right of `+` (the
   * Internal/Public channel). Unbox has no channel, so it never mounts.
   */
  ticketFooterStart?: ReactNode;
  onModeChange?: (mode: StationComposerMode) => void;
  modeRowLeading?: ReactNode;
  /**
   * Always on. The row under the outline is context and the procedure ring.
   * `false` is not on the type — hiding the row deletes the context ring.
   */
  showModeRow?: true;
  /**
   * Pin Unbox vs Ticket vs Ask regardless of `?composerMode=` / session.
   */
  forceMode?: StationComposerMode;
  /**
   * The modes this mouth actually HONORS. Default is the station faces
   * (Unbox | Ticket) — Ask is opt-in only.
   *
   * A surface with one real destination passes it alone (`['ask']` on the
   * assistant home): the row-two chip then NAMES that destination instead of
   * offering a picker whose other rows commit nowhere — Ticket with no
   * `onTicketCommit` is a dead Enter, and Unbox on a chat surface is a sticker
   * note nobody prints. A single-mode mouth also stands down from the
   * Shift+Tab cycle so it cannot rewrite the station's shared session mode.
   */
  modes?: readonly StationComposerMode[];
  /**
   * The surface IS the assistant (session home): its label trio already sends
   * to the model and renders the transcript, so Ask must NOT fork a second
   * draft, a second commit or a second chat send behind the same textarea.
   * One field, one commit, one thread.
   */
  askOwnedBySurface?: boolean;
  /**
   * TWO-LINE geometry (session surface, 2026-09-06): the mode faces, the
   * context ring and `inlineCommit` live INSIDE the dock's action row, and
   * the ComposerModeRow below the outline is not rendered — nothing sits
   * under the composer.
   */
  inlineComposerRow?: boolean;
  /**
   * When provided, the leading + opens THIS content instead of the mode's
   * default insert rail — the surface owns its add-verb menu (files, photos,
   * # order context, @ staff tasks).
   */
  plusMenuContent?: ReactNode;
  /**
   * The second row's right-end control in the two-line geometry — the stateful
   * mic / send button.
   *
   * `hasText` is ALWAYS the VISIBLE field's, whatever the mode resolved to, and
   * `commit` is that same field's commit. It used to read the label draft while
   * the field on screen showed the ticket or ask draft, so an empty composer
   * offered Send and a typed one offered the microphone.
   */
  renderInlineCommit?: (state: { hasText: boolean; busy: boolean; commit: () => void }) => ReactNode;
  /**
   * The context ring, owned by the surface: its count must be a REAL
   * reflection of what the model receives (page context, thread, staged
   * attachments) — the host has no opinion about it.
   */
  inlineRing?: ReactNode;
  /**
   * `station` (default) hides the site-wide desk Ask lane. `desk` is that lane.
   */
  presenceKind?: StationComposerPresenceKind;
  progressPercent?: number;
  progressTone?: 'idle' | 'selected';
  onProgressClick?: () => void;
  className?: string;
};

export function StationComposerHost({
  labelValue,
  onLabelChange,
  onLabelCommit,
  onLabelBlur,
  labelCommitDisabled,
  labelCommitAriaLabel = 'Save item note',
  labelCommitTooltip = 'Save notes (Enter)',
  labelPlaceholder,
  locationAction,
  locationLeading,
  trailingAction,
  chrome = 'raised',
  animateMount = true,
  textareaRef,
  ghostSuffix,
  matchedPhrase = null,
  onAcceptGhost,
  onDismissGhost,
  onTextareaKeyDown,
  onFocus,
  insertActions = [],
  ticketLabel = null,
  hasTicket = false,
  ticketIsPublic = true,
  ticketDraft: ticketDraftProp,
  onTicketDraftChange,
  onTicketCommit,
  ticketCommitDisabled,
  ticketCommitLabel,
  ticketDrillNodes,
  ticketInsetTop,
  ticketHeaderEnd,
  reaction,
  ticketAccessory,
  ticketFooterStart,
  onModeChange,
  modeRowLeading,
  forceMode,
  modes,
  askOwnedBySurface = false,
  inlineComposerRow = false,
  inlineRing,
  plusMenuContent,
  renderInlineCommit,
  presenceKind = 'station',
  progressPercent = 0,
  progressTone = 'idle',
  onProgressClick,
  className,
}: StationComposerHostProps) {
  const { mode: sessionMode, setMode } = useStationComposerMode();
  // The honored set, in catalog order. A mouth that names one mode resolves to
  // it no matter what the shared session / `?composerMode=` says, and a shared
  // mode this mouth cannot honor falls back to the first one it can.
  const honoredModes: readonly StationComposerMode[] =
    modes && modes.length > 0
      ? STATION_COMPOSER_MODE_CATALOG.map((m) => m.id).filter((id) => modes.includes(id))
      : STATION_COMPOSER_FACES;
  const singleMode = honoredModes.length < 2;
  const mode =
    forceMode ??
    (honoredModes.includes(sessionMode) ? sessionMode : (honoredModes[0] ?? sessionMode));
  const { has } = useAuth();
  const canAsk = has('assistant.chat');
  const askChat = useAssistantChat({ shared: presenceKind === 'desk' ? undefined : 'station' });
  const askContext = useActiveAssistantContext();
  const [askDraft, setAskDraft] = useState('');
  const [internalTicketDraft, setInternalTicketDraft] = useState('');
  const [plusOpen, setPlusOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const plusAnchorRef = useRef<HTMLButtonElement | null>(null);
  const modeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const ticketDraft = ticketDraftProp ?? internalTicketDraft;
  const setTicketDraft = onTicketDraftChange ?? setInternalTicketDraft;
  // `null`, not the initial mode: a host has to hear the mode it RESOLVED to,
  // not only later changes. `?composerMode=ticket` deep-links straight into
  // Ticket, and the hosts that react to Ticket (band collapse in LineEditPanel /
  // TestingPanel) never fired for a deep-linked operator.
  const lastMode = useRef<StationComposerMode | null>(null);
  const dockRef = useRef<OmnichannelComposerDockHandle>(null);

  // Mode-agnostic on purpose: there is ONE textarea and its `value` swaps with
  // the mode, so the caret lands in the right field whether or not the mode
  // flip that accompanied this request has committed yet.
  useStationComposerFocusRequests(
    useCallback(() => dockRef.current?.focus(), []),
  );

  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    // Leaving Ticket unmounts the drill menu; without this it would spring back
    // open the next time the operator returns to a mode they never left open.
    setPlusOpen(false);
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => registerStationComposerPresence(presenceKind), [presenceKind]);

  const seedSeq = useSyncExternalStore(subscribeComposerSeed, getComposerSeedSeq, () => 0);
  const prevSeedSeqRef = useRef(0);
  const askChatRef = useRef(askChat);
  const askContextRef = useRef(askContext);
  askChatRef.current = askChat;
  askContextRef.current = askContext;
  // The surface's own field/commit, read through a ref so the seed effect does
  // not re-fire on every parent render.
  const surfaceFieldRef = useRef({ owned: askOwnedBySurface, onChange: onLabelChange, onCommit: onLabelCommit });
  surfaceFieldRef.current = { owned: askOwnedBySurface, onChange: onLabelChange, onCommit: onLabelCommit };

  useEffect(() => {
    if (seedSeq === prevSeedSeqRef.current) return;
    prevSeedSeqRef.current = seedSeq;
    const seed = getLatestComposerSeed();
    if (!seed?.text) return;
    // A single-mode mouth never rewrites the station's SHARED session mode —
    // its own mode cannot change, and the write would move every other mouth.
    if (mode !== 'ask' && !singleMode) setMode('ask');
    const surface = surfaceFieldRef.current;
    if (surface.owned) {
      // ONE field: a voice transcript lands in the draft that is on screen.
      // Writing `askDraft` here seeded a field nobody was looking at.
      if (seed.autoSend) surface.onCommit(seed.text);
      else surface.onChange(seed.text);
      return;
    }
    if (seed.autoSend) {
      if (askChatRef.current.status === 'streaming') {
        setAskDraft(seed.text);
        return;
      }
      setAskDraft('');
      void askChatRef.current.send(seed.text, askContextRef.current);
      return;
    }
    setAskDraft(seed.text);
  }, [seedSeq, mode, setMode, singleMode]);

  const isTicket = mode === 'ticket';
  const isAsk = mode === 'ask';
  /**
   * ONE visible field, ONE commit. `surfaceAsk` = the assistant surface owns
   * the Ask field (session home): Ask then reads and commits the SAME draft the
   * label trio does, instead of the host forking a second draft and a second
   * `useAssistantChat.send` behind the same textarea.
   */
  const surfaceAsk = isAsk && askOwnedBySurface;
  const onLabelField = surfaceAsk || (!isAsk && !isTicket);
  const value = onLabelField ? labelValue : isAsk ? askDraft : ticketDraft;
  const onChange = onLabelField ? onLabelChange : isAsk ? setAskDraft : setTicketDraft;
  const onCommit = onLabelField
    ? onLabelCommit
    : isAsk
      ? (live?: string) => {
          const text = (live ?? askDraft).trim();
          if (!text || !canAsk || askChat.status === 'streaming') return;
          setAskDraft('');
          void askChat.send(text, askContext);
        }
      : (_live?: string) => {
          onTicketCommit?.();
        };
  const onBlur = onLabelField ? onLabelBlur : undefined;

  const keepTrailing = stationComposerModeKeepsTrailingAction(mode);
  const printTrailing = keepTrailing ? trailingAction : undefined;
  // Immediately left of the location control in the same footer row — a
  // station-local always-visible verb (Quality control's Pair FNSKU).
  const locationFooter = (
    <>
      {locationLeading}
      {locationAction}
    </>
  );

  const placeholder = onLabelField
    ? labelPlaceholder === ''
      ? ''
      : (labelPlaceholder ?? stationComposerModePlaceholder(mode, { ticketLabel, hasTicket }))
    : stationComposerModePlaceholder(mode, { ticketLabel, hasTicket });

  const handleModeKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (onTextareaKeyDown?.(e)) return true;
      // Ticket mode in Unbox: Enter breaks the line. Send is ⌘/Ctrl+Enter.
      // Unbox notes and Ask still commit on Enter.
      if (!isTicket || e.key !== 'Enter' || e.nativeEvent.isComposing) return false;
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        onTicketCommit?.();
        return true;
      }
      return true;
    },
    [isTicket, onTextareaKeyDown, onTicketCommit],
  );

  // Ticket `+` drills; Unbox `+` keeps its flat coloured insert rail. Leaving
  // Unbox on the rail is deliberate — its rows are one tap each and stacking
  // them behind a submenu would cost the operator an interaction per insert.
  const leadingPlus = plusMenuContent ? (
    <>
      <ComposerPlusTrigger
        open={plusOpen}
        onClick={() => setPlusOpen((v) => !v)}
        ariaLabel="Add context"
        ref={plusAnchorRef}
      />
      <ComposerPlusMenuPanel
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        anchorRef={plusAnchorRef}
        ariaLabel="Add context menu"
      >
        {plusMenuContent}
      </ComposerPlusMenuPanel>
    </>
  ) : isAsk ? (
    <NoteComposerInsertRail actions={[]} placement="inline" trigger="composer" />
  ) : isTicket ? (
    <ComposerDrillMenu
      nodes={ticketDrillNodes ?? []}
      open={plusOpen}
      onOpenChange={setPlusOpen}
      emptyLabel="No tools in this mode"
    />
  ) : (
    <NoteComposerInsertRail
      actions={insertActions}
      placement="inline"
      trigger="composer"
    />
  );

  const commitDisabledResolved = onLabelField
    ? labelCommitDisabled
    : isAsk
      ? !canAsk || askChat.status === 'streaming' || askDraft.trim().length === 0
      : ticketCommitDisabled === true || ticketDraft.trim().length === 0;

  const reactionNode = isAsk
    ? null
    : (isTicket ? ticketAccessory : undefined) ?? reaction ?? null;
  const reactionOpen = reactionNode != null;
  // The row-two chip wears the catalog LABEL ("Ask"), not the raw mode id: the
  // id is a URL/session value, and lowercase "ask" beside the operator's own
  // sentence reads like a log line.
  const modeLabel = STATION_COMPOSER_MODE_CATALOG.find((m) => m.id === mode)?.label ?? mode;
  // Icon ALWAYS leftmost on the mode face — same glyph the below-outline mode
  // row draws, so a mode reads the same wherever it is named.
  const ModeGlyph = STATION_COMPOSER_MODE_ICON[mode];
  const weldAskStage = isAsk && presenceKind === 'desk';
  return (
    <div
      className={cn(
        // Floor only — Unbox | Ticket live HERE, not inside the dock outline.
        // Same white + COMPOSER_SHELL_CORNER; no overflow clip (that sheared
        // the dock's raised shadow). isolate keeps z-raised dock above z-base
        // modes so the shadow paints across the caption.
        'flex min-w-0 isolate flex-col gap-1 bg-surface-card pb-[max(0.25rem,env(safe-area-inset-bottom))]',
        COMPOSER_SHELL_CORNER,
        className,
      )}
      data-testid="station-composer-host"
      data-composer-mode={mode}
    >
      <div className="flex min-w-0 flex-col gap-1.5 px-3">
        {weldAskStage ? <ComposerAskStage chat={askChat} /> : null}
        {/* Welded onto the dock: same width, no gap (the -mb cancels the
            column gap), so panel + dock read as ONE outline — the panel
            frames the top, the dock's own border the rest. */}
        {reactionOpen ? <div className="-mb-1.5 min-w-0">{reactionNode}</div> : null}
      <OmnichannelComposerDock
        ref={dockRef}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        onBlur={onBlur}
        onFocus={onFocus}
        density="compact"
        autoGrow
        // Ticket mode gets the LABELLED CTA; the note keeps the quiet return
        // arrow. Saving a sticker note and filing a helpdesk ticket are not the
        // same act and must not wear the same control.
        commitGlyph={isTicket || isAsk ? 'action' : 'enter'}
        commitLabel={
          isAsk
            ? 'Ask'
            : isTicket
              ? (ticketCommitLabel ?? stationComposerTicketCommitLabel(hasTicket, ticketIsPublic))
              : undefined
        }
        commitIcon={
          isTicket ? (
            hasTicket ? (
              <CornerDownLeft className="h-3.5 w-3.5" />
            ) : (
              <Ticket className="h-3.5 w-3.5" />
            )
          ) : undefined
        }
        // Create ticket is the only unlinked act — primary, not a Link/create
        // combobox face. An update on an existing thread stays primary too.
        commitVariant="primary"
        showCommitWithTrailing={false}
        hideCommitButton={inlineComposerRow ? true : Boolean(printTrailing)}
        leadingStart={leadingPlus}
        insetTop={isTicket && !isAsk ? ticketInsetTop : undefined}
        headerEnd={isTicket && !isAsk ? ticketHeaderEnd : undefined}
        footerStart={
          inlineComposerRow ? (
            // Row two is ONE 28px row, middle-aligned end to end: the mode face
            // here, the context ring and the commit control at the other end
            // all sit in `h-7` boxes so their centers land on the same line.
            <div className="relative flex h-7 min-w-0 items-center" data-testid="composer-mode-dropdown">
              {singleMode ? (
                // One honored destination: the chip NAMES it. A picker whose
                // other rows commit nowhere is chrome that lies.
                <span
                  data-testid="composer-mode-name"
                  className={cn(
                    'flex h-7 items-center gap-1 text-role-micro font-semibold tracking-wide',
                    // Ask is outlined, the work modes are not: this is the one
                    // mode that changes who the Enter key is talking to
                    // (operator 2026-09-07). Teal wash, teal hairline, 4px
                    // corner — see COMPOSER_ASK_CHIP_CLASS.
                    isAsk ? cn(COMPOSER_ASK_CHIP_CLASS, 'px-1.5') : 'text-text-muted',
                  )}
                >
                  <ModeGlyph className="block h-3.5 w-3.5 shrink-0" />
                  {modeLabel}
                </span>
              ) : (
                <>
                  <button
                    ref={modeAnchorRef}
                    onClick={() => setModeMenuOpen((v) => !v)}
                    aria-expanded={modeMenuOpen}
                    aria-label="Composer mode"
                    data-testid="composer-mode-dropdown-trigger"
                    className={cn(
                      'ds-raw-button flex h-7 items-center gap-1 rounded-sm text-role-micro font-semibold',
                      isAsk
                        ? cn(COMPOSER_ASK_CHIP_CLASS, 'px-1.5')
                        : 'text-text-muted hover:text-text-default',
                    )}
                  >
                    <ModeGlyph className="block h-3.5 w-3.5 shrink-0" />
                    <span className="tracking-wide">{modeLabel}</span>
                    <span aria-hidden className="text-text-faint">▾</span>
                  </button>
                  {modeMenuOpen ? (
                    <ComposerPlusMenuPanel
                      open={modeMenuOpen}
                      onClose={() => setModeMenuOpen(false)}
                      anchorRef={modeAnchorRef}
                      ariaLabel="Composer modes"
                      placement="bottom-end"
                    >
                      {STATION_COMPOSER_MODE_CATALOG.filter((m) => honoredModes.includes(m.id)).map((m) => (
                        <ComposerPlusMenuRow
                          key={m.id}
                          selected={mode === m.id}
                          disabled={m.id === 'ask' && !canAsk}
                          onClick={() => {
                            setModeMenuOpen(false);
                            setMode(m.id);
                          }}
                        >
                          {m.label}
                        </ComposerPlusMenuRow>
                      ))}
                    </ComposerPlusMenuPanel>
                  ) : null}
                </>
              )}
            </div>
          ) : isTicket && !isAsk
            ? ticketFooterStart
            : undefined
        }
        commitDisabled={
          commitDisabledResolved === true
            ? true
            : commitDisabledResolved === false
              ? false
              : undefined
        }
        placeholder={placeholder}
        ariaLabel={stationComposerModeAriaLabel(mode, { ticketLabel, hasTicket })}
        commitAriaLabel={
          onLabelField
            ? labelCommitAriaLabel
            : isAsk
              ? 'Send Ask'
              : (ticketCommitLabel ?? stationComposerTicketCommitLabel(hasTicket, ticketIsPublic))
        }
        commitTooltip={
          onLabelField
            ? labelCommitTooltip
            : isAsk
              ? 'Ask (Enter) · Shift+Enter for newline'
              : ticketCommitLabel
                ? `${ticketCommitLabel} (⌘ or Ctrl+Enter)`
                : hasTicket
                  ? `${stationComposerTicketCommitLabel(true, ticketIsPublic)} (⌘ or Ctrl+Enter)`
                  : 'Create ticket (⌘ or Ctrl+Enter)'
        }
        ghostSuffix={isTicket || isAsk ? undefined : ghostSuffix}
        matchedPhrase={isTicket || isAsk ? null : matchedPhrase}
        onAcceptGhost={isTicket || isAsk ? undefined : onAcceptGhost}
        onDismissGhost={isTicket || isAsk ? undefined : onDismissGhost}
        footerEnd={
          inlineComposerRow ? (
            <>
              {inlineRing}
              {renderInlineCommit?.({
                // The VISIBLE field, always — see renderInlineCommit's contract.
                hasText: value.trim().length > 0,
                busy: commitDisabledResolved === true && value.trim().length > 0,
                commit: () => onCommit(),
              })}
            </>
          ) : (
            locationFooter
          )
        }
        trailingAction={inlineComposerRow ? undefined : printTrailing}
        chrome={chrome}
        weldTop={reactionOpen}
        animateMount={animateMount}
        textareaRef={textareaRef}
        onTextareaKeyDown={handleModeKey}
      />
      </div>
      {inlineComposerRow ? null : (
      <ComposerModeRow
        mode={mode}
        progressPercent={progressPercent}
        progressTone={progressTone}
        onProgressClick={onProgressClick}
        leading={modeRowLeading}
      />
      )}
    </div>
  );
}
