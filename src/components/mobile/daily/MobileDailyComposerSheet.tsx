'use client';

/**
 * The add-a-task composer — the PHONE mount of the one shared form (`lib/daily-checks/composer`).
 * desk dialog). PROGRESSIVE (operator ruling 2026-09-15): what is visible on
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
    // NO TITLE (operator 2026-09-15:
    // NO TITLE (operator 2026-09-15: "remove the add a task below the swipe
    <BottomSheet open={open} onClose={onClose} forceVariant="sheet" compact>
      <div className="flex flex-col gap-3 px-1 pb-2 pt-1">
        {/* The switcher decides what the ONE field below means (operator 2026-09-15). */}
        <TabSwitch
          tabs={SUBJECT_TABS}
          activeTab={draft.subject}
          onTabChange={(id) => onDraftChange(setComposerSubject(draft, id as DailyComposerSubject))}
        />

        {/*
 * The slider sits ABOVE the field (operator 2026-09-15:
 * The slider sits ABOVE the field (operator 2026-09-15: *"the ticket
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
            <p className="text-role-micro text-text-faint">Assign to</p>
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

        {/* Description belongs to the item and follows its title, so it is available to the next shift without adding a note to a single day's… */}
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
