'use client';

/**
 * Small fields the inbound-order form repeats: a single civil date (the
 * compact `DateRangePickerField`, clearable) and a paste-many list of tokens
 * (listing serials) — type one and press Enter, or paste a whole list and it
 * splits into chips.
 */

import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { X } from '@/components/Icons';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { FormField } from '@/design-system/components/FormField';
import { IconButton, TextField } from '@/design-system/primitives';
import { RECORD_RECESS_CLASS } from '@/design-system/tokens/record';
import { splitPastedList } from '@/lib/inbound/inbound-order-compose';
import { cn } from '@/utils/_cn';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';

export function InboundDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  /** YYYY-MM-DD, or null while unsaid. */
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <FormField label={label}>
      <DateRangePickerField
        variant="compact"
        ariaLabel={label}
        value={value ? dateKeyToLocalDate(value) : undefined}
        onChange={(day: Date) => onChange(localDateToDateKey(day))}
        onClear={() => onChange(null)}
      />
    </FormField>
  );
}

/** A typed or pasted list of tokens: Enter adds what is typed; a paste of many splits into chips. */
export function PastedTokensField({
  label,
  tokens,
  onAdd,
  onRemove,
  testId,
}: {
  label: string;
  tokens: readonly string[];
  onAdd: (tokens: string[]) => void;
  onRemove: (index: number) => void;
  testId?: string;
}) {
  const [text, setText] = useState('');
  const commit = (raw: string) => {
    const parts = splitPastedList(raw);
    if (parts.length) onAdd(parts);
    setText('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    commit(text);
  };
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (splitPastedList(pasted).length < 2) return;
    event.preventDefault();
    commit(`${text} ${pasted}`);
  };
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <TextField
        label={label}
        value={text}
        mono
        autoComplete="off"
        spellCheck={false}
        onChange={setText}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => {
          if (text.trim()) commit(text);
        }}
      />
      {tokens.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {tokens.map((token, index) => (
            <li key={token} className={cn(RECORD_RECESS_CLASS, 'inline-flex items-center gap-1 py-0.5 pl-2 pr-0.5 font-mono text-role-caption text-text-default')}>
              {token}
              <IconButton size="xs" icon={<X className="h-3 w-3" />} ariaLabel={`Remove ${token}`} onClick={() => onRemove(index)} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
