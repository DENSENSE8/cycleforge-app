'use client';

/**
 * The add-a-task composer — the PHONE mount of the one shared form
 * (`lib/daily-checks/composer`). The desk's `DailyComposerRow` is the other
 * mount: same fields, same order, same validation; if these drift, the form
 * has forked.
 *
 * A `BottomSheet` because on a phone the sheet IS the form surface (never a
 * desk dialog). PROGRESSIVE (operator ruling 2026-09-15): what is visible on
 * open is only what a capture needs —
 *
 *  - the SUBJECT switcher (Task | Ticket), which decides what the one field
 *    below means. Two faces because they are different rows: a named shift job
 *    keeps its typed title, while a ticket row's identity is the LINK, so every
 *    tick on ticket 48120 joins one row in the manager's daily report instead
 *    of scattering across near-duplicate titles;
 *  - that one field — a title on the Task face, a ticket number on the Ticket
 *    face (numeric keypad, derived `Ticket #N` title);
 *  - {@link MobileDailyTicketSlider} on the Ticket face only, filtered live by
 *    what is typed, so the thumb can swipe to the right ticket. Linking must
 *    not cost a trip into "more options" — it is the verb the operator asked
 *    for by name.
 *
 * NO GLYPH PICKER (same ruling — "it wouldn't even have icons"). The phone
 * writes a plain title; the desk keeps its palette.
 *
 * The field leaves live in `./MobileDailyComposerFields`; this file is the
 * shell (state, disclosure, submit).
 */

import { Button, TextField } from '@/design-system/primitives';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  DAILY_COMPOSER_SUBJECT,
  dailyComposerError,
  setComposerSubject,
  type DailyComposerDraft,
  type DailyComposerSubject,
} from '@/lib/daily-checks/composer';
import { OwnerStep, TITLE_INPUT_CLASS } from './MobileDailyComposerFields';
import { MobileDailyTicketSlider } from './MobileDailyTicketSlider';

const SUBJECT_TABS = DAILY_COMPOSER_SUBJECT.map(({ id, label }) => ({ id, label }));

export function MobileDailyComposerSheet({
  open,
  draft,
  pending,
  error,
  onDraftChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  draft: DailyComposerDraft;
  pending: boolean;
  error?: string | null;
  onDraftChange: (next: DailyComposerDraft) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const patch = (part: Partial<DailyComposerDraft>) => onDraftChange({ ...draft, ...part });
  const ticketFace = draft.subject === 'ticket';
  const canSubmit = !dailyComposerError(draft) && !pending;

  return (
    // NO TITLE (operator 2026-09-15: "remove the add a task below the swipe
    // down pill"). The switcher immediately under the grab handle says what
    // this sheet is; a heading above it repeated the FAB the operator just
    // pressed.
    <BottomSheet open={open} onClose={onClose} forceVariant="sheet" compact>
      <div className="flex flex-col gap-3 px-1 pb-2 pt-1">
        {/*
         * The switcher decides what the ONE field below means (operator
         * 2026-09-15). Two faces, because a named shift job and a ticket are
         * different rows: Task keeps the typed words as the title; Ticket makes
         * the link the row's identity so every tick on 48120 joins one row in
         * the manager's report. Declared intent, not a guess from the text.
         */}
        <TabSwitch
          tabs={SUBJECT_TABS}
          activeTab={draft.subject}
          onTabChange={(id) => onDraftChange(setComposerSubject(draft, id as DailyComposerSubject))}
        />

        {/*
         * The slider sits ABOVE the field (operator 2026-09-15: *"the ticket
         * icon horizontal slider to be above the text entry field … so it
         * displays as an active filtering display"*). Typing narrows the row
         * the thumb is already resting on, and the chips stay out from under
         * the on-screen keyboard — a picker below the field would be the first
         * thing the keyboard covers. Ticket face only: it IS that face's picker.
         */}
        {ticketFace ? (
          <MobileDailyTicketSlider
            query={draft.title}
            selected={draft.ticketId}
            onSelect={(ticketId) => patch({ ticketId })}
          />
        ) : null}

        <input
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder={ticketFace ? 'Ticket number…' : 'What needs doing?'}
          aria-label={ticketFace ? 'Ticket number' : 'New daily task'}
          inputMode={ticketFace ? 'numeric' : undefined}
          autoFocus
          className={TITLE_INPUT_CLASS}
        />

        <TextField
          label="Description (optional)"
          multiline
          rows={3}
          value={draft.description}
          onChange={(description) => patch({ description })}
          maxLength={2000}
        />

        {draft.kind === 'once' ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-role-micro uppercase tracking-wide text-text-faint">Assign to</p>
            <OwnerStep
              selectedStaffId={draft.ownerId}
              onPick={(member) =>
                patch({
                  ownerId: member?.id ?? null,
                  ownerName: member?.name ?? null,
                })
              }
            />
          </div>
        ) : null}

        {/*
         * Description belongs to the item and follows its title, so it is
         * available to the next shift without adding a note to a single day's
         * attestation. One-offs can additionally name a staffer; recurring
         * work remains shift-wide. Non-ticket links remain out of this compact
         * phone capture: Task → every day, Ticket → just today.
         *
         * A SERVER failure still speaks — that is news the operator cannot
         * infer from a disabled button.
         */}
        {error ? (
          <p role="alert" className="text-role-micro text-text-muted">
            {error}
          </p>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          className="min-h-12"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          {pending ? 'Adding…' : 'Add task'}
        </Button>
      </div>
    </BottomSheet>
  );
}
