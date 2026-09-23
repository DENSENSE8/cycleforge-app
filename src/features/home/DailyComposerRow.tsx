'use client';

/**
 * Add-a-task composer, docked BELOW the Daily grid.
 *
 * Outside the grid on purpose: a composer is not a row. Rendering it as one
 * would put a text input inside a virtualized list whose rows recycle, and it
 * would have to answer every column the model declares — a blank Status, a
 * blank Team — which reads as a real task that nobody has done yet.
 *
 * ONE VOCABULARY, TWO MOUNTS (the phone's `MobileDailyComposerSheet` is the
 * other): field order, labels, palette and validation all come from
 * `lib/daily-checks/composer`. If a fact of this form is not in that module,
 * the mounts have drifted — and a drifted form is a fork.
 *
 * PROGRESSIVE (operator ruling 2026-09-15): only the Title is required and
 * visible on open — the shift default needs one line and Enter. Everything
 * else (glyph, cadence, owner, links) sits behind one disclosure, because the
 * exception path is the one that carries them: "Just today" is the exception,
 * and only the exception is marked.
 */

import { useMemo, useRef, useState, type Ref } from 'react';
import { ChevronDown, Plus } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import { Button, TextField } from '@/design-system/primitives';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  DAILY_COMPOSER_CADENCE,
  DAILY_COMPOSER_SUBJECT,
  DAILY_GLYPH_PALETTE,
  dailyComposerError,
  readGlyphRecents,
  rememberGlyph,
  setComposerSubject,
  type DailyComposerDraft,
  type DailyComposerSubject,
} from '@/lib/daily-checks/composer';

const CADENCE_TABS = DAILY_COMPOSER_CADENCE.map(({ id, label }) => ({ id, label }));
const SUBJECT_TABS = DAILY_COMPOSER_SUBJECT.map(({ id, label }) => ({ id, label }));

function GlyphGrid({
  value,
  recents,
  onPick,
  onClear,
}: {
  value: string | null;
  recents: readonly string[];
  onPick: (glyph: string) => void;
  onClear: () => void;
}) {
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...recents, ...DAILY_GLYPH_PALETTE].filter((g) => {
      if (seen.has(g)) return false;
      seen.add(g);
      return true;
    });
    return merged;
  }, [recents]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {rows.map((glyph) => (
          <button
            key={glyph}
            type="button"
            onClick={() => (value === glyph ? onClear() : onPick(glyph))}
            aria-label={`Glyph ${glyph}${value === glyph ? ' — selected, pick again to clear' : ''}`}
            aria-pressed={value === glyph}
            className={cn(
              'flex size-8 items-center justify-center text-base leading-none',
              cornerClass('field'),
              'border border-border-hairline bg-surface-card',
              value === glyph && 'border-border-strong bg-surface-sunken',
              focusRing('control', 'accent'),
            )}
          >
            {glyph}
          </button>
        ))}
      </div>
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="self-start text-role-micro text-text-muted hover:text-text-default"
        >
          Remove glyph
        </button>
      ) : null}
    </div>
  );
}

function LinkFields({
  draft,
  onChange,
}: {
  draft: DailyComposerDraft;
  onChange: (patch: Partial<DailyComposerDraft>) => void;
}) {
  const field = 'min-w-0 flex-1 border border-border-hairline bg-surface-card px-2 py-1.5 text-role-caption text-text-default placeholder:text-text-faint';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex w-24 shrink-0 items-center gap-1.5 text-role-micro text-text-muted">
        <Plus aria-hidden className="h-3 w-3 rotate-45" />
        Link to…
      </label>
      <input
        value={draft.ticketId}
        onChange={(e) => onChange({ ticketId: e.target.value })}
        placeholder="Ticket #"
        inputMode="numeric"
        aria-label="Link a Zendesk ticket"
        className={cn(field, cornerClass('field'), focusRing('field', 'accent'))}
        style={{ flexBasis: '7rem' }}
      />
      <input
        value={draft.workOrderId}
        onChange={(e) => onChange({ workOrderId: e.target.value })}
        placeholder="Work order #"
        inputMode="numeric"
        aria-label="Link a work order"
        className={cn(field, cornerClass('field'), focusRing('field', 'accent'))}
        style={{ flexBasis: '8rem' }}
      />
      <input
        value={draft.tracking}
        onChange={(e) => onChange({ tracking: e.target.value })}
        placeholder="Tracking"
        aria-label="Link a tracking number"
        className={cn(field, cornerClass('field'), focusRing('field', 'accent'))}
        style={{ flexBasis: '10rem' }}
      />
    </div>
  );
}

