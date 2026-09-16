'use client';

/**
 * Daily — the phone face of the shift checklist (`/m/home`).
 *
 * THE MOBILE SoT for the check verb (SURFACE_LAW: every operator verb is
 * completable on `/m` first). The desk at `/` consumes the same data through
 * the slot table; this surface is the one a floor staffer actually runs.
 *
 * **Cards + BottomSheet, never a DataTable** (SURFACE_LAW §5, and the
 * `BottomSheet` contract says so in as many words): a compound row's five
 * tracks do not fit a phone, so {@link MobileDailyRow} carries the three facts
 * a tick needs — the check, the title, the id — and everything else lives
 * one tap deeper in {@link MobileDailyDetailSheet}.
 *
 * ONE JOB: today's list for the signed-in staffer. Marks are keyed
 * (item, staff, day) in `daily_check_marks`, so ticking here is an attestation
 * by whoever is signed in — never a shared org toggle. Ticking is optimistic
 * (`useToggleCheck`): at a bench the operator taps and looks away.
 *
 * SECTIONS mirror the desk's authored order: the recurring shift list first,
 * then a "Today only" band when any one-off is in effect — the exception is
 * marked, and only the exception.
 *
 * Boundary: this file imports only the platform layer (`components/ui`,
 * `Icons`, `components/identity`) plus `src/design-system` and logic
 * (`lib/daily-checks`, `contexts`, `utils`). No desktop feature component.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { IconButton } from '@/design-system/primitives/IconButton';
import { elevationClass } from '@/design-system/tokens/shadows';
import { Plus } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { getCurrentPSTDateKey } from '@/utils/date';
import { useAuth } from '@/contexts/AuthContext';
import {
  dailyComposerCreateBody,
  dailyComposerError,
  dailyComposerLinkInputs,
  newDailyComposerDraft,
  type DailyComposerDraft,
} from '@/lib/daily-checks/composer';
import { attachDailyCheckLinks } from '@/lib/daily-checks/use-daily-check-links';
import {
  useDailyChecks,
  useItemActions,
  useToggleCheck,
} from '@/lib/daily-checks/use-daily-checks';
import { MobileDailyRow } from './MobileDailyRow';
import { MobileDailyDetailSheet } from './MobileDailySheets';
import { MobileDailyComposerSheet } from './MobileDailyComposerSheet';

type MobileDailyStatus = 'all' | 'open' | 'done';

/**
 * Small mode switch = `TabSwitch` segmented (SURFACE_LAW §6 — not path chips,
 * not desk underline tabs). `all` leads and is the default, because a checked
 * item must stay visible after the tick (operator ruling 2026-09-14) — the
 * same law the desk's filter menu follows.
 */
const STATUS_TABS: readonly { id: MobileDailyStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
];

const EMPTY_COPY: Readonly<Record<MobileDailyStatus, string>> = {
  all: 'No tasks on the checklist yet.',
  open: 'Everything on the list is checked off.',
  done: 'Nothing checked off yet today.',
};

