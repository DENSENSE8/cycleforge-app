'use client';

/**
 * StationComposerHost — Cursor / Claude Code grammar with a hard rule:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │  textarea… (auto-grows)                     │
 *   │ [+]              [Location] [↵] [Print?]    │  ← bottom action bar
 *   └─────────────────────────────────────────────┘
 *   [ Unbox ] [ Ticket ]                    ( ◠ )   ← BELOW outline
 *
 * Shell is flex-col (field above tools). Modes are Unbox | Ticket only —
 * leftmost cluster under the outline (icons left of labels; Unbox blue,
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

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  OmnichannelComposerDock,
  type OmnichannelComposerDockHandle,
} from '@/design-system/primitives';
import { COMPOSER_SHELL_CORNER } from '@/design-system/tokens/radius';
import { CornerDownLeft, Link2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import {
  classifyStationComposerModeKey,
  stationComposerModeAriaLabel,
  stationComposerModeKeepsTrailingAction,
  stationComposerModePlaceholder,
  stationComposerTicketCommitLabel,
  type StationComposerMode,
} from '@/lib/composer/station-composer-mode';
import { ComposerModeRow } from './ComposerModeRow';
import { ComposerDrillMenu, type ComposerDrillNode } from './ComposerDrillMenu';
import { useStationComposerMode } from './useStationComposerMode';
import { useStationComposerFocusRequests } from './station-composer-focus';
import {
  NoteComposerInsertRail,
  type NoteComposerInsertAction,
} from '@/components/receiving/workspace/NoteComposerInsertRail';

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
  trailingAction?: ReactNode;
  chrome?: 'raised' | 'bare';
  weldTop?: boolean;
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
  ticketDraft?: string;
  onTicketDraftChange?: (next: string) => void;
  onTicketCommit?: () => void;
  ticketCommitDisabled?: boolean;
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
   * Opening it flattens the dock top (`weldTop`).
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
   * When false, omit the below-outline row entirely.
   * Default true (Unbox / Testing / scan-out).
   */
  showModeRow?: boolean;
  /**
   * When false (with {@link showModeRow}), hide Unbox | Ticket and keep only
   * the bottom-right context / procedure ring — dumb scan mouths.
   */
  showModeFaces?: boolean;
  /**
   * Pin Unbox vs Ticket regardless of `?composerMode=` / session.
   * Incoming add extract is a dumb paste mouth — never Ticket.
   */
  forceMode?: StationComposerMode;
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
  trailingAction,
  chrome = 'raised',
  weldTop = false,
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
  ticketDraft: ticketDraftProp,
  onTicketDraftChange,
  onTicketCommit,
  ticketCommitDisabled,
  ticketDrillNodes,
  ticketInsetTop,
  ticketHeaderEnd,
  reaction,
  ticketAccessory,
  ticketFooterStart,
  onModeChange,
  modeRowLeading,
  showModeRow = true,
  showModeFaces = true,
  forceMode,
  progressPercent = 0,
  progressTone = 'idle',
  onProgressClick,
  className,
}: StationComposerHostProps) {
  const { mode: sessionMode, setMode, cycleMode } = useStationComposerMode();
  const mode = forceMode ?? sessionMode;
  const [internalTicketDraft, setInternalTicketDraft] = useState('');
  const [plusOpen, setPlusOpen] = useState(false);
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

  const isTicket = mode === 'ticket';
  const value = isTicket ? ticketDraft : labelValue;
  const onChange = isTicket ? setTicketDraft : onLabelChange;
  const onCommit = isTicket
    ? (_live?: string) => {
        onTicketCommit?.();
      }
    : onLabelCommit;
  const onBlur = isTicket ? undefined : onLabelBlur;

  const keepTrailing = stationComposerModeKeepsTrailingAction(mode);
  const printTrailing = keepTrailing ? trailingAction : undefined;
  const locationFooter = locationAction;

  const placeholder = isTicket
    ? stationComposerModePlaceholder(mode, { ticketLabel, hasTicket })
    : labelPlaceholder === ''
      ? ''
      : (labelPlaceholder ??
        stationComposerModePlaceholder(mode, { ticketLabel, hasTicket }));

  // DOCUMENT-scoped, not textarea-scoped (2026-08-31). These chords hung off
  // the composer's own onKeyDown, so they only fired while the field had focus
  // — which is exactly when an operator is NOT reaching for them. Someone who
  // just scanned a box, or who is reading the ticket thread, pressed ⌥2 and
  // nothing happened.
  //
  // Bubble phase, so a control that legitimately owns the chord can stop it
  // first. preventDefault is what takes Shift+Tab off reverse focus traversal
  // for this surface — the deliberate trade the operator made for one toggle.
  //
  // Two mounted hosts both firing is harmless: `cycleMode` derives the next
  // mode from the CURRENT one rather than toggling, so both compute the same
  // target and the second call is a no-op write.
  useEffect(() => {
    if (!showModeRow || !showModeFaces) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!classifyStationComposerModeKey(e)) return;
      e.preventDefault();
      cycleMode();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [cycleMode, showModeRow, showModeFaces]);

  // The textarea still delegates to the host's ghost-autocomplete handler; the
  // mode chords are no longer handled here — the document listener above owns
  // them, and handling them twice would cycle twice.
  const handleModeKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (onTextareaKeyDown?.(e)) return true;
      return false;
    },
    [onTextareaKeyDown],
  );

  // Ticket `+` drills; Unbox `+` keeps its flat coloured insert rail. Leaving
  // Unbox on the rail is deliberate — its rows are one tap each and stacking
  // them behind a submenu would cost the operator an interaction per insert.
  const leadingPlus = isTicket ? (
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

  const commitDisabledResolved = isTicket
    ? ticketCommitDisabled === true || ticketDraft.trim().length === 0
    : labelCommitDisabled;

  const reactionNode = (isTicket ? ticketAccessory : undefined) ?? reaction ?? null;
  const reactionOpen = reactionNode != null;
  const dockWeldTop = weldTop || reactionOpen;

  return (
    <div
      className={cn(
        // Floor only — Unbox | Ticket live HERE, not inside the dock outline.
        // Same white + COMPOSER_SHELL_CORNER; no overflow clip (that sheared
        // the dock's raised shadow). isolate keeps z-raised dock above z-base
        // modes so the shadow paints across the caption.
        'flex min-w-0 isolate flex-col gap-1 bg-surface-card pb-[max(0.25rem,env(safe-area-inset-bottom))]',
        dockWeldTop ? `${COMPOSER_SHELL_CORNER} rounded-t-none` : COMPOSER_SHELL_CORNER,
        className,
      )}
      data-testid="station-composer-host"
      data-composer-mode={mode}
    >
      <div className="flex min-w-0 flex-col gap-0">
        {reactionOpen ? reactionNode : null}
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
        commitGlyph={isTicket ? 'action' : 'enter'}
        commitLabel={isTicket ? stationComposerTicketCommitLabel(hasTicket) : undefined}
        commitIcon={
          isTicket ? (
            hasTicket ? (
              <CornerDownLeft className="h-3.5 w-3.5" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )
          ) : undefined
        }
        // Filing a NEW ticket is the terminal, outward-facing act — same
        // crimson the claim panel's own File ticket button carries. An update
        // on an existing thread is ordinary primary work.
        commitVariant={isTicket && !hasTicket ? 'danger' : 'primary'}
        showCommitWithTrailing={false}
        hideCommitButton={Boolean(printTrailing)}
        leadingStart={leadingPlus}
        insetTop={isTicket ? ticketInsetTop : undefined}
        headerEnd={isTicket ? ticketHeaderEnd : undefined}
        footerStart={isTicket ? ticketFooterStart : undefined}
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
          isTicket ? stationComposerTicketCommitLabel(hasTicket) : labelCommitAriaLabel
        }
        commitTooltip={
          isTicket
            ? hasTicket
              ? 'Update ticket (Enter) · Shift+Enter for newline'
              : 'File ticket (Enter)'
            : labelCommitTooltip
        }
        footerEnd={locationFooter}
        trailingAction={printTrailing}
        chrome={chrome}
        weldTop={dockWeldTop}
        animateMount={animateMount}
        textareaRef={textareaRef}
        ghostSuffix={isTicket ? undefined : ghostSuffix}
        matchedPhrase={isTicket ? null : matchedPhrase}
        onAcceptGhost={isTicket ? undefined : onAcceptGhost}
        onDismissGhost={isTicket ? undefined : onDismissGhost}
        onTextareaKeyDown={handleModeKey}
      />
      </div>
      {showModeRow ? (
        <ComposerModeRow
          mode={mode}
          onModeChange={setMode}
          showModeFaces={showModeFaces}
          progressPercent={progressPercent}
          progressTone={progressTone}
          onProgressClick={onProgressClick}
          leading={modeRowLeading}
        />
      ) : null}
    </div>
  );
}
