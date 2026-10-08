import {
  RECORD_LABEL_CLASS,
  RECORD_NOTE_ADD_CLASS,
  RECORD_NOTE_BADGE_CLASS,
  RECORD_NOTE_SLOT_CLASS,
} from '@/design-system/tokens/record';
import { Plus } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { PHONE_CARD_FACE } from '@/design-system/tokens/phone-card';

/**
 * The buyer-note slot on a record's band 1, beside the state code
 * — the left-side priority anchor (owner 2026-09-24). Shared by the desk
 */
export function RecordNoteSlot({ note, empty = 'blank' }: { note: string | null; empty?: 'blank' | 'add' }) {
  return (
    <span className={RECORD_NOTE_SLOT_CLASS} data-testid="record-note-slot">
      {note ? (
        <span className={RECORD_NOTE_BADGE_CLASS} data-testid="record-note-badge" title={note}>
          <span aria-hidden>Note</span>
          <span className="sr-only">Buyer note: {note}</span>
        </span>
      ) : empty === 'add' ? (
        <span className={RECORD_NOTE_ADD_CLASS} data-testid="record-note-add" aria-hidden>
          <Plus className="h-2.5 w-2.5 shrink-0" />
          Note
        </span>
      ) : null}
    </span>
  );
}

/** The full buyer note at the TOP of an opened record (desk evidence column, phone evidence sheet) — under the state strip, above the… */
export function BuyerNoteBlock({ note, className }: { note: string | null; className?: string }) {
  if (!note) return null;
  return (
    <section
      aria-label="Buyer note"
      data-testid="buyer-note-block"
      // A phone card inset in the column, not a full-width band (operator 2026-10-08).
      className={cn('my-2 flex gap-3 border border-mode-warn bg-mode-panel px-4 py-3', PHONE_CARD_FACE, className)}
    >
      <span className={cn(RECORD_NOTE_SLOT_CLASS, 'self-start')}>
        <span className={RECORD_NOTE_BADGE_CLASS} aria-hidden>
          Note
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Buyer note · read before packing</p>
        <p className="whitespace-pre-wrap break-words text-role-body font-bold text-mode-warn">{note}</p>
      </div>
    </section>
  );
}
