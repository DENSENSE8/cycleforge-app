'use client';

/**
 * `SegmentedGlyphSwitch` — the ONE pick-one switch for how a list or record is
 * shown (In place · Split, Compact · Full). Each option is a small drawing of
 * its layout; the selected option also wears its word, and a hovered or focused
 * option spells its word out (owner 2026-09-29). One click switches. A face
 * slides between the options so the choice reads as one object moving.
 *
 * Radiogroup semantics (WAI-ARIA): arrows move and select, Home / End jump,
 * one tab stop.
 */

import { useContext, useId, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { HotkeyTooltip } from '@/components/ui/HotkeyTooltip';
import { AnimatePresence, LayoutGroup, motion, motionRole, useReducedMotion } from '@/design-system/motion';
import { AnimateText } from '@/design-system/motion/plus';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { DESK_RECORD_HEAD_LABEL_CLASS, DeskRecordHeadContext } from './DeskActionSlot';

export interface SegmentedGlyphOption<V extends string> {
  value: V;
  /** The word: visible on the selected option, spelled out on hover / focus. */
  label: string;
  /** The hotkey tooltip — what choosing it does and its chord — when the choice has one. */
  hotkey?: { action: string; chord: string };
  Glyph: ComponentType<{ className?: string }>;
  /** The glyph already reads as the word (a number, `20 · 30 · 99`): the word stays the accessible name only. */
  wordless?: boolean;
  testId: string;
}

export function SegmentedGlyphSwitch<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  testId,
  className,
}: {
  options: readonly SegmentedGlyphOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel: string;
  testId: string;
  className?: string;
}) {
  // On a record header band the words give way to the title while the band is compact.
  const inRecordHead = useContext(DeskRecordHeadContext);
  const groupId = useId();
  const reduce = useReducedMotion();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [peeked, setPeeked] = useState<V | null>(null);

  const transition = reduce ? { duration: 0 } : motionRole.record.pane.transition;
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = activeIndex === last ? 0 : activeIndex + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = activeIndex === 0 ? last : activeIndex - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <LayoutGroup id={groupId}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        data-testid={testId}
        onKeyDown={onKeyDown}
        className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-mode-control bg-surface-sunken p-0.5', className)}
      >
        {options.map((option, index) => {
          const { value: optionValue, label, hotkey, Glyph } = option;
          const active = optionValue === value;
          const expanded = !option.wordless && (active || peeked === optionValue);
          const button = (
            <motion.button
              key={optionValue}
              ref={(el: HTMLButtonElement | null) => {
                buttons.current[index] = el;
              }}
              layout
              transition={transition}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              tabIndex={index === activeIndex ? 0 : -1}
              data-testid={option.testId}
              data-expanded={expanded ? '' : undefined}
              onClick={active ? undefined : () => onChange(optionValue)}
              onPointerEnter={() => setPeeked(optionValue)}
              onPointerLeave={() => setPeeked(null)}
              onFocus={() => setPeeked(optionValue)}
              onBlur={() => setPeeked(null)}
              className={cn(
                'relative inline-flex h-7 items-center rounded-mode-control px-2 text-role-caption font-medium transition-colors duration-mode-feedback',
                active ? 'text-text-default' : 'text-text-muted hover:text-text-default',
                focusRing('control'),
              )}
            >
              {active ? (
                <motion.span
                  layoutId={`${groupId}-face`}
                  transition={transition}
                  className="absolute inset-0 rounded-mode-control bg-surface-card shadow-elev-soft"
                  aria-hidden
                />
              ) : null}
              <motion.span layout="position" transition={transition} className="relative inline-flex">
                <Glyph className={cn('h-3.5 w-[18px]', active && 'text-text-info')} />
              </motion.span>
              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.span
                    key="label"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 'auto', opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={transition}
                    className={cn('relative overflow-hidden whitespace-nowrap', inRecordHead && DESK_RECORD_HEAD_LABEL_CLASS)}
                    aria-hidden
                  >
                    <span className="inline-block pl-1.5">
                      {reduce ? label : <AnimateText type="char">{label}</AnimateText>}
                    </span>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.button>
          );
          return hotkey ? (
            <HotkeyTooltip key={optionValue} action={hotkey.action} chord={hotkey.chord} placement="above">
              {button}
            </HotkeyTooltip>
          ) : (
            button
          );
        })}
      </div>
    </LayoutGroup>
  );
}
