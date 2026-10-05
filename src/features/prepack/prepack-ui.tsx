'use client';

import { useState } from 'react';
import { Check } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { RecordPhoto } from '@/design-system/components/record-ledger/RecordPhoto';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/**
 * A product's photo tile in a list row — the product photo, or its initials
 * (also when the photo URL fails, e.g. a Zoho image while Zoho is
 * disconnected). Non-interactive on purpose: it sits inside row buttons; a
 * card that is not a button wraps it in `PhotoHoverPeek`.
 */
export function ProductThumb({ src, title, className }: { src: string | null; title: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shown = src && src !== failedSrc ? src : null;
  return (
    <span
      className={cn('relative size-11 shrink-0 overflow-hidden rounded-mode-control bg-surface-sunken ring-1 ring-inset ring-black/5', className)}
      data-testid="product-thumb"
      data-has-photo={shown ? 'true' : 'false'}
      data-photo-failed={src && src === failedSrc ? 'true' : undefined}
    >
      <RecordPhoto src={shown} fallback={title} onError={() => setFailedSrc(src)} />
    </span>
  );
}

export function PrepackFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-b border-mode-rule py-2 last:border-b-0">
      <dt className="text-role-caption font-semibold text-text-muted">{label}</dt>
      <dd className={`break-words text-right text-role-caption text-mode-ink ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

export interface PrepackChoice<Id extends string> {
  id: Id;
  label: string;
  help: string;
}

/** One pick-one grid of tall Button tiles (condition grade, provenance). `hotkeys` paints 1–9 on desk. */
export function PrepackChoiceTiles<Id extends string>({
  legend,
  choices,
  value,
  onChange,
  hotkeys = false,
  testIdPrefix,
}: {
  legend: string;
  choices: readonly PrepackChoice<Id>[];
  value: Id | null;
  onChange: (id: Id) => void;
  hotkeys?: boolean;
  testIdPrefix: string;
}) {
  return (
    <fieldset className="space-y-2" data-testid={`${testIdPrefix}-choice`}>
      <legend className="text-role-caption font-semibold text-text-muted">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((choice, index) => {
          const selected = value === choice.id;
          return (
            <HoverTooltip
              key={choice.id}
              label={choice.label}
              shortcut={hotkeys && index < 9 ? String(index + 1) : undefined}
              disabled={!hotkeys}
              asChild
            >
              <Button
                variant={selected ? 'ink' : 'secondary'}
                size="lg"
                aria-pressed={selected}
                onClick={() => onChange(choice.id)}
                className="h-auto min-h-16 flex-col items-start justify-center gap-0.5 whitespace-normal py-2 text-left"
                data-testid={`${testIdPrefix}-${choice.id.toLowerCase()}`}
              >
                <span className="flex w-full items-center gap-1.5 text-role-caption font-semibold">
                  <span className="min-w-0 flex-1">{choice.label}</span>
                  {selected ? <Check className="size-3.5 shrink-0" /> : null}
                </span>
                <span className="text-role-eyebrow font-normal opacity-80">{choice.help}</span>
              </Button>
            </HoverTooltip>
          );
        })}
      </div>
    </fieldset>
  );
}
