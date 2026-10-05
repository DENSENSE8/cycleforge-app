'use client';

/** OmnichannelComposerDock — Claude / Cursor / ChatGPT-style prompt composer: */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  type ReactNode,
  type KeyboardEvent,
  type MutableRefObject,
  type Ref,
} from 'react';
import { motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { elevationClass } from '@/design-system/tokens/shadows';
import { COMPOSER_SHELL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  motionPresence,
  motionTransition,
} from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';
import { Button } from './Button';
import { CornerDownLeft, Send } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

const TEXTAREA_MIN_PX = 40;
/** ~max-h-48 — scroll only after multi-line growth hits the ceiling. */
const TEXTAREA_MAX_PX = 192;
/** Compact single-line floor (action bar sits below, not beside). */
const COMPACT_TEXTAREA_MIN_PX = 28;

/** Pure key handler — Enter commits, Shift+Enter inserts newline. */
export function handleComposerKeyDown(
  e: Pick<KeyboardEvent<HTMLTextAreaElement>, 'key' | 'shiftKey' | 'preventDefault'>,
  onCommit: () => void,
): boolean {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    onCommit();
    return true;
  }
  return false;
}

/** Whether the commit control renders. */
export function composerShowsCommit(opts: {
  hideCommitButton?: boolean;
  hasTrailingAction?: boolean;
  showCommitWithTrailing?: boolean;
}): boolean {
  if (opts.hideCommitButton) return false;
  if (opts.hasTrailingAction && !opts.showCommitWithTrailing) return false;
  return true;
}

/**
 * Dock outline radius. Always {@link COMPOSER_SHELL_CORNER} — never flatten
 * the floor to weld Unbox | Ticket into the card. `weldTop` only squares the
 * TOP so receive-feedback can share a silhouette; the bottom stays 2xl.
 */
export function composerDockShellCorner(opts: { weldTop?: boolean }): string {
  if (opts.weldTop) return `${COMPOSER_SHELL_CORNER} rounded-t-none`;
  return COMPOSER_SHELL_CORNER;
}

export function resizeComposerTextarea(
  el: HTMLTextAreaElement | null,
  opts: { minPx?: number; maxPx?: number } = {},
): void {
  if (!el) return;
  const minPx = opts.minPx ?? TEXTAREA_MIN_PX;
  const maxPx = opts.maxPx ?? TEXTAREA_MAX_PX;
  el.style.height = 'auto';
  const next = Math.min(Math.max(el.scrollHeight, minPx), maxPx);
  el.style.height = `${next}px`;
}

export interface OmnichannelComposerDockHandle {
  focus: () => void;
  blur: () => void;
  getTextarea: () => HTMLTextAreaElement | null;
}

