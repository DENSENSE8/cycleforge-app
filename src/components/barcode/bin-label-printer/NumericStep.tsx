'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { Check, ChevronDown, ChevronUp } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { noPad, pad2 } from '@/lib/barcode-routing';
import {
  LABEL_BUILDER_NUMPAD,
  LABEL_BUILDER_SELECTED,
} from '../label-builder-layout';

interface NumericStepProps {
  title: string;
  prefix: string;
  count: number;
  selected?: number;
  onPick: (n: number) => void;
  renderTag?: (n: number) => string | null;
  customLabel?: string;
  /** Optional one-line explainer rendered between title and the tile grid. */
  hint?: string;
  /** When true, tile labels are unpadded ("1", "2", …) — matches the level
   *  segment on printed labels which uses {@link noPad}. Defaults to false. */
  unpadded?: boolean;
}

const NUMERIC_QUICK_PICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function NumericStep({
  title,
  prefix,
  count,
  selected,
  onPick,
  renderTag,
  hint,
  unpadded,
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

  const confirmCustom = () => {
    if (!customValid) return;
    onPick(customNum);
    setCustom('');
  };

  // Stepper buttons. First tap on either arrow with an empty field always
  // lands on 10 (one past the quick-pick range), so the user discovers the
  // custom range without overshooting. Subsequent taps step from there.
  const stepBy = (delta: number) => {
    if (!customValid) {
      setCustom('10');
      return;
    }
    const next = Math.min(99, Math.max(1, customNum + delta));
    setCustom(String(next));
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
                onClick={() => onPick(n)}
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
                    className={`mt-0.5 text-role-eyebrow font-semibold uppercase tracking-wider ${
                      isSelected ? 'text-white/80' : 'text-text-faint'
                    }`}
                  >
                    {tag}
                  </span>
                )}
              </button>
            );
          })}

          {/* 10th tile = inline custom input with stepper + checkmark.
              Subsumes the separate "Custom #" row that used to live below
              the grid. */}
          <div
            className={`${LABEL_BUILDER_NUMPAD.customTile} ${
              isCustomSelected
                ? LABEL_BUILDER_SELECTED.soft
                : 'border-border-default focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100'
            }`}
            aria-label={customLabel}
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCustom();
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

            <IconButton
              type="button"
              onClick={confirmCustom}
              disabled={!customValid}
              ariaLabel={`Confirm ${customLabel.toLowerCase()}`}
              className={`ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${LABEL_BUILDER_SELECTED.confirm}`}
              icon={<Check className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
