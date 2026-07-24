'use client';

/**
 * StationComposerDock — ChatGPT/Gemini-style prompt composer for station docks.
 *
 * Elevated rounded shell with auto-grow textarea on top and a utility footer
 * strip (leading actions · trailing commit). First consumer: Unbox carton notes.
 *
 * Motion: mount via {@link useMotionPresence} / {@link useMotionTransition}
 * (opacity + small y). Never bounce/elastic; respects reduced-motion.
 */

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
import { motion } from 'framer-motion';
import { cn } from '@/utils/_cn';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  framerDuration,
  framerPresence,
  framerTransition,
  motionBezier,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { Button } from './Button';
import { Send } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

const TEXTAREA_MIN_PX = 40;
const TEXTAREA_MAX_PX = 128;

/** Pure key handler — Enter commits, Shift+Enter inserts newline. */
export function handleStationComposerKeyDown(
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

/**
 * Whether the blue Send control renders. A `trailingAction` (e.g. the Unbox
 * overview receive split-CTA) OWNS the trailing slot — two primaries in one
 * footer read as two cards. Enter / blur still commit.
 */
export function stationComposerShowsCommit(opts: {
  hideCommitButton?: boolean;
  hasTrailingAction?: boolean;
}): boolean {
  return !opts.hideCommitButton && !opts.hasTrailingAction;
}

export function resizeStationComposerTextarea(
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

interface StationComposerDockHandle {
  focus: () => void;
  blur: () => void;
  getTextarea: () => HTMLTextAreaElement | null;
}

interface StationComposerDockProps {
  value: string;
  onChange: (next: string) => void;
  /** Persist / send — Enter (no Shift) and the trailing commit control. */
  onCommit: () => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Hide the trailing Send button (caller still gets Enter → onCommit). */
  hideCommitButton?: boolean;
  /** Commit control enabled. Default: value.trim().length > 0. */
  commitDisabled?: boolean;
  commitAriaLabel?: string;
  commitTooltip?: string;
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
  /**
   * Terminal control mounted at the footer's trailing edge. Replaces the blue
   * Send button (Enter / blur still commit) so the composer stays ONE shell
   * instead of a composer card + a separate CTA dock.
   */
  trailingAction?: ReactNode;
  /** Auto-grow between min/max. Default true. */
  autoGrow?: boolean;
  className?: string;
  /** Skip mount entrance (e.g. when already in a presence tree). */
  animateMount?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export const StationComposerDock = forwardRef<
  StationComposerDockHandle,
  StationComposerDockProps
>(function StationComposerDock(
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
    footerStart,
    footerEnd,
    trailingAction,
    autoGrow = true,
    className,
    animateMount = true,
    onBlur,
    onFocus,
    textareaRef: textareaRefProp,
  },
  ref,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
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
    if (!autoGrow) return;
    resizeStationComposerTextarea(localRef.current);
  }, [autoGrow]);

  useEffect(() => {
    grow();
  }, [value, grow]);

  const presence = useMotionPresence({
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
  });
  const mountTransition = useMotionTransition({
    duration: framerDuration.workbenchPaneMount,
    ease: motionBezier.easeOut,
  });
  // Keep named presets referenced so ratchet/docs stay aligned.
  void framerPresence.workbenchPane;
  void framerTransition.workbenchPaneMount;

  const canCommit =
    commitDisabled !== undefined ? !commitDisabled : value.trim().length > 0;

  const shell = (
    <div
      className={cn(
        'flex w-full flex-col rounded-2xl border border-border-soft bg-surface-card transition-[border-color,box-shadow] duration-150',
        elevationClass('raised'),
        focusRing('wrapper', 'accent'),
        'focus-within:ring-2 focus-within:ring-blue-500/20',
        disabled && 'opacity-60',
        className,
      )}
      data-testid="station-composer-dock"
    >
      <textarea
        ref={setTextareaRef}
        value={value}
        disabled={disabled}
        rows={1}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (disabled) return;
          handleStationComposerKeyDown(e, () => {
            if (!canCommit) return;
            onCommit();
          });
        }}
        className={cn(
          'block w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-role-caption leading-5 text-text-default placeholder:text-text-faint',
          'focus:outline-none',
          autoGrow ? 'max-h-32 min-h-[40px] overflow-y-auto' : 'min-h-[40px]',
        )}
      />
      <div className="flex items-center gap-2 px-2 pb-2 pt-0.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">{footerStart}</div>
        <div className="flex shrink-0 items-center gap-1.5">
          {footerEnd}
          {stationComposerShowsCommit({
            hideCommitButton,
            hasTrailingAction: trailingAction != null,
          }) ? (
            <HoverTooltip label={commitTooltip} focusable={false}>
              <Button
                variant="primary"
                size="sm"
                type="button"
                ariaLabel={commitAriaLabel}
                disabled={disabled || !canCommit}
                onClick={() => onCommit()}
                className="h-7 w-7 p-0"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </HoverTooltip>
          ) : null}
          {trailingAction ? <div className="pl-0.5">{trailingAction}</div> : null}
        </div>
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
