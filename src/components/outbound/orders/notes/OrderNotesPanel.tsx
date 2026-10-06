'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Pin } from '@/components/Icons';
import { StaffMentionListbox, useStaffMentionField } from '@/components/mentions/StaffMentionField';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS, RECORD_RECESS_CLASS } from '@/design-system/tokens/record';
import { useOrderChannel } from '@/hooks/useCatalog';
import { useAppendOrderNote, useOrderNotes } from '@/hooks/useOrderNotes';
import { decodeNoteMentions, encodeNoteMentions, splitNoteMentions } from '@/lib/orders/note-mentions';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { timeAgo } from '@/utils/_date';
import { useOrderNoteFocus } from './order-note-focus';

/**
 * The record's Notes group: pinned buyer note first, then the internal-note
 * composer (autosave, `@` mentions), then earlier notes folded behind a
 * disclosure. Mentions are stored as `@[Name](staff:ID)` tokens
 * (`@/lib/orders/note-mentions`); the composer edits the `@Name` face and
 * re-encodes the picks on save.
 */
export function OrderNotesPanel({
  orderId,
  buyerNote,
  accountSource,
  latestNote,
  showBuyerNote,
  showNote,
}: {
  orderId: number;
  buyerNote: string | null;
  accountSource: string | null;
  latestNote: string | null;
  showBuyerNote: boolean;
  showNote: boolean;
}) {
  const buyer = buyerNote?.trim() || null;
  return (
    <div className="flex w-full flex-col gap-2" data-testid="order-notes-panel">
      {showBuyerNote && buyer ? (
        <PinnedBuyerNote orderId={orderId} note={buyer} accountSource={accountSource} />
      ) : null}
      {showNote ? (
        <>
          <NoteComposer key={orderId} orderId={orderId} latestNote={latestNote} />
          <EarlierNotes orderId={orderId} />
        </>
      ) : null}
    </div>
  );
}

function PinnedBuyerNote({
  orderId,
  note,
  accountSource,
}: {
  orderId: number;
  note: string;
  accountSource: string | null;
}) {
  const channel = useOrderChannel()(String(orderId), accountSource);
  const platform = channel.label || 'Buyer';
  return (
    <section
      aria-label="Buyer note"
      data-testid="buyer-note-block"
      className="flex gap-2 rounded-mode-control border border-mode-fact border-l-4 border-l-mode-warn bg-mode-panel px-2.5 py-2"
    >
      <HoverTooltip label={`${platform} buyer note`} asChild placement="above">
        <span className="mt-1.5 inline-flex shrink-0" aria-label={`${platform} buyer note`}>
          <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} className="h-2 w-2" />
        </span>
      </HoverTooltip>
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-role-body font-bold text-mode-warn">{note}</p>
      <HoverTooltip label="Pinned — read before packing" asChild placement="above">
        <span className="shrink-0 text-mode-warn" aria-label="Pinned">
          <Pin className="h-3.5 w-3.5" />
        </span>
      </HoverTooltip>
    </section>
  );
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
const STATUS_FACE: Readonly<Record<SaveStatus, string>> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
};

function NoteComposer({ orderId, latestNote }: { orderId: number; latestNote: string | null }) {
  const seeded = useMemo(() => decodeNoteMentions(latestNote ?? ''), [latestNote]);
  const [draft, setDraft] = useState(seeded.display);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(seeded.display);
  const committedRef = useRef((latestNote ?? '').trim());
  const { mutateAsync } = useAppendOrderNote(orderId);
  const statusId = useId();
  const mentions = useStaffMentionField({
    areaRef,
    textRef: draftRef,
    onText: useCallback((next: string) => {
      draftRef.current = next;
      setDraft(next);
    }, []),
    initialPicked: seeded.picked,
  });
  const { pickedRef, reset: resetPicked } = mentions;

  // A refreshed note face lands while idle; never under the caret.
  useEffect(() => {
    committedRef.current = (latestNote ?? '').trim();
    if (document.activeElement === areaRef.current) return;
    draftRef.current = seeded.display;
    resetPicked(seeded.picked);
    setDraft(seeded.display);
  }, [latestNote, seeded, resetPicked]);

  useOrderNoteFocus(
    orderId,
    useCallback(() => {
      const area = areaRef.current;
      if (!area) return;
      area.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    }, []),
  );

  const commit = useCallback(() => {
    const next = encodeNoteMentions(draftRef.current, pickedRef.current).trim();
    const previous = committedRef.current;
    if (!next || next === previous) return;
    committedRef.current = next;
    setStatus('saving');
    mutateAsync(next).then(
      () => setStatus('saved'),
      () => {
        committedRef.current = previous;
        setStatus('error');
        toast.error('Could not save the note');
      },
    );
  }, [mutateAsync, pickedRef]);

  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);
  useEffect(() => () => commitRef.current(), []);

  return (
    <div className="relative flex w-full flex-col gap-1">
      {/* ds-raw-button: the @mention combobox needs native caret/selection control on the textarea */}
      <textarea
        ref={areaRef}
        value={draft}
        onChange={(event) => {
          draftRef.current = event.target.value;
          setDraft(event.target.value);
          if (status !== 'saving') setStatus('idle');
          mentions.sync(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onSelect={(event) => mentions.onSelect(event.currentTarget)}
        onBlur={() => {
          mentions.dismiss();
          commit();
        }}
        onKeyDown={(event) => {
          if (mentions.onKeyDown(event)) return;
          if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            commit();
            areaRef.current?.blur();
          }
        }}
        rows={2}
        placeholder="Add a note"
        aria-label="Order note"
        aria-describedby={statusId}
        {...mentions.ariaProps}
        data-testid="order-note-composer"
        className={cn(
          'block min-h-mode-hit w-full resize-y rounded-mode-control bg-mode-well p-1.5 text-role-caption text-mode-ink',
          RECORD_RECESS_CLASS,
          focusRing('field'),
        )}
      />
      <StaffMentionListbox field={mentions} className="absolute left-0 top-full mt-1" />
      <span
        id={statusId}
        aria-live="polite"
        className={cn(RECORD_LABEL_CLASS, status === 'error' ? 'text-mode-warn' : 'text-mode-muted')}
      >
        {STATUS_FACE[status]}
      </span>
    </div>
  );
}

/** Note body with `@[Name](staff:ID)` tokens painted as `@Name` chips. */
function NoteText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-role-caption text-mode-ink">
      {splitNoteMentions(text).map((seg, i) =>
        seg.kind === 'text' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <span
            key={i}
            data-staff-id={seg.staffId}
            className="mx-px inline-flex items-center rounded-mode-control bg-mode-well px-1 font-semibold text-mode-ink"
          >
            @{seg.name}
          </span>
        ),
      )}
    </p>
  );
}

/** Every note but the newest (the composer already shows that one), folded by default. */
function EarlierNotes({ orderId }: { orderId: number }) {
  const { data } = useOrderNotes(orderId);
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const earlier = (data ?? []).slice(1);
  if (earlier.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'ds-raw-button inline-flex items-center gap-1 self-start rounded-mode-control px-1 text-mode-muted hover:text-mode-ink',
          RECORD_LABEL_CLASS,
          focusRing('control'),
        )}
      >
        {earlier.length} earlier
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <ol id={bodyId} className="flex flex-col divide-y divide-mode-divide border-l border-mode-divide pl-2">
          {earlier.map((n) => (
            <li key={n.id} className="flex flex-col gap-0.5 py-1.5">
              <NoteText text={n.noteText} />
              <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
                {n.authorName ?? 'Unknown'} · <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>{timeAgo(n.createdAt)}</time>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
