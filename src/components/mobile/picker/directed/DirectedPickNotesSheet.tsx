'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const NOTE_MAX = 1000;

/** One-tap codes for what pickers report most; free text covers the rest. */
const QUICK_NOTES = ['Box damaged', 'Label unreadable', 'Bin mislabeled', 'Wrong item in bin', 'Extra units in bin'] as const;

/**
 * The directed picker's Notes verb: a note on the current line (every unit
 * of it), saved to each unit's timeline. A quick code fills the field; the
 * picker can add to it before saving. Does not advance the pick.
 */
export function DirectedPickNotesSheet({
  open,
  onClose,
  lineLabel,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  /** `SKU · bin` — what the note is about. */
  lineLabel: string;
  onSave: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setText('');
  }, [open]);

  const trimmed = text.trim();

  const save = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    const ok = await onSave(trimmed);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Note on this pick">
      <p className="mb-3 truncate font-mono text-role-data text-text-muted">{lineLabel}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_NOTES.map((quick) => (
          <Button
            key={quick}
            variant="secondary"
            size="sm"
            className="rounded-none"
            onClick={() => setText((prev) => (prev.trim() ? `${prev.trim()} · ${quick}` : quick))}
          >
            {quick}
          </Button>
        ))}
      </div>
      <label className="block">
        <span className="mb-1.5 block text-role-eyebrow text-text-soft">Note</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX))}
          rows={3}
          placeholder="What should the next person know?"
          className={cn(
            'w-full resize-none rounded-none border border-border-default bg-surface-card px-4 py-3 text-role-field text-text-default',
            focusRing('field', 'accent'),
          )}
        />
      </label>
      <div className="mt-4 flex flex-col gap-2">
        <Button variant="primary" size="lg" className="w-full rounded-none" disabled={!trimmed || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : trimmed ? 'Save note' : 'Type or tap a note first'}
        </Button>
        <Button variant="ghost" size="lg" className="w-full rounded-none" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </BottomSheet>
  );
}
