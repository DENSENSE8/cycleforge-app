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
 * Ticket orange). Location pill sits in the bottom action bar left of Print.
 * Plus is circular. Enter is a bare gray icon. Unbox keeps Print·Receive;
 * Ticket hides it. Ring opens Displays (Info folded in).
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
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { toast } from '@/lib/toast';
import {
  STATION_COMPOSER_SHIFT_TAB_REFUSAL,
  classifyStationComposerModeKey,
  stationComposerModeAriaLabel,
  stationComposerModeKeepsTrailingAction,
  stationComposerModePlaceholder,
  type StationComposerMode,
} from '@/lib/composer/station-composer-mode';
import { ComposerModeRow } from './ComposerModeRow';
import { ComposerDrillMenu, type ComposerDrillNode } from './ComposerDrillMenu';
import { useStationComposerMode } from './useStationComposerMode';
import {
  NoteComposerInsertRail,
  type NoteComposerInsertAction,
} from '@/components/receiving/workspace/NoteComposerInsertRail';

export type StationComposerHostProps = {
  labelValue: string;
  onLabelChange: (next: string) => void;
  onLabelCommit: () => void;
  onLabelBlur?: () => void;
  labelCommitDisabled?: boolean;
  labelCommitAriaLabel?: string;
  labelCommitTooltip?: string;
  labelPlaceholder?: string | null;
  /** @deprecated Info moved into the procedure ring — ignored. */
  headerEnd?: ReactNode;
  /**
   * Quiet putaway pill left of Enter/Print inside the outline (Unbox only).
   * Does not own the trailing commit slot — Print still does.
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
   * Ticket-mode chrome on the bottom action bar, right of `+` (the
   * Internal/Public channel). Unbox has no channel, so it never mounts.
   */
  ticketFooterStart?: ReactNode;
  onModeChange?: (mode: StationComposerMode) => void;
  modeRowLeading?: ReactNode;
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
  ticketFooterStart,
  onModeChange,
  modeRowLeading,
  progressPercent = 0,
  progressTone = 'idle',
  onProgressClick,
  className,
}: StationComposerHostProps) {
  const { mode, setMode, cycleMode } = useStationComposerMode();
  const [internalTicketDraft, setInternalTicketDraft] = useState('');
  const [plusOpen, setPlusOpen] = useState(false);
  const ticketDraft = ticketDraftProp ?? internalTicketDraft;
  const setTicketDraft = onTicketDraftChange ?? setInternalTicketDraft;
  // `null`, not the initial mode: a host has to hear the mode it RESOLVED to,
  // not only later changes. `?composerMode=ticket` deep-links straight into
  // Ticket, and the hosts that react to Ticket (band collapse in LineEditPanel /
  // TestingPanel) never fired for a deep-linked operator.
  const lastMode = useRef<StationComposerMode | null>(null);

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
    ? () => {
        onTicketCommit?.();
      }
    : onLabelCommit;
  const onBlur = isTicket ? undefined : onLabelBlur;

  const keepTrailing = stationComposerModeKeepsTrailingAction(mode);
  const printTrailing = keepTrailing ? trailingAction : undefined;
  const locationFooter = keepTrailing ? locationAction : undefined;

  const placeholder = isTicket
    ? stationComposerModePlaceholder(mode, { ticketLabel, hasTicket })
    : labelPlaceholder === ''
      ? ''
      : (labelPlaceholder ??
        stationComposerModePlaceholder(mode, { ticketLabel, hasTicket }));

  const handleModeKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (onTextareaKeyDown?.(e)) return true;
      const hit = classifyStationComposerModeKey(e);
      if (!hit) return false;
      e.preventDefault();
      if (hit.kind === 'refuse-shift-tab') {
        toast.message(STATION_COMPOSER_SHIFT_TAB_REFUSAL);
        return true;
      }
      if (hit.kind === 'cycle') {
        cycleMode();
        return true;
      }
      setMode(hit.mode);
      return true;
    },
    [onTextareaKeyDown, cycleMode, setMode],
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

  return (
    <div className={className} data-testid="station-composer-host" data-composer-mode={mode}>
      <OmnichannelComposerDock
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        onBlur={onBlur}
        onFocus={onFocus}
        density="compact"
        autoGrow
        commitGlyph="enter"
        showCommitWithTrailing={false}
        hideCommitButton={Boolean(printTrailing)}
        leadingStart={leadingPlus}
        insetTop={isTicket ? ticketInsetTop : undefined}
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
          isTicket
            ? hasTicket
              ? 'Send'
              : 'Create ticket'
            : labelCommitAriaLabel
        }
        commitTooltip={
          isTicket
            ? hasTicket
              ? 'Send (Enter) · Shift+Enter for newline'
              : 'Create ticket (Enter)'
            : labelCommitTooltip
        }
        footerEnd={locationFooter}
        trailingAction={printTrailing}
        chrome={chrome}
        weldTop={weldTop}
        animateMount={animateMount}
        textareaRef={textareaRef}
        ghostSuffix={isTicket ? undefined : ghostSuffix}
        matchedPhrase={isTicket ? null : matchedPhrase}
        onAcceptGhost={isTicket ? undefined : onAcceptGhost}
        onDismissGhost={isTicket ? undefined : onDismissGhost}
        onTextareaKeyDown={handleModeKey}
      />
      <ComposerModeRow
        mode={mode}
        onModeChange={setMode}
        progressPercent={progressPercent}
        progressTone={progressTone}
        onProgressClick={onProgressClick}
        leading={modeRowLeading}
      />
    </div>
  );
}
