'use client';

/**
 * The AI composer's access mode, bottom row: the CURRENT mode as a face (glyph
 * + short word, the Ask face in the house Ask wash — `ModeFace` grammar), and
 * a click opens an upward menu of both modes with a one-line description and
 * a check on the current one. Shift + Tab in the field cycles it — the same
 * chord the station composer's mode row uses.
 *
 * Ask only is enforced by the server — the chat route advertises and
 * dispatches read tools only — so this control is the operator's intent, not
 * the gate.
 */

import { useEffect, useState, type RefObject } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AskMark, Check, ChevronDown, Zap } from '@/components/Icons';
import { COMPOSER_ASK_CHIP_CLASS } from '@/components/composer/ComposerModeRow';
import { HotkeyTooltip } from '@/components/ui/HotkeyTooltip';
import { AI_FOCUS_CLASS, AI_PANEL_CLASS, aiTransition, useMotionPresence, useMotionTransition } from '@/design-system/ai';
import { AnimatePresence, motion } from '@/design-system/motion';
import { STATION_COMPOSER_CYCLE_CHORD } from '@/lib/composer/station-composer-mode';
import type { AssistantAccessMode } from '@/lib/assistant/access-mode';
import { cn } from '@/utils/_cn';

const MODES: ReadonlyArray<{ id: AssistantAccessMode; label: string; hint: string; Icon: typeof Zap }> = [
  { id: 'full', label: 'Full access', hint: 'Reads and makes changes — each change asks you to confirm', Icon: Zap },
  { id: 'ask', label: 'Ask only', hint: 'Read-only — the assistant cannot change anything', Icon: AskMark },
];

export function AccessModeSwitch({
  mode,
  onChange,
  fieldRef,
}: {
  mode: AssistantAccessMode;
  onChange: (next: AssistantAccessMode) => void;
  /** The composer field — Shift + Tab there cycles the mode. */
  fieldRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const current = MODES.find((m) => m.id === mode) ?? MODES[0]!;

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !e.shiftKey || e.isComposing || e.altKey || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      onChange(mode === 'full' ? 'ask' : 'full');
    };
    field.addEventListener('keydown', onKey);
    return () => field.removeEventListener('keydown', onKey);
  }, [fieldRef, mode, onChange]);

  // shadcn's menu entrance: fade + zoom from 95% + a few px up from below.
  const pop = useMotionPresence({
    initial: { opacity: 0, scale: 0.95, y: 4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 4 },
  });
  const popTransition = useMotionTransition(aiTransition.morph);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <HotkeyTooltip action="Switch access" chord={STATION_COMPOSER_CYCLE_CHORD}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={`Access: ${current.label} — change`}
            data-testid="composer-access-mode"
            data-access-mode={mode}
            className={cn(
              'ds-raw-button ml-1 flex h-8 items-center gap-1 rounded-ai-chip px-2 text-ai-label leading-none text-ai-ink transition-colors duration-150',
              mode === 'ask' ? COMPOSER_ASK_CHIP_CLASS : 'hover:bg-ai-hover',
              AI_FOCUS_CLASS,
            )}
          >
            <current.Icon className="block h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">{current.label}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-ai-faint" />
          </button>
        </PopoverPrimitive.Trigger>
      </HotkeyTooltip>
      <AnimatePresence>
        {open ? (
          <PopoverPrimitive.Portal forceMount>
            <PopoverPrimitive.Content
              forceMount
              asChild
              side="top"
              align="start"
              sideOffset={8}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                fieldRef.current?.focus();
              }}
            >
              <motion.div
                {...pop}
                transition={popTransition}
                style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
                className={cn(AI_PANEL_CLASS, 'z-command w-72 p-1.5 outline-none')}
                role="menu"
                aria-label="Assistant access"
                data-testid="composer-access-menu"
              >
                {MODES.map(({ id, label, hint, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === id}
                    data-testid={`composer-access-${id}`}
                    onClick={() => {
                      onChange(id);
                      setOpen(false);
                    }}
                    className={cn(
                      'ds-raw-button flex w-full items-start gap-2.5 rounded-ai-chip px-2.5 py-2 text-left transition-colors duration-150 hover:bg-ai-hover',
                      AI_FOCUS_CLASS,
                    )}
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-ai-prose-sm text-ai-ink">{label}</span>
                      <span className="block text-ai-label text-ai-faint">{hint}</span>
                    </span>
                    {mode === id ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai-ink" /> : null}
                  </button>
                ))}
                <p className="border-t border-ai-line px-2.5 pb-1 pt-2 text-ai-label text-ai-faint">⇧Tab in the message box switches</p>
              </motion.div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
