'use client';

import { useRef, useState } from 'react';
import { AnchoredLayer } from '@/design-system';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { Panel } from '@/design-system/primitives';



export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  align?: 'left' | 'right';
  /** `field` matches form inputs (h-10, rounded-xl); `compact` is the queue/header chip; `dense` is the ticket header row; `rail` is Unbox station-dense. */
  size?: 'compact' | 'field' | 'dense' | 'rail';
  className?: string;
}

/** Small headless dropdown used for the status / priority / assignee pickers. */
export function ZendeskSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder = 'Select',
  align = 'left',
  size = 'compact',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;
  const isField = size === 'field';
  const isRail = size === 'rail';
  const isDense = size === 'dense' || isRail;

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'ds-raw-button flex w-full items-center justify-between gap-2 border border-border-default bg-surface-card text-text-default transition-colors hover:bg-surface-hover disabled:opacity-50',
          isField
            ? cn('h-10 min-h-10 rounded-xl px-3 text-role-data font-semibold', focusRing('field', 'accent'))
            : isRail
              ? 'inline-flex max-w-[7.5rem] gap-0.5 rounded px-1.5 py-0.5 text-role-eyebrow font-semibold'
              : isDense
                ? 'inline-flex max-w-[9rem] gap-1 rounded-md px-2 py-1 text-role-micro font-semibold'
                : 'inline-flex max-w-[180px] gap-1.5 rounded-lg px-2.5 py-1.5 text-role-caption font-semibold',
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <svg
          className={cn(
            'shrink-0 text-text-soft transition-transform',
            isRail ? 'h-2 w-2' : isDense ? 'h-2.5 w-2.5' : 'h-3 w-3',
            open ? 'rotate-180' : '',
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapperRef}
        placement={align === 'right' ? 'bottom-end' : 'bottom-start'}
        gap={4}
      >
        <Panel radius="lg" padding="none" elevation="md" className="max-h-64 w-max min-w-[150px] overflow-auto p-1">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`ds-raw-button flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left hover:bg-surface-hover ${
                o.value === value ? 'bg-surface-canvas' : ''
              }`}
            >
              <span className="text-role-caption font-semibold text-text-default">{o.label}</span>
              {o.sublabel ? <span className="text-role-micro text-text-soft">{o.sublabel}</span> : null}
            </button>
          ))}
        </Panel>
      </AnchoredLayer>
    </div>
  );
}
