'use client';

/**
 * The Support record's ONE status control — top-right in the record header
 * (owner 2026-10-04: "Remove the status button bottom left. It's already top
 * right"). The face is the item's LOCAL status (New · Open · Pending ·
 * On-hold · Solved · Closed); the menu offers only the lifecycle steps valid
 * from where the item is:
 *
 *   open              → Waiting on customer · On-hold · Resolve
 *   waiting_customer  → On-hold · Reopen · Resolve
 *   snoozed           → Waiting on customer · Reopen · Resolve
 *   resolved          → Reopen
 *
 * Waiting on customer / On-hold / Reopen are `PATCH /api/support/items/[id]`
 * (`useSupportItemActions`); Resolve unfolds the guarded `SupportResolve`
 * flow under the verb. Every write settles the bundle and every Support list.
 * The menu opens on the status's own facts — who resolved it and why, how
 * long it is on hold, when it is followed up — said nowhere else on the
 * record. Bare `S` opens it (the desk binds the key).
 */

import { useRef } from 'react';
import { CheckCircle2, ChevronDown, CirclePause, Hourglass, RotateCcw } from 'lucide-react';
import { DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { Popover } from '@/design-system/primitives/Popover';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { SUPPORT_LOCAL_STATUS_LABEL, supportLocalStatus, type SupportItemView, type SupportLifecycle } from '@/lib/support/conversation/model';
import type { SupportListRow } from '@/lib/support/list/support-list';
import { supportResolveLabel } from '@/lib/support/record/support-record-model';
import { useSupportItem, useSupportItemActions } from '@/lib/support/record/use-support-item';
import { toast } from '@/lib/toast';
import { addDaysToDateKey, formatMonthDayTimePST, getCurrentPSTDateKey, warehouseCivilTimeToInstant } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { SupportResolve } from './record/SupportResolve';
import { SUPPORT_LOCAL_STATUS_TONE } from './support-face';

/** An on-hold item comes back the warehouse morning of the chosen day (the follow-up hour). */
const ON_HOLD_UNTIL_TIME = '09:00';
const ON_HOLD_PRESETS: ReadonlyArray<{ label: string; days: number }> = [
  { label: 'Until tomorrow', days: 1 },
  { label: 'For 3 days', days: 3 },
  { label: 'For a week', days: 7 },
];

/** The steps each lifecycle offers, in menu order. */
const STEPS: Readonly<Record<SupportLifecycle, ReadonlyArray<'waiting' | 'on-hold' | 'reopen' | 'resolve'>>> = {
  open: ['waiting', 'on-hold', 'resolve'],
  waiting_customer: ['on-hold', 'reopen', 'resolve'],
  snoozed: ['waiting', 'reopen', 'resolve'],
  resolved: ['reopen'],
};

/** The status's own facts, one line each: the resolution, the hold, the next follow-up. */
function statusFacts(item: SupportItemView, nowMs: number): { key: string; text: string; tone: 'muted' | 'danger' }[] {
  const facts: { key: string; text: string; tone: 'muted' | 'danger' }[] = [];
  const r = item.resolution;
  if (r) {
    const by = r.resolvedBy ? ` by ${r.resolvedBy.name}` : '';
    facts.push({ key: 'resolved', text: `Resolved${by} · ${formatMonthDayTimePST(r.resolvedAt)}${r.override ? ' · override' : ''}`, tone: 'muted' });
    if (r.reason) facts.push({ key: 'reason', text: r.reason, tone: 'muted' });
  }
  if (item.lifecycle === 'snoozed' && item.snoozedUntil) {
    facts.push({ key: 'hold', text: `On hold until ${formatMonthDayTimePST(item.snoozedUntil)}`, tone: 'muted' });
  }
  const followUp = item.lifecycle !== 'resolved' ? item.task?.nextFollowUpAt : null;
  if (followUp) {
    const due = Date.parse(followUp) <= nowMs;
    facts.push({ key: 'follow-up', text: `${due ? 'Follow-up due' : 'Follow up'} ${formatMonthDayTimePST(followUp)}`, tone: due ? 'danger' : 'muted' });
  }
  return facts;
}

export function SupportStatusVerb({
  itemId,
  row,
  nowMs,
  menuOpen,
  onMenuOpenChange,
  resolveOpen,
  onResolveOpenChange,
}: {
  itemId: number;
  /** The list row — paints the status at once, before the bundle is read. */
  row: SupportListRow | null;
  nowMs: number;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  /** The guarded resolve flow is unfolded under the verb. */
  resolveOpen: boolean;
  onResolveOpenChange: (open: boolean) => void;
}) {
  const { data } = useSupportItem(itemId);
  const item = data?.item ?? null;
  const fallback = row && row.itemId === itemId ? row : null;
  const { setNextStep, setLifecycle } = useSupportItemActions(itemId);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const status = item
    ? supportLocalStatus(
        {
          purpose: item.purpose,
          lifecycle: item.lifecycle,
          pendingInboundCount: item.pendingInboundCount,
          lastOutboundAt: item.lastOutboundAt,
          resolvedAt: item.resolution?.resolvedAt ?? null,
        },
        nowMs,
      )
    : (fallback?.status ?? null);
  const lifecycle = item?.lifecycle ?? fallback?.lifecycle ?? null;
  if (!status || !lifecycle) return null;

  const label = SUPPORT_LOCAL_STATUS_LABEL[status];
  const busy = setNextStep.isPending || setLifecycle.isPending;
  const fail = (error: Error) => toast.error(error.message);
  const onHoldUntil = (days: number) => warehouseCivilTimeToInstant(addDaysToDateKey(getCurrentPSTDateKey(), days), ON_HOLD_UNTIL_TIME)?.toISOString() ?? null;
  const facts = item ? statusFacts(item, nowMs) : [];

  return (
    <span ref={anchorRef} className="inline-flex">
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <DeskHeaderAction
            size="sm"
            variant="secondary"
            icon={<span aria-hidden className={cn('size-2 rounded-full', STATE_TONE_CLASSES[SUPPORT_LOCAL_STATUS_TONE[status]].dot)} />}
            label={label}
            shortcut="S"
            ariaLabel={`Status: ${label}`}
            loading={busy}
            data-testid="support-record-status"
            data-support-status={status}
          >
            <ChevronDown aria-hidden className="size-3.5 text-text-muted" />
          </DeskHeaderAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {facts.length > 0 ? (
            <>
              {facts.map((fact) => (
                <DropdownMenuLabel
                  key={fact.key}
                  className={cn('max-w-72 whitespace-normal font-normal text-role-caption', fact.tone === 'danger' ? 'text-text-danger' : 'text-text-muted')}
                  data-testid={`support-status-fact-${fact.key}`}
                >
                  {fact.text}
                </DropdownMenuLabel>
              ))}
              {STEPS[lifecycle].length > 0 ? <DropdownMenuSeparator /> : null}
            </>
          ) : null}
          {STEPS[lifecycle].map((step) => {
            if (step === 'waiting') {
              return (
                <DropdownMenuItem
                  key={step}
                  onSelect={() => setNextStep.mutate({ nextStep: 'waiting_customer', nextFollowUpAt: null }, { onError: fail })}
                  data-testid="support-status-waiting"
                >
                  <Hourglass aria-hidden />
                  Waiting on customer
                </DropdownMenuItem>
              );
            }
            if (step === 'on-hold') {
              return (
                <DropdownMenuSub key={step}>
                  <DropdownMenuSubTrigger data-testid="support-status-on-hold">
                    <CirclePause aria-hidden />
                    {SUPPORT_LOCAL_STATUS_LABEL.on_hold}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {ON_HOLD_PRESETS.map((preset) => (
                      <DropdownMenuItem
                        key={preset.days}
                        onSelect={() => {
                          const snoozedUntil = onHoldUntil(preset.days);
                          if (snoozedUntil) setLifecycle.mutate({ lifecycle: 'snoozed', snoozedUntil }, { onError: fail });
                        }}
                        data-testid={`support-status-on-hold-${preset.days}`}
                      >
                        {preset.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            }
            if (step === 'reopen') {
              return (
                <DropdownMenuItem key={step} onSelect={() => setLifecycle.mutate({ lifecycle: 'open' }, { onError: fail })} data-testid="support-status-reopen">
                  <RotateCcw aria-hidden />
                  Reopen
                </DropdownMenuItem>
              );
            }
            return [
              <DropdownMenuSeparator key="resolve-rule" />,
              <DropdownMenuItem key={step} disabled={!item} onSelect={() => onResolveOpenChange(true)} data-testid="support-status-resolve">
                <CheckCircle2 aria-hidden />
                {item ? supportResolveLabel(item) : 'Resolve'}
              </DropdownMenuItem>,
            ];
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={resolveOpen && item != null} onClose={() => onResolveOpenChange(false)} anchorRef={anchorRef} placement="bottom-end" gap={6} className="w-96">
        {item ? <SupportResolve item={item} onOpenChange={onResolveOpenChange} /> : null}
      </Popover>
    </span>
  );
}
