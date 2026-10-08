'use client';

import { Link2, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import {
  SEGMENTED_CONTROL_CORNER,
  SEGMENTED_CONTROL_FACE_CORNER,
} from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { ClaimMode } from './claim-types';

const MODES: readonly { value: ClaimMode; label: string; Icon: typeof Link2 }[] = [
  { value: 'update', label: 'Link', Icon: Link2 },
  { value: 'create', label: 'New', Icon: Plus },
];

/** Link ↔ New — the claim modal's pick-one, on the segmented corner tokens. */
export function ClaimModeSwitch({
  value,
  onChange,
  className,
}: {
  value: ClaimMode;
  onChange: (mode: ClaimMode) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Ticket mode"
      className={cn('inline-flex items-center gap-0.5 bg-surface-sunken p-0.5', SEGMENTED_CONTROL_CORNER, className)}
      data-testid="claim-mode-switch"
    >
      {MODES.map(({ value: mode, label, Icon }) => {
        const active = mode === value;
        return (
          <Button
            key={mode}
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
            icon={<Icon />}
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={cn(SEGMENTED_CONTROL_FACE_CORNER, active ? 'shadow-sm' : 'ring-0')}
            data-testid={`claim-mode-${mode}`}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