interface OmnichannelComposerDockProps {
  value: string;
  onChange: (next: string) => void;
  /** Persist / send — Enter (no Shift) and the trailing commit control. */
  onCommit: (liveValue?: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Hide the trailing Send button (caller still gets Enter → onCommit). */
  hideCommitButton?: boolean;
  /** Commit control enabled. Default: value.trim().length > 0. */
  commitDisabled?: boolean;
  commitAriaLabel?: string;
  commitTooltip?: string;
  /** `data-testid` on the commit control (browser proofs address a labelled commit by what it does). */
  commitTestId?: string;
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
  /**
   * Absolute top-right of the textarea (Unbox notes Info). Caller owns the
   * control; this slot only places it so line 1 does not sit under the glyph.
   */
  headerEnd?: ReactNode;
  /**
   * Terminal control mounted at the footer's trailing edge. Historically
   * replaced the Send button; pass {@link showCommitWithTrailing} to keep an
   * Enter glyph beside it (station slim row).
   */
  trailingAction?: ReactNode;
  /**
   * Keep the commit glyph visible even when {@link trailingAction} is set.
   * Station Notes keeps this off — Print · Receive is the condensed Enter.
   */
  showCommitWithTrailing?: boolean;
  /** Commit face. - `send` — primary paper-plane pill (Support chat — default). */
  commitGlyph?: 'send' | 'enter' | 'action';
  /** `action` face only — the CTA's words. */
  commitLabel?: string;
  /** `action` face only — leading glyph. */
  commitIcon?: ReactNode;
  /** `action` face only — house variant. Default `primary`. */
  commitVariant?: 'primary' | 'danger';
  /**
   * Leading chrome INSIDE the outline on the bottom action row (station: +).
   * Always left of the action bar — never beside the textarea.
   */
  leadingStart?: ReactNode;
  /** Chrome INSIDE the outline, ABOVE the textarea, edge-to-edge (the shell's own pad is cancelled so a hairline here meets the border). */
  insetTop?: ReactNode;
  /**
   * Outer chrome. `raised` (default) owns the outline, {@link COMPOSER_SHELL_CORNER},
   * and elevation — the mode row under the dock is not part of this card.
   * `bare` is a body zone inside a host that already paints the plane.
   */
  chrome?: 'raised' | 'bare';
  /** Flatten the TOP corners so a panel welded to this dock's upper edge shares one silhouette with it (Unbox receive feedback —… */
  weldTop?: boolean;
  /**
   * `default` — roomier padding (Support chat / notes).
   * `compact` — tighter padding (station Unbox). Both are flex-col:
   * textarea above, bottom action bar with `justify-between`.
   */
  density?: 'default' | 'compact';
  /** Auto-grow between min/max. Default true. Ignored when `manualResize`. */
  autoGrow?: boolean;
  /**
   * CSS drag-resize on the textarea (`resize-y`). Disables auto-grow so the
   * operator can pull the paste field taller inside a sidebar (e.g. Checking
   * unreceived orders). Still uses the column shell.
   */
  manualResize?: boolean;
  /** Floor height in px when `manualResize` is on. Default 72. */
  manualResizeMinPx?: number;
  className?: string;
  /** Skip mount entrance (e.g. when already in a presence tree). */
  animateMount?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  /**
   * Optional inline ghost autocomplete (Unbox label-note MRU). Overlay paints
   * the untyped suffix; Tab / ArrowRight / click accept via {@link onAcceptGhost}.
   */
  ghostSuffix?: string;
  matchedPhrase?: string | null;
  onAcceptGhost?: () => void;
  onDismissGhost?: () => void;
  /**
   * Extra keydown before Enter commit. Return true when handled (skip default
   * Enter / composer handling for that key).
   */
  onTextareaKeyDown?: (
    e: KeyboardEvent<HTMLTextAreaElement>,
  ) => boolean | void;
}

export const OmnichannelComposerDock = forwardRef<
  OmnichannelComposerDockHandle,
  OmnichannelComposerDockProps
>(function OmnichannelComposerDock(
  {
    value,
    onChange,
    onCommit,
    placeholder = 'Write a message…',
    ariaLabel = 'Message',
    disabled = false,
    hideCommitButton = false,
    commitDisabled,
    commitAriaLabel = 'Save note',
    commitTooltip = 'Save (Enter)',
    commitTestId,
    footerStart,
    footerEnd,
    headerEnd,
    trailingAction,
    showCommitWithTrailing = false,
    commitGlyph = 'send',
    commitLabel,
    commitIcon,
    commitVariant = 'primary',
    leadingStart,
    insetTop,
    chrome = 'raised',
    weldTop = false,
    density = 'default',
    autoGrow = true,
    manualResize = false,
    manualResizeMinPx = 72,
    className,
    animateMount = true,
    onBlur,
    onFocus,
    textareaRef: textareaRefProp,
    ghostSuffix,
    matchedPhrase = null,
    onAcceptGhost,
    onDismissGhost,
    onTextareaKeyDown,
  },
  ref,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const compact = density === 'compact';
  const growEnabled = autoGrow && !manualResize;
  useImperativeHandle(ref, () => ({
    focus: () => localRef.current?.focus(),
    blur: () => localRef.current?.blur(),
    getTextarea: () => localRef.current,
  }));

  const setTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (!textareaRefProp) return;
      if (typeof textareaRefProp === 'function') {
        textareaRefProp(node);
      } else {
        (textareaRefProp as MutableRefObject<HTMLTextAreaElement | null>).current = node;
      }
    },
    [textareaRefProp],
  );

  const grow = useCallback(() => {
    if (!growEnabled) return;
    resizeComposerTextarea(localRef.current, {
      minPx: compact ? COMPACT_TEXTAREA_MIN_PX : TEXTAREA_MIN_PX,
      maxPx: TEXTAREA_MAX_PX,
    });
  }, [growEnabled, compact]);

  useEffect(() => {
    grow();
  }, [value, grow]);

  const presence = useMotionPresence(motionPresence.composerDock);
  const mountTransition = useMotionTransition(motionTransition.composerDockMount);

  const canCommit =
    commitDisabled !== undefined ? !commitDisabled : value.trim().length > 0;

  const bare = chrome === 'bare';

  const trailing = (
    <div className="flex shrink-0 items-center gap-1">
      {footerEnd}
      {composerShowsCommit({
        hideCommitButton,
        hasTrailingAction: trailingAction != null,
        showCommitWithTrailing,
      }) ? (
        commitGlyph === 'action' ? (
          <HoverTooltip label={commitTooltip} focusable={false}>
            <Button
              variant={commitVariant}
              size="sm"
              type="button"
              radius="composer"
              ariaLabel={commitAriaLabel}
              disabled={disabled || !canCommit}
              onClick={() => onCommit(localRef.current?.value)}
              icon={commitIcon}
              data-testid={commitTestId}
            >
              {commitLabel ?? commitAriaLabel}
            </Button>
          </HoverTooltip>
        ) : commitGlyph === 'enter' ? (
          <HoverTooltip label={commitTooltip} focusable={false}>
            <button
              type="button"
              aria-label={commitAriaLabel}
              disabled={disabled || !canCommit}
              onClick={() => onCommit(localRef.current?.value)}
              className={cn(
                'ds-raw-button inline-flex h-8 w-8 shrink-0 items-center justify-center',
                'text-text-faint hover:text-text-muted',
                'disabled:pointer-events-none disabled:opacity-40',
                focusRing('control', 'accent'),
              )}
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
            </button>
          </HoverTooltip>
        ) : (
          <HoverTooltip label={commitTooltip} focusable={false}>
            <Button
              variant="primary"
              size="sm"
              type="button"
              ariaLabel={commitAriaLabel}
              disabled={disabled || !canCommit}
              onClick={() => onCommit(localRef.current?.value)}
              className="h-7 w-7 rounded-full p-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </HoverTooltip>
        )
      ) : null}
      {trailingAction ? <div className="min-w-0">{trailingAction}</div> : null}
    </div>
  );

