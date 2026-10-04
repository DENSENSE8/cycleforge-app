'use client';

/**
 * Order (phone face) — channel, order number, ship-by, the caller's note and
 * the two order flags. The channel is a touch list in a sheet; the ship-by is
 * the house compact date field (never a native date input). The shell owns
 * the title and the Back / Continue dock.
 */

import { useState } from 'react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Check, ChevronRight } from '@/components/Icons';
import { MobileFormHeading } from './MobileFormHeading';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { TextField } from '@/design-system/primitives/TextField';
import type { IntakeState } from '@/lib/orders/intake/intake-model';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';

/** A touch row in the form's triage voice — press washes the row, never inverts it. */
const ROW_CLASS =
  'group flex min-h-mode-hit-cta w-full items-center gap-3 border-b border-mode-rule px-mode-page py-2.5 text-left active:bg-mode-hover';

export function MobileOrderStep({
  state,
  channelOptions,
  onChange,
}: {
  state: IntakeState;
  channelOptions: { value: string; label: string }[];
  onChange: (patch: Partial<IntakeState>) => void;
}) {
  const [channelOpen, setChannelOpen] = useState(false);
  const channel = channelOptions.find((o) => o.value.toLowerCase() === state.channel.toLowerCase()) ?? null;

  return (
    <div className="bg-mode-panel" data-testid="m-order-order">
      <MobileFormHeading>Order</MobileFormHeading>
      <button type="button" onClick={() => setChannelOpen(true)} className={ROW_CLASS} data-testid="m-order-channel">
        <span className="w-20 shrink-0 text-role-caption font-medium text-mode-muted">Channel</span>
        <span
          className={`min-w-0 flex-1 truncate text-mode-body ${channel ? 'font-semibold text-mode-ink' : 'text-mode-muted'}`}
        >
          {channel?.label ?? (state.channel || 'Pick the channel')}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-mode-muted" />
      </button>

      <div className="space-y-3 border-b border-mode-rule px-mode-page py-3">
        <TextField
          label="Order number"
          value={state.orderNumber}
          onChange={(v) => onChange({ orderNumber: v, orderNumberGenerated: false })}
          mono
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          data-testid="m-order-number"
        />
        <div>
          <p className="pb-1 text-role-caption font-medium text-mode-muted">Ship by</p>
          <DateRangePickerField
            variant="compact"
            value={state.shipBy ? dateKeyToLocalDate(state.shipBy) : undefined}
            onChange={(day) => onChange({ shipBy: localDateToDateKey(day) })}
            ariaLabel="Ship by"
            className="h-11 w-full rounded-mode-control border border-border-soft px-3.5 text-sm"
          />
        </div>
        <TextField
          label="Note from the caller"
          value={state.buyerNote}
          onChange={(v) => onChange({ buyerNote: v })}
          multiline
          rows={3}
          data-testid="m-order-note"
        />
      </div>

      <MobileFormHeading>Flags</MobileFormHeading>
      <label className={ROW_CLASS} data-testid="m-order-urgent">
        <span className="min-w-0 flex-1 text-mode-body font-semibold text-mode-ink">Mark urgent</span>
        <Checkbox checked={state.isUrgent} onCheckedChange={(v) => onChange({ isUrgent: v === true })} className="h-5 w-5" />
      </label>
      <label className={ROW_CLASS} data-testid="m-order-docs-not-required">
        <span className="min-w-0 flex-1">
          <span className="block text-mode-body font-semibold text-mode-ink">Documents not required</span>
          <span className="block text-role-caption text-mode-muted">No manual or paperwork needed — recorded for the release audit.</span>
        </span>
        <Checkbox
          checked={state.docsNotRequired}
          onCheckedChange={(v) => onChange({ docsNotRequired: v === true })}
          className="h-5 w-5"
        />
      </label>

      <Sheet open={channelOpen} onOpenChange={(next) => { if (!next) setChannelOpen(false); }}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle>Channel</SheetTitle>
          </SheetHeader>
          <SheetBody className="px-0 pt-0">
            <ul aria-label="Channels" data-testid="m-order-channel-sheet">
              {channelOptions.map((o) => {
                const selected = o.value === channel?.value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        onChange({ channel: o.value });
                        setChannelOpen(false);
                      }}
                      className={ROW_CLASS}
                    >
                      <span className="min-w-0 flex-1 truncate text-mode-body font-semibold text-mode-ink">
                        {o.label}
                      </span>
                      {selected ? <Check className="h-5 w-5 shrink-0 text-mode-ink" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
