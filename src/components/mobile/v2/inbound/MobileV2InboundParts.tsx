'use client';

/**
 * Presentation parts the V2 inbound-order screens share: the section band,
 * the full-bleed touch row (DS `Button`, flush), the picker row, and the
 * single-choice picker sheet (platform, urgency). Records (order lines,
 * catalog matches) are `MobileRecordCard`s, not these rows. Text here wraps,
 * never truncates — owner law: nothing that names a thing is cut off.
 */

import type { ReactNode } from 'react';
import { Check, ChevronRight } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { MOBILE_DATA_LIST_ROW_INTERACTION_CLASS } from '@/design-system/components/MobileDataListRow';
import { Button } from '@/design-system/primitives';
import type { InboundOrderChoice } from '@/lib/inbound/inbound-order-compose';
import { cn } from '@/utils/_cn';

/** The row frame: full width, one rule under it, text at the page inset. */
export const INBOUND_ROW_CLASS = 'flex min-h-mode-hit-cta w-full items-center gap-3 border-b border-mode-rule px-mode-page py-2.5 text-left';

export function InboundSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-b border-mode-rule px-mode-page pb-1.5 pt-5 text-role-caption font-semibold text-text-muted">
      {children}
    </h2>
  );
}

/** A full-bleed tappable row — the DS button laid flush as a list row. */
export function InboundRowButton({
  icon,
  children,
  trailing,
  onClick,
  disabled,
  pressed,
  testId,
}: {
  icon?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** A picker row's current choice. */
  pressed?: boolean;
  testId?: string;
}) {
  return (
    <Button
      variant="ghost"
      radius="flush"
      size="lg"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      data-testid={testId}
      className={cn(INBOUND_ROW_CLASS, MOBILE_DATA_LIST_ROW_INTERACTION_CLASS, 'h-auto justify-start whitespace-normal font-normal')}
    >
      {icon ? <span className="flex h-5 w-5 shrink-0 items-center justify-center text-mode-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</span> : null}
      <span className="min-w-0 flex-1 text-left">{children}</span>
      {trailing}
    </Button>
  );
}

/** Title over one quiet line, the body of a list row; both wrap. */
export function InboundRowText({ title, meta, metaTone = 'muted' }: { title: ReactNode; meta?: ReactNode; metaTone?: 'muted' | 'warning' }) {
  return (
    <>
      <span className="block break-words text-mode-body font-semibold text-mode-ink">{title}</span>
      {meta ? (
        <span className={cn('block break-words text-role-caption', metaTone === 'warning' ? 'text-text-warning' : 'text-mode-muted')}>{meta}</span>
      ) : null}
    </>
  );
}

/** A labelled row that opens a picker: caption left, value, chevron. */
export function InboundPickerRow({
  label,
  value,
  placeholder,
  flagged = false,
  locked = false,
  onOpen,
  testId,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  /** Still needed — the placeholder paints the warning ink. */
  flagged?: boolean;
  /** Part of a landed order's identity: shown, not changed. */
  locked?: boolean;
  onOpen: () => void;
  testId: string;
}) {
  return (
    <InboundRowButton
      onClick={onOpen}
      disabled={locked}
      testId={testId}
      trailing={locked ? null : <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-mode-muted" />}
    >
      <span className="flex items-start gap-3">
        <span className="w-24 shrink-0 pt-0.5 text-role-caption font-medium text-mode-muted">{label}</span>
        <span
          className={cn(
            'min-w-0 flex-1 break-words text-mode-body',
            value ? 'font-semibold text-mode-ink' : flagged ? 'text-text-warning' : 'text-mode-muted',
          )}
        >
          {value ?? placeholder}
        </span>
      </span>
    </InboundRowButton>
  );
}

/** Pick one value; choosing a row is the action, so the sheet has no dock. */
export function InboundChoiceSheet({
  open,
  onClose,
  title,
  options,
  value,
  onPick,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: readonly InboundOrderChoice[];
  value: string | null;
  onPick: (value: string) => void;
  testId: string;
}) {
  return (
    <MobileV2ActionSheet open={open} onClose={onClose} title={title} verbs={[]} onVerb={() => undefined} dockLabel={title} testId={testId}>
      <ul aria-label={title}>
        {options.map((option) => (
          <li key={option.value}>
            <InboundRowButton
              pressed={option.value === value}
              onClick={() => {
                onPick(option.value);
                onClose();
              }}
              testId={`${testId}-${option.value}`}
              trailing={option.value === value ? <Check aria-hidden className="h-5 w-5 shrink-0 text-mode-ink" /> : null}
            >
              <InboundRowText title={option.label} meta={option.hint} />
            </InboundRowButton>
          </li>
        ))}
      </ul>
    </MobileV2ActionSheet>
  );
}
