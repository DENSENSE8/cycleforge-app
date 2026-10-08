'use client';

/**
 * One value, one save — the Records dock's form verbs (Add / Replace tracking,
 * Change order number, Add note) in the strip's centered dialog (operator
 * 2026-10-08): the field is focused and Enter saves (a note's Shift+Enter is a
 * new line); a landed write turns the dialog to its done face. A write that
 * has an Undo keeps it on the bottom-right toast.
 */

import { useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';

export function ValueDialog({
  caption,
  label,
  submit,
  doneTitle,
  mono = false,
  multiline = false,
  testId,
  onSubmit,
  done,
}: {
  /** What the write touches — "Add a tracking number to 3 lines". */
  caption: string;
  label: string;
  submit: string;
  /** The done face's title — "Tracking added". */
  doneTitle: string;
  mono?: boolean;
  multiline?: boolean;
  testId: string;
  /** The write; resolves true when any line took it (refusals toast their own words). */
  onSubmit: (value: string) => Promise<boolean>;
  done: () => void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const ready = value.trim() !== '' && !saving;

  const save = async () => {
    if (!ready) return;
    const next = value.trim();
    setSaving(true);
    try {
      if (await onSubmit(next)) setSaved(next);
    } finally {
      setSaving(false);
    }
  };

  if (saved != null) {
    return (
      <VerbDoneState
        title={doneTitle}
        detail={<span className={mono ? 'font-mono' : undefined}>{saved}</span>}
        onDone={done}
        testId={`${testId}-done`}
      />
    );
  }

  return (
    <form
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid={testId}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-role-caption text-text-soft">{caption}</p>
      <TextField
        label={label}
        value={value}
        onChange={setValue}
        mono={mono}
        multiline={multiline}
        rows={4}
        autoFocus
        onKeyDown={(event) => {
          // A textarea's Enter saves too; Shift+Enter is its new line.
          if (!multiline || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void save();
        }}
        data-testid={`${testId}-field`}
      />
      <div className="mt-auto flex flex-col gap-1.5 border-t border-border-soft pt-3">
        <Button type="submit" variant="primary" size="md" className="w-full" disabled={!ready} loading={saving} data-testid={`${testId}-save`}>
          {submit}
        </Button>
        <p className="text-center text-role-micro text-text-soft">{multiline ? 'Enter saves · Shift+Enter for a new line' : 'Enter saves'}</p>
        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={done}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
