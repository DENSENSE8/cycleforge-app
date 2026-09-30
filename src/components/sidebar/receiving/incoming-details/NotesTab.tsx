import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Empty } from './incoming-details-primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * The records' ONE staff-notes editor — a textarea that saves when you click
 * away. The host owns the write (`save`): the carton's `support_notes`
 * ({@link NotesTab}), the repair's `notes` (the repair record).
 */
export function StaffNotesEditor({
  initialValue,
  resetKey,
  save: write,
  label,
  placeholder,
  testId,
}: {
  initialValue: string;
  /** A different record — the draft reseeds. */
  resetKey: string | number;
  /** Persist the trimmed text (null = cleared); throw to keep the draft and toast. */
  save: (text: string | null) => Promise<void>;
  /** The field's label; null when the host's group title already names it (Staff notes). */
  label: string | null;
  placeholder: string;
  testId: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setValue(initialValue), [initialValue, resetKey]);

  const save = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === (initialValue || '').trim()) return;
    setSaving(true);
    try {
      await write(trimmed || null);
      toast.success('Notes saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Notes save failed');
    } finally {
      setSaving(false);
    }
  }, [value, initialValue, write]);

  // Save on click-off:
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = textareaRef.current;
      if (el && !el.contains(e.target as Node)) void saveRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <div>
      {label ? <label className="block text-role-eyebrow text-text-soft">{label}</label> : null}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={label ? 6 : 3}
        aria-label={label ?? 'Staff notes'}
        data-testid={testId}
        placeholder={placeholder}
        className={cn("mt-1 w-full rounded-md border border-border-soft bg-surface-card px-2 py-1.5 text-role-caption font-medium leading-snug text-text-default placeholder:text-text-faint", focusRing('field', 'accent'))}
      />
      <div className="mt-2 text-role-eyebrow font-semibold text-text-faint">
        {saving ? 'Saving…' : 'Saves when you click away'}
      </div>
    </div>
  );
}

export function NotesTab({
  receivingId,
  initialValue,
  onSaved,
  label = 'Carton notes',
}: {
  receivingId: number | null;
  initialValue: string;
  /** After a successful save — a host with its own read (the carton record) refreshes it. */
  onSaved?: () => void;
  /** The field's label; null when the host's group title already names it (Staff notes). */
  label?: string | null;
}) {
  const queryClient = useQueryClient();

  const save = useCallback(
    async (text: string | null) => {
      const res = await fetch(`/api/receiving/${receivingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ support_notes: text }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'save failed');
      queryClient.invalidateQueries({ queryKey: ['incoming-details'] });
      onSaved?.();
    },
    [receivingId, queryClient, onSaved],
  );

  if (receivingId == null) {
    return (
      <Empty msg="No receiving row for this PO yet — notes will be available after the next PO sync." />
    );
  }

  return (
    <StaffNotesEditor
      initialValue={initialValue}
      resetKey={receivingId}
      save={save}
      label={label}
      placeholder="Vendor context, claim handoff, anything the receiver should see…"
      testId="receiving-staff-notes"
    />
  );
}
