'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Loader2, X } from '@/components/Icons';
import { AnimatePresence, motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { AI_FOCUS_CLASS, AI_ICON_BUTTON_CLASS } from './classes';
import { aiPresence, aiTransition, useMotionPresence, useMotionTransition } from './motion';

export interface AiTurnAction {
  id: string;
  /** Accessible name and hover title ("Copy", "Regenerate", "Good answer"). */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Toggle actions (thumbs): the chosen one reads as held. */
  pressed?: boolean;
  disabled?: boolean;
  /**
   * The action's own feedback: `busy` spins while it runs, `done` flashes a ✓,
   * `error` a ✕ — the caller times the flash and returns to `idle`.
   */
  state?: 'idle' | 'busy' | 'done' | 'error';
}

export interface AiTurnActionsProps {
  actions: readonly AiTurnAction[];
  /** Show without hover (the latest answer, an open menu). Touch always shows. */
  visible?: boolean;
  /** `end` for the operator's own bubble. */
  align?: 'start' | 'end';
  /** The toolbar's accessible name. */
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}

type AiActionState = NonNullable<AiTurnAction['state']>;

/** How long a ✓ / ✕ holds before the glyph returns. */
const FLASH_MS = 1600;

/**
 * Per-action feedback state for an `AiTurnActions` row: `set(key, 'busy')`
 * while work runs, then `set(key, 'done' | 'error')` flashes and returns to
 * idle on its own. Keys are caller-chosen (`${messageId}:copy`).
 */
export function useAiActionStates() {
  const [states, setStates] = useState<Readonly<Record<string, AiActionState>>>({});
  const timers = useRef<Record<string, number>>({});
  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((t) => window.clearTimeout(t));
  }, []);
  const set = useCallback((key: string, state: AiActionState) => {
    window.clearTimeout(timers.current[key]);
    setStates((prev) => ({ ...prev, [key]: state }));
    if (state === 'done' || state === 'error') {
      timers.current[key] = window.setTimeout(() => {
        setStates((prev) => {
          const { [key]: _flashed, ...rest } = prev;
          return rest;
        });
      }, FLASH_MS);
    }
  }, []);
  const get = useCallback((key: string): AiActionState => states[key] ?? 'idle', [states]);
  return { get, set };
}

/**
 * AiTurnActions — the quiet icon row under a transcript turn (Copy ·
 * Regenerate · 👍 · 👎 under an answer; Copy · Edit under the operator's
 * bubble). The row fades in while the turn is hovered or holds focus: the
 * host turn carries `group/turn`. Pointer-less devices always show it.
 * `children` trail the buttons (a reason popover, a status line).
 */
export function AiTurnActions({ actions, visible, align = 'start', ariaLabel = 'Message actions', className, children }: AiTurnActionsProps) {
  const glyph = useMotionPresence(aiPresence.glyph);
  const morph = useMotionTransition(aiTransition.morph);
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      data-ai-turn-actions
      className={cn(
        'relative -ml-1.5 flex items-center gap-0.5 transition-opacity duration-150',
        align === 'end' && 'ml-0 -mr-1.5 justify-end',
        visible
          ? 'opacity-100'
          : 'opacity-0 group-focus-within/turn:opacity-100 group-hover/turn:opacity-100 [@media(hover:none)]:opacity-100',
        className,
      )}
    >
      {actions.map((action) => {
        const state = action.state ?? 'idle';
        return (
          <button
            key={action.id}
            type="button"
            aria-label={action.label}
            title={action.label}
            aria-pressed={action.pressed}
            disabled={action.disabled || state === 'busy'}
            onClick={action.onClick}
            data-action={action.id}
            data-state={state}
            className={cn(
              'ds-raw-button',
              AI_ICON_BUTTON_CLASS,
              AI_FOCUS_CLASS,
              'h-7 w-7',
              action.pressed && 'bg-ai-hover text-ai-ink',
              state === 'error' && 'text-text-danger',
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={state === 'idle' ? `icon-${action.pressed ? 'on' : 'off'}` : state} {...glyph} transition={morph} className="flex">
                {state === 'busy' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : state === 'done' ? (
                  <Check className="h-3.5 w-3.5 text-text-success" />
                ) : state === 'error' ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  action.icon
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        );
      })}
      {children}
    </div>
  );
}
