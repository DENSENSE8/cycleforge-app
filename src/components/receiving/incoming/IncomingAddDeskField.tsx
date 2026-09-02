'use client';

import type { KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { triagePanelControl } from '@/design-system/tokens/triage-panel';

export function IncomingAddDeskField({
  id,
  label,
  value,
  onChange,
  required,
  autoFocus,
  mono,
  type,
  min,
  onEnter,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  mono?: boolean;
  type?: string;
  min?: number;
  onEnter?: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && onEnter) {
      event.preventDefault();
      onEnter();
    }
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        required={required}
        autoFocus={autoFocus}
        type={type}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={triagePanelControl(mono && 'font-mono')}
      />
    </div>
  );
}
