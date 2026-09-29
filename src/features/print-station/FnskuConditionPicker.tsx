'use client';

import { useState } from 'react';
import { Check, ChevronDown } from '@/components/Icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/primitives/radix-popover';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { CONDITION_GRADE_TONE, conditionGradeTone } from '@/lib/condition-tone';
import { FBA_CONDITIONS, fbaCondition } from '@/lib/fba/fba-conditions';
import { cn } from '@/utils/_cn';

export function FnskuConditionPicker({
  value,
  onChange,
  disabled = false,
  testId = 'fnsku-condition',
}: {
  value: string | null;
  onChange: (condition: string) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = fbaCondition(value);
  const label = current?.label ?? value?.trim() ?? 'Set condition';
  const tone = conditionGradeTone(current?.grade ?? null);
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Condition: ${label}. Change condition`}
          data-testid={testId}
          onPointerDown={stop}
          onClick={stop}
          className={cn(
            'pointer-events-auto inline-flex h-6 max-w-full items-center gap-1 rounded-full px-2 text-xs font-semibold ring-1 ring-inset',
            current ? tone.badge : 'bg-surface-sunken text-text-muted ring-border-soft',
            'disabled:cursor-not-allowed disabled:opacity-60',
            focusRing('control'),
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1" onClick={stop} onPointerDown={stop}>
        <div role="listbox" aria-label="FNSKU condition" className="flex flex-col gap-0.5">
          {FBA_CONDITIONS.map((entry) => {
            const selected = entry.value === current?.value;
            return (
              <button
                key={entry.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => {
                  onChange(entry.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex min-h-9 w-full items-center gap-2 rounded-mode-control px-2.5 text-left text-sm font-medium ring-1 ring-inset',
                  selected ? CONDITION_GRADE_TONE[entry.grade].active : CONDITION_GRADE_TONE[entry.grade].inactive,
                  focusRing('control'),
                )}
                data-testid={`${testId}-option`}
                data-condition={entry.value}
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {selected ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