export function MobileDailyChecklist() {
  const router = useRouter();
  const { has } = useAuth();
  /** The LIST is org-managed; the items route gates on the same permission. */
  const canManage = has('admin.manage_staff');
  /**
   * The helpdesk read/write routes gate on this, so the DOOR does too: a
   * staffer without it keeps the ticket MARK (recognition) and never reaches a
   * thread whose every request would 403.
   */
  const canOpenTickets = has('integrations.zendesk');

  const dateKey = getCurrentPSTDateKey();
  const { data, isLoading, isError } = useDailyChecks(dateKey);
  const toggle = useToggleCheck(dateKey);
  const { addItem, updateItem, retireItem } = useItemActions(dateKey);

  const [status, setStatus] = useState<MobileDailyStatus>('all');
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<DailyComposerDraft>(newDailyComposerDraft);

  const doneSet = useMemo(() => new Set(data?.mine.doneItemIds ?? []), [data?.mine.doneItemIds]);

  /** Authored order (`sortOrder`) — the org wrote the list in a sequence. */
  const byAuthored = useMemo(
    () =>
      [...(data?.items ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
      ),
    [data?.items],
  );

  const passesFilter = useCallback(
    (id: number) =>
      status === 'all' || (status === 'open' ? !doneSet.has(id) : doneSet.has(id)),
    [status, doneSet],
  );

  // Recurring first, one-offs under their band — the same order the desk's
  // authored branch keeps, so both faces answer "what does the shift owe"
  // before "what is exceptional today".
  const recurring = byAuthored.filter((i) => i.kind !== 'once' && passesFilter(i.id));
  const onceItems = byAuthored.filter((i) => i.kind === 'once' && passesFilter(i.id));

  const openItem = useMemo(
    () => data?.items.find((i) => i.id === openItemId) ?? null,
    [data?.items, openItemId],
  );

  /**
   * Two-phase commit, same semantics as the desk: create, then attach. On a
   * link failure the ITEM stands, the sheet STAYS OPEN, and the draft keeps
   * its links with the title cleared — one paste away, not a retyping.
   */
  const submitDraft = useCallback(() => {
    if (dailyComposerError(draft)) return;
    const parsed = dailyComposerLinkInputs(draft);
    if (!parsed.ok) return;
    addItem.mutate(dailyComposerCreateBody(draft), {
      onSuccess: async (item) => {
        let attached = true;
        if (parsed.links.length > 0) {
          try {
            await attachDailyCheckLinks(item.id, parsed.links);
          } catch (error: unknown) {
            attached = false;
            const message = error instanceof Error ? error.message : String(error);
            console.error('[daily-checks] link attach failed after create:', message);
          }
        }
        setDraft(attached ? newDailyComposerDraft() : { ...draft, title: '' });
        if (attached) setComposerOpen(false);
      },
    });
  }, [addItem, draft]);

  const mine = data?.mine;

  const renderRow = (item: (typeof recurring)[number]) => (
    <MobileDailyRow
      key={item.id}
      itemId={item.id}
      title={item.title}
      done={doneSet.has(item.id)}
      once={item.kind === 'once'}
      ticketId={item.ticketId}
      owner={
        item.assignedStaffId != null && item.assignedStaffName
          ? { staffId: item.assignedStaffId, name: item.assignedStaffName }
          : null
      }
      onToggle={(next) => toggle.mutate({ itemId: item.id, checked: next })}
      onOpenDetail={() => setOpenItemId(item.id)}
      // The row's ticket glyph is the door to `/m/t/[ticketId]` — the phone's
      // thread + reply surface. The HOST owns the router so the row stays a
      // presentational leaf its render test can mount without a navigation
      // context, and owns the permission so the row never reads one.
      onOpenTicket={
        canOpenTickets && item.ticketId != null
          ? () => router.push(`/m/t/${item.ticketId}`)
          : undefined
      }
    />
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* `pb-28` clears the sticky CTA — the last row must stay tappable. */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-3">
        <div className="flex items-baseline justify-between gap-3 pb-3">
          <p className="text-role-caption font-semibold text-text-default">
            {mine ? `${mine.doneCount} of ${mine.total} checked` : 'Today'}
          </p>
          <p className="text-role-micro tabular-nums text-text-faint">{dateKey}</p>
        </div>

        <TabSwitch
          tabs={STATUS_TABS.map((t) => ({ id: t.id, label: t.label }))}
          activeTab={status}
          onTabChange={(id) => setStatus(id as MobileDailyStatus)}
        />

        <ul className="flex flex-col gap-2 pt-3">{recurring.map(renderRow)}</ul>

        {onceItems.length > 0 ? (
          <>
            <p className="pb-2 pt-5 text-role-micro font-semibold uppercase tracking-wide text-text-muted">
              Today only
            </p>
            <ul className="flex flex-col gap-2">{onceItems.map(renderRow)}</ul>
          </>
        ) : null}

        {isLoading ? (
          <p className="pt-6 text-role-caption text-text-muted">Loading the checklist…</p>
        ) : null}
        {isError ? (
          <p role="alert" className="pt-6 text-role-caption text-text-muted">
            Could not load the checklist.
          </p>
        ) : null}
        {!isLoading && !isError && recurring.length === 0 && onceItems.length === 0 ? (
          <p className="pt-6 text-role-caption text-text-muted">{EMPTY_COPY[status]}</p>
        ) : null}
      </div>

      {/*
       * ONE primary CTA (SURFACE_LAW §5) — a circular icon-only FAB in the
       * bottom-right thumb zone (operator ruling 2026-09-15: "just a plus
       * button at the very bottom right corner"), so the checklist owns the
       * middle of the screen instead of a full-width bar.
       *
       * `absolute`, not `fixed`: the shell above is `relative`, and on a wide
       * viewport `/m` renders as a phone COLUMN inside thick gutters — a fixed
       * FAB would fly out to the browser's corner, away from the surface it
       * belongs to. `pb-28` on the scroller is the matching clearance.
       *
       * `IconButton size="touch"` is the primitive for an icon-only action:
       * 44px box (iOS HIG floor) + focus ring + press feedback declared once.
       * `radius="pill"` is what makes it a circle; the accent fill and the
       * inverse ink are semantic tokens at the call site, the sanctioned way
       * to wash this primitive. `aria-label` is the ONLY name it has now that
       * the visible label is gone.
       */}
      {canManage ? (
        <IconButton
          onClick={() => setComposerOpen(true)}
          ariaLabel="Add task"
          size="touch"
          radius="pill"
          icon={<Plus aria-hidden className="h-5 w-5" />}
          className={cn(
            'absolute bottom-4 right-4 z-fab',
            'bg-accent-bg text-text-inverse hover:bg-accent-hover hover:text-text-inverse',
            elevationClass('raised'),
          )}
        />
      ) : null}

      <MobileDailyDetailSheet
        item={openItem}
        report={data}
        canManage={canManage}
        saving={updateItem.isPending}
        saveError={updateItem.error?.message ?? null}
        removing={retireItem.isPending}
        // Both verbs CLOSE the sheet on success. The operator came from a row
        // and the answer to "did it take?" is that row repainting — leaving
        // them in a sheet to verify it would be one dismissal too many.
        onSave={(title) => {
          if (openItemId == null) return;
          updateItem.mutate(
            { itemId: openItemId, title },
            { onSuccess: () => setOpenItemId(null) },
          );
        }}
        onRemove={() => {
          if (openItemId == null) return;
          retireItem.mutate(openItemId, { onSuccess: () => setOpenItemId(null) });
        }}
        onClose={() => setOpenItemId(null)}
      />
      <MobileDailyComposerSheet
        open={composerOpen}
        draft={draft}
        pending={addItem.isPending}
        error={addItem.error?.message ?? null}
        onDraftChange={setDraft}
        onSubmit={submitDraft}
        onClose={() => setComposerOpen(false)}
      />
    </div>
  );
}
