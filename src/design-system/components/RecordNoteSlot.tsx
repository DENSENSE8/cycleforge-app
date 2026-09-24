import {
  RECORD_LABEL_CLASS,
  RECORD_NOTE_BADGE_CLASS,
  RECORD_NOTE_SLOT_CLASS,
} from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';

/**
 * The buyer-note slot on an industrial record's band 1, beside the state code
 * — the left-side priority anchor (owner 2026-09-24). Shared by the desk
 * ledger and the phone record so both wear one face.
 *
 * Rigid on every record: a noted order fills it with the amber `NOTE` badge,
 * an un-noted one keeps it empty at the same width. The badge carries no text
 * of the note — the row is not where it is read; the evidence column / sheet
 * leads with it, and packing is held until it is acknowledged.
 */
export function RecordNoteSlot({ note }: { note: string | null }) {
  return (
    <span className={RECORD_NOTE_SLOT_CLASS} data-testid="record-note-slot">
      {note ? (
        <span className={RECORD_NOTE_BADGE_CLASS} data-testid="record-note-badge" title={note}>
          <span aria-hidden>NOTE</span>
          <span className="sr-only">Buyer note: {note}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * The full buyer note at the TOP of an opened record (desk evidence column,
 * phone evidence sheet) — under the state strip, above the photo, so it is
 * read before the item is pulled. Left-anchored like the row badge: a 4px
 * warn-ink bar on the left edge, the `NOTE` badge, then the text in the warn
 * ink. Renders nothing when the order carries no buyer note.
 */
export function BuyerNoteBlock({ note, className }: { note: string | null; className?: string }) {
  if (!note) return null;
  return (
    <section
      aria-label="Buyer note"
      data-testid="buyer-note-block"
      className={cn('flex gap-3 border-b border-mode-ink border-l-4 border-l-mode-warn bg-mode-panel px-3 py-2.5', className)}
    >
      <span className={cn(RECORD_NOTE_SLOT_CLASS, 'self-start')}>
        <span className={RECORD_NOTE_BADGE_CLASS} aria-hidden>
          NOTE
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Buyer note · read before packing</p>
        <p className="whitespace-pre-wrap break-words text-role-body font-bold text-mode-warn">{note}</p>
      </div>
    </section>
  );
}
