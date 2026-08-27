'use client';

import { useRef, useState } from 'react';
import { Check, ChevronDown } from '@/components/Icons';
import { Popover } from '@/design-system/primitives';

export interface LabelTypeOption {
  key: string;
  name: string;
  /**
   * What the sticker goes on — "PO / carton" vs "Per item". Resolved by
   * `labelOptionsForSelect` from the label-kind SoT. Shown as row meta so the
   * operator reads the GRAIN, not just the kind's name.
   */
  grain?: string;
}

/**
 * Compact header dropdown that selects which label is queued for printing
 * (e.g. Unit label / Carton label / As Listed) on a workspace label preview.
 * Typography matches the "Edit label" secondary button (sentence case,
 * text-role-caption + font-semibold) — not the uppercase eyebrow style.
 */
export function LabelTypeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<LabelTypeOption>;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.key === value) ?? options[0];

  // Match Button size="sm" secondary label: caption + semibold, sentence case.
  const labelType = 'text-left text-role-caption font-semibold';

  if (options.length <= 1) {
    return <span className={`${labelType} text-text-default`}>{selected?.name ?? 'Live preview'}</span>;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`ds-raw-button -my-1 -ml-1 inline-flex items-center gap-1 rounded-none px-1 py-1 ${labelType} text-text-default transition-colors hover:bg-surface-hover`}
      >
        <span className="truncate">{selected?.name}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom-start"
        role="listbox"
        aria-label="Select label to print"
        padded={false}
        // Wide enough that name + grain meta sit on one row without truncating.
        className="min-w-[14rem]"
      >
        <ul className="py-1">
          {options.map((opt) => {
            const active = opt.key === selected?.key;
            return (
              <li key={opt.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.key);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-role-caption font-semibold transition-colors hover:bg-surface-hover ${
                    active ? 'text-text-default' : 'text-text-soft'
                  }`}
                >
                  {/* House one-row anatomy: title → meta → chip(right). Grain is
                      meta, so it separates from the name by color + case rather
                      than weight (the micro role already bakes 600). */}
                  <span className="truncate">{opt.name}</span>
                  {opt.grain ? (
                    <span className="ml-auto shrink-0 text-role-micro uppercase tracking-widest text-text-soft">
                      {opt.grain}
                    </span>
                  ) : null}
                  {active ? (
                    <Check className={`h-3.5 w-3.5 shrink-0 text-blue-600 ${opt.grain ? '' : 'ml-auto'}`} />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}
