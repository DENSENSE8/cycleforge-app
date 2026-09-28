'use client';

/**
 * Label-builder numeric step — 1–9 quick-pick + custom 10–99 stepper.
 * Shared by bin labels and rack labels. Do not fork a printer-local twin.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { noPad, pad2 } from '@/lib/barcode-routing';
import {
  LABEL_BUILDER_NUMPAD,
  LABEL_BUILDER_SELECTED,
} from '../label-builder-layout';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

interface NumericStepProps {
  title: string;
  /** Optional tile prefix (bin labels). Rack omits it. */
  prefix?: string;
  count: number;
  selected?: number;
  onPick: (n: number) => void;
  renderTag?: (n: number) => string | null;
  customLabel?: string;
  /** When true, the selected tile toggles off (bin position is optional on the sticker). */
  allowClear?: boolean;
  onClear?: () => void;
  /** Optional one-line explainer rendered between title and the tile grid. */
  hint?: string;
  /** When true, tile labels are unpadded ("1", "2", …) — matches the level
   *  segment on printed labels which uses {@link noPad}. Defaults to false. */
  unpadded?: boolean;
}

const NUMERIC_QUICK_PICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function NumericStep({
  title,
  prefix = '',
  count,
  selected,
  onPick,
  renderTag,
  hint,
  unpadded,
  allowClear,
  onClear,
  customLabel = 'Custom #',
}: NumericStepProps) {
  const format = unpadded ? noPad : pad2;
  // selected > 9 means a custom value is the current pick; highlight the
  // 10th tile so users can see what they entered without scanning the
  // step pills at the top.
  const isCustomSelected = selected != null && selected > 9;
  const customPlaceholder = '10+';
  const reduceMotion = useReducedMotion();

  const [custom, setCustom] = useState('');
  const customNum = parseInt(custom, 10);
  const customValid = Number.isFinite(customNum) && customNum >= 1 && customNum <= 99;
  const shown = custom !== '' ? custom : isCustomSelected ? String(selected) : '';

  useEffect(() => {
    if (selected == null || selected <= 9) setCustom('');
  }, [selected]);

  const commitCustom = (raw: string) => {
    setCustom(raw);
    if (raw === '' && allowClear) {
      onClear?.();
      return;
    }
    const n = parseInt(raw, 10);
    // Live-commit 10–99 so the tile does not need a check. 1–9 stay on the
    // quick-picks so typing "1" of "12" does not steal the 01 pad.
    if (Number.isFinite(n) && n >= 10 && n <= 99) onPick(n);
  };

  // Stepper buttons. First tap on either arrow with an empty field always
  // lands on 10 (one past the quick-pick range), so the user discovers the
  // custom range without overshooting. Subsequent taps pick immediately.
  const stepBy = (delta: number) => {
    const base = customValid
      ? customNum
      : isCustomSelected && selected != null
        ? selected
        : 10;
    const next =
      customValid || isCustomSelected
        ? Math.min(99, Math.max(10, base + delta))
        : 10;
    setCustom(String(next));
    onPick(next);
  };

  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={prefix || 'num'}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
      >
        <div className={`flex items-baseline justify-between ${hint ? 'mb-1' : 'mb-2'}`}>
          <h3 className="text-sm font-semibold tracking-tight text-text-default">{title}</h3>
          <span className="text-role-micro font-medium tabular-nums text-text-faint">up to {count}</span>
        </div>

        {hint && <p className="mb-2 text-role-caption leading-snug text-text-soft">{hint}</p>}

        <div className={LABEL_BUILDER_NUMPAD.grid}>
          {NUMERIC_QUICK_PICKS.map((n) => {
            const isSelected = selected === n;
            const tag = renderTag ? renderTag(n) : null;
            return (
              // ds-raw-button: numpad quick-pick tile — fixed grid sizing
              <button
                key={n}
                type="button"
                onClick={() => {
                  if (allowClear && isSelected) onClear?.();
                  else onPick(n);
                }}
                className={`ds-raw-button ${LABEL_BUILDER_NUMPAD.tile} ${
                  isSelected
                    ? LABEL_BUILDER_SELECTED.solid
                    : 'border-border-soft bg-surface-card text-text-default hover:border-border-default hover:bg-surface-hover'
                }`}
              >
                <span className={LABEL_BUILDER_NUMPAD.tileLabel}>
                  {prefix}
                  {format(n)}
                </span>
                {tag && (
                  <span
                    className={`mt-0.5 text-role-eyebrow font-semibold ${
                      isSelected ? 'text-white/80' : 'text-text-faint'
                    }`}
                  >
                    {tag}
                  </span>
                )}
              </button>
            );
          })}

          {/* 10th tile = inline custom input + stepper. Typing 10–99 or
              tapping the arrows commits — no checkmark that ate the digits. */}
          <div
            className={`${LABEL_BUILDER_NUMPAD.customTile} ${
              isCustomSelected
                ? LABEL_BUILDER_SELECTED.soft
                : cn('border-border-default', focusRing('wrapper', 'accent'))
            }`}
            aria-label={customLabel}
          >
            <input
              type="number"
              inputMode="numeric"
              min={10}
              max={99}
              value={shown}
              onChange={(e) => commitCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  stepBy(1);
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  stepBy(-1);
                }
              }}
              placeholder={customPlaceholder}
              aria-label={customLabel}
              className={LABEL_BUILDER_NUMPAD.customInput}
            />

            <div className="ml-0.5 flex h-9 shrink-0 flex-col justify-center gap-0.5">
              <IconButton
                type="button"
                onClick={() => stepBy(1)}
                ariaLabel="Increment"
                className="flex h-4 w-6 items-center justify-center rounded-md hover:bg-surface-sunken"
                icon={<ChevronUp className="h-3 w-3" />}
              />
              <IconButton
                type="button"
                onClick={() => stepBy(-1)}
                ariaLabel="Decrement"
                className="flex h-4 w-6 items-center justify-center rounded-md hover:bg-surface-sunken"
                icon={<ChevronDown className="h-3 w-3" />}
              />
            </div>
          </div>
        </div>

        {allowClear && selected != null && (
          <div className="mt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onClear?.()}>
              Leave off the sticker
            </Button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
