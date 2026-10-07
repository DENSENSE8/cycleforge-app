'use client';

import { useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';

/** One value, one confirm — the card a verb opens above the pill (the house field + buttons, as `ListRemovalPicker`). */
export function ValueCard({
  title,
  label,
  submit,
  mono = false,
  multiline = false,
  busy,
  onCancel,
  onSubmit,
}: {
  title: string;
  label: string;
  submit: string;
  mono?: boolean;
  multiline?: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const ready = value.trim() !== '' && !busy;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(value.trim());
      }}
    >
      <p className="px-2 pt-1 text-sm font-semibold text-text-default">{title}</p>
      <TextField label={label} value={value} onChange={setValue} mono={mono} multiline={multiline} autoFocus />
      <div className="flex justify-end gap-2 px-1 pb-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!ready}>
          {busy ? 'Saving…' : submit}
        </Button>
      </div>
    </form>
  );
}