  const fieldPad = compact
    ? 'px-1.5 py-1'
    : headerEnd
      ? 'px-3.5 pt-3 pb-1.5 pr-10'
      : 'px-3.5 pt-3 pb-1.5';

  const shell = (
    <div
      className={cn(
        // AI-first column: field grows; action bar stays pinned to the bottom.
        'flex min-h-14 min-w-0 w-full flex-col',
        compact ? 'gap-0.5 p-1.5' : 'gap-0 p-0',
        bare
          ? 'bg-transparent'
          : cn(
              composerDockShellCorner({ weldTop }),
              'relative z-raised border border-border-soft bg-surface-card',
              !weldTop && elevationClass('raised'),
              // Focus ring on the SHELL — not a ring painted on the textarea.
              focusRing('wrapper', 'accent'),
              !weldTop && 'focus-within:ring-2 focus-within:ring-blue-500/25',
            ),
        disabled && 'opacity-60',
        className,
      )}
      data-testid="omnichannel-composer-dock"
      data-composer-chrome={chrome}
      data-composer-density={density}
      data-composer-weld-top={weldTop ? 'true' : undefined}
    >
      {insetTop ? (
        <div
          data-composer-inset-top=""
          className={cn(
            // Bleed through the shell's own padding so the slot's own rule lands ON the outline rather than a gutter inside it.
            'min-w-0 overflow-hidden',
            !bare && (weldTop ? 'rounded-t-none' : 'rounded-t-2xl'),
            compact && '-mx-1.5 -mt-1.5 mb-0.5',
          )}
        >
          {insetTop}
        </div>
      ) : null}
      <div className="relative min-w-0 w-full flex-1">
        {headerEnd ? (
          <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex h-auto w-auto items-start">
            <div className="pointer-events-auto">{headerEnd}</div>
          </div>
        ) : null}
        {ghostSuffix ? (
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 overflow-hidden text-role-caption leading-5',
              fieldPad,
            )}
          >
            <span className="whitespace-pre-wrap break-words">
              <span className="text-transparent">{value}</span>
              <button
                type="button"
                tabIndex={-1}
                className="ds-raw-button pointer-events-auto cursor-pointer border-0 bg-transparent p-0 text-inherit text-text-faint"
                aria-label={
                  matchedPhrase ? `Accept suggestion: ${matchedPhrase}` : 'Accept suggestion'
                }
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAcceptGhost?.();
                }}
              >
                {ghostSuffix}
              </button>
            </span>
          </div>
        ) : null}
        <textarea
          ref={setTextareaRef}
          value={value}
          disabled={disabled}
          rows={1}
          aria-label={ariaLabel}
          aria-autocomplete={ghostSuffix != null || onAcceptGhost ? 'inline' : undefined}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={onFocus}
          onKeyDown={(e) => {
            if (disabled) return;
            if (onTextareaKeyDown?.(e)) return;
            if (e.key === 'Escape' && ghostSuffix && onDismissGhost) {
              e.preventDefault();
              onDismissGhost();
              return;
            }
            // Enter commits from the LIVE textarea value.
            handleComposerKeyDown(e, () => {
              const live = (e.currentTarget.value || localRef.current?.value || value).trim();
              if (!live) return;
              onCommit(live);
            });
          }}
          className={cn(
            'relative block w-full flex-grow bg-transparent text-role-caption text-text-default',
            'placeholder:text-text-faint outline-none focus:outline-none leading-5',
            fieldPad,
            manualResize
              ? 'max-h-64 overflow-y-auto resize-y'
              : cn(
                  'resize-none',
                  growEnabled
                    ? compact
                      ? 'max-h-48 min-h-7 overflow-y-auto'
                      : 'max-h-48 min-h-10 overflow-y-auto'
                    : compact
                      ? 'min-h-7'
                      : 'min-h-10',
                ),
          )}
          style={manualResize ? { minHeight: manualResizeMinPx } : undefined}
        />
      </div>

      {/* Persistent bottom action row — + left · Location / Enter / Print right */}
      <div
        className={cn(
          'mt-auto flex w-full shrink-0 items-center justify-between gap-1',
          compact ? 'pt-0.5' : 'px-2 pb-1.5 pt-0.5',
        )}
      >
        <div className="flex min-w-0 items-center gap-0.5">
          {leadingStart}
          {footerStart}
        </div>
        {trailing}
      </div>
    </div>
  );

  if (!animateMount) return shell;

  return (
    <motion.div
      initial={presence.initial}
      animate={presence.animate}
      exit={'exit' in presence ? presence.exit : undefined}
      transition={mountTransition}
    >
      {shell}
    </motion.div>
  );
});
