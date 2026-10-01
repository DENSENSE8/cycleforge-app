'use client';

import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives';
import { TAKE_REASONS, type TakeReasonChoice } from '@/lib/inventory/take-reason';

/**
 * Why this stock is leaving the location. A take cannot commit until one
 * explicit reason is selected; Custom also requires the operator's words.
 */
export function TakeReasonChooser({
  value,
  onChange,
  label = 'Take for',
}: {
  value: TakeReasonChoice;
  onChange: (next: TakeReasonChoice) => void;
  label?: string;
}) {
  return (
    <div className="space-y-2" data-testid="take-reason">
      <p className="text-role-eyebrow text-text-soft">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {TAKE_REASONS.map((option) => {
          const selected = value?.code === option.code;
          return (
            <Button
              key={option.code}
              variant={selected ? 'dangerSoft' : 'secondary'}
              aria-pressed={selected}
              data-reason={option.code}
              className="w-full justify-center"
              onClick={() => onChange(selected ? null : { code: option.code, custom: value?.custom ?? '' })}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
      {value?.code === 'TAKE_CUSTOM' && (
        <TextField
          value={value.custom}
          onChange={(custom) => onChange({ code: 'TAKE_CUSTOM', custom })}
          label="Reason"
          inputMode="text"
          autoComplete="off"
        />
      )}
    </div>
  );
}