export function DailyComposerRow({
  draft,
  onDraftChange,
  onSubmit,
  pending,
  error,
  inputRef,
}: {
  draft: DailyComposerDraft;
  onDraftChange: (next: DailyComposerDraft) => void;
  onSubmit: () => void;
  pending: boolean;
  /** Server-side failure text (addItem.error) — painted under the fields. */
  error?: string | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const ownerRef = useRef<HTMLButtonElement>(null);
  const [ownerOpen, setOwnerOpen] = useState(false);

  const patch = (part: Partial<DailyComposerDraft>) => onDraftChange({ ...draft, ...part });
  const ticketFace = draft.subject === 'ticket';
  const liveError = dailyComposerError(draft);
  const canSubmit = !liveError && !pending;

  const pickGlyph = (glyph: string) => {
    patch({ glyph });
    setRecents(rememberGlyph(glyph));
  };

  return (
    <div className="flex shrink-0 flex-col border-b border-border-hairline bg-surface-card">
      {/*
       * The SAME switcher the phone sheet mounts (`DAILY_COMPOSER_SUBJECT`):
       * Task keeps the typed words as the title; Ticket makes the link the
       * row's identity so every tick on one ticket joins one row in the daily
       * report. Both mounts read one vocabulary — if they drift, the form forked.
       */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <TabSwitch
          tabs={SUBJECT_TABS}
          activeTab={draft.subject}
          onTabChange={(id) => onDraftChange(setComposerSubject(draft, id as DailyComposerSubject))}
        />
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <Plus className="h-3.5 w-3.5 shrink-0 text-text-soft" aria-hidden />
        <input
          ref={inputRef}
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
          className={cn(
            'min-w-0 flex-1 bg-transparent px-1 py-1 text-role-data text-text-default',
            'placeholder:text-text-faint',
            focusRing('field', 'accent'),
          )}
        />
        <Button variant="secondary" size="sm" disabled={!canSubmit} onClick={onSubmit}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </div>

      <button
        type="button"
        onClick={() => {
          // Hydrate stored recents on first expand — the palette leads with
          // them, and they only change through picks.
          setRecents(readGlyphRecents());
          setExpanded((next) => !next);
        }}
        aria-expanded={expanded}
        className={cn(
          'flex items-center gap-1.5 px-3 pb-2 text-role-micro text-text-muted hover:text-text-default',
          focusRing('control'),
        )}
      >
        <ChevronDown
          aria-hidden
          className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
        />
        {expanded ? 'Fewer options' : 'Details, glyph, cadence, owner & links'}
      </button>

      {expanded ? (
        <div className="flex flex-col gap-3 px-3 pb-3">
          <TextField
            label="Description (optional)"
            multiline
            rows={3}
            value={draft.description}
            onChange={(description) => patch({ description })}
            maxLength={2000}
          />

          <div className="flex flex-col gap-1.5">
            <p className="text-role-micro uppercase tracking-wide text-text-faint">Glyph</p>
            <GlyphGrid
              value={draft.glyph}
              recents={recents}
              onPick={pickGlyph}
              onClear={() => patch({ glyph: null })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-role-micro uppercase tracking-wide text-text-faint">Cadence</p>
            <TabSwitch
              tabs={CADENCE_TABS}
              activeTab={draft.kind}
              onTabChange={(id) =>
                patch(
                  id === 'once'
                    ? { kind: 'once' }
                    : { kind: 'recurring', ownerId: null, ownerName: null },
                )
              }
            />
          </div>

          {draft.kind === 'once' ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-role-micro uppercase tracking-wide text-text-faint">Owner</p>
              <button
                ref={ownerRef}
                type="button"
                onClick={() => setOwnerOpen((next) => !next)}
                className={cn(
                  'flex min-h-9 w-fit items-center gap-2 border border-border-hairline bg-surface-card px-2.5 py-1.5 text-role-caption text-text-default',
                  cornerClass('field'),
                  focusRing('control', 'accent'),
                )}
              >
                {draft.ownerId != null ? (
                  <>
                    <StaffAvatar staffId={draft.ownerId} name={draft.ownerName} size="xs" alt="" />
                    <span>{draft.ownerName ?? 'Owner'}</span>
                  </>
                ) : (
                  <span className="text-text-muted">Whole shift</span>
                )}
              </button>
              <StageStaffAssignPopover
                open={ownerOpen}
                onClose={() => setOwnerOpen(false)}
                anchorRef={ownerRef}
                label="today's one-off"
                role="all"
                selectedStaffId={draft.ownerId}
                onCommit={(staffId, staffName) =>
                  patch({ ownerId: staffId, ownerName: staffName })
                }
              />
            </div>
          ) : null}

          <LinkFields draft={draft} onChange={patch} />

          {liveError ? (
            <p role="alert" className="text-role-micro text-text-muted">
              {liveError}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-role-micro text-text-muted">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
