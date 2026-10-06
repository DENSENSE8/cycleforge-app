'use client';

/**
 * One slot of an order (Shipping label · Packing slip · one product line's
 * paperwork) as a focus stop and a typed drop target. Tab lands on the slot;
 * with it (or anything inside it that is not a text field) focused, P pairs,
 * U uploads, N marks it not required. A file dropped on it lands as the
 * slot's own type on the slot's own target — never guessed from a filename;
 * a file of the wrong kind is refused with the reason.
 */

import { Fragment, useCallback, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { FileText } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import type { PacketSlotState } from '@/lib/label-prints/order-packet-contracts';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { SLOT_STATE_FACE } from './slot-faces';

export interface SlotDrop {
  /** MIME types the slot's writer takes. */
  types: readonly string[];
  /** What lands, on what: "a Manual pinned to SKU AB-1". */
  hint: string;
  /** Why another kind of file is refused: "Shipping labels are PDFs." */
  refusal: string;
  onFiles: (files: File[]) => void;
}

export interface SlotKeys {
  pair?: (() => void) | null;
  upload?: (() => void) | null;
  notRequired?: (() => void) | null;
}

const KEY_ACTION: Readonly<Record<string, keyof SlotKeys>> = { p: 'pair', u: 'upload', n: 'notRequired' };

export function SlotFrame({
  name,
  state,
  drop,
  keys,
  testId,
  className,
  children,
}: {
  /** The slot's spoken name: "Shipping label", "Product paperwork · SKU AB-1". */
  name: string;
  state: PacketSlotState;
  drop: SlotDrop | null;
  keys: SlotKeys;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    if (isEditableKeyTarget(event.target)) return;
    const which = KEY_ACTION[event.key.toLowerCase()];
    const action = which ? keys[which] : null;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  const onDragEnter = (event: DragEvent) => {
    if (!drop || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    depth.current += 1;
    setOver(true);
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!drop) return;
    event.preventDefault();
    event.stopPropagation();
    depth.current = 0;
    setOver(false);
    const files = Array.from(event.dataTransfer.files);
    const taken = files.filter((file) => drop.types.includes(file.type));
    if (taken.length < files.length) toast.error(`${files.length - taken.length} file${files.length - taken.length === 1 ? '' : 's'} refused — ${drop.refusal}`);
    if (taken.length > 0) drop.onFiles(taken);
  };

  return (
    <section
      tabIndex={0}
      aria-label={`${name} — ${SLOT_STATE_FACE[state].label}`}
      data-testid={testId}
      data-slot-state={state}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragOver={(event) => {
        if (drop && event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn('relative min-w-0 rounded-mode-control', focusRing('control'), className)}
    >
      {children}
      {over && drop ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex min-w-0 items-center justify-center rounded-mode-control border-2 border-dashed border-mode-rule bg-mode-well px-3"
        >
          <span className="min-w-0 truncate text-role-caption font-semibold text-mode-ink" title={`Drop to add ${drop.hint}`}>
            Drop to add {drop.hint}
          </span>
        </div>
      ) : null}
    </section>
  );
}

/** A hidden file input the slot's Upload opens; `accept` follows the slot's writer. */
export function useFilePicker(types: readonly string[], onFiles: (files: File[]) => void, multiple = true) {
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef(onFiles);
  latest.current = onFiles;
  const open = useCallback(() => ref.current?.click(), []);
  const input = (
    <input
      ref={ref}
      type="file"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      accept={types.join(',')}
      multiple={multiple}
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (files.length > 0) latest.current(files);
      }}
    />
  );
  return { open, input };
}

/** A pane slot's heading: the slot name and its one state badge. */
export function SlotHeading({ title, state, aside }: { title: string; state: PacketSlotState; aside?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h3 className={cn(RECORD_LABEL_CLASS, 'min-w-0 truncate text-mode-faint')} title={title}>
        {title}
      </h3>
      <LifecycleCode state={SLOT_STATE_FACE[state]} className="shrink-0" />
      {aside ? <span className="ml-auto flex shrink-0 items-center gap-1">{aside}</span> : null}
    </div>
  );
}

/** One document in a slot: its title (opens the bytes), its source badge, its facts, its verbs. */
export function SlotDocument({
  title,
  href,
  source,
  facts,
  actions,
  testId,
}: {
  title: string;
  href: string | null;
  /** Paperwork only: SKU · Item # · This order. */
  source?: string | null;
  facts: ReadonlyArray<ReactNode>;
  actions?: ReactNode;
  testId: string;
}) {
  const shown = facts.filter((fact) => fact != null && fact !== false && fact !== '');
  return (
    <li className="flex min-w-0 items-start gap-2 py-1" data-testid={testId}>
      <FileText className="mt-0.5 size-4 shrink-0 text-text-faint" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title={title}
            className={cn('min-w-0 truncate text-role-data font-medium text-text-default hover:underline', focusRing('control'))}
          >
            {title}
          </a>
        ) : (
          <span className="min-w-0 truncate text-role-data font-medium text-text-default" title={title}>
            {title}
          </span>
        )}
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-role-caption text-text-muted">
          {source ? (
            <Badge variant="secondary" className="shrink-0">
              {source}
            </Badge>
          ) : null}
          {shown.map((fact, index) => (
            <Fragment key={index}>
              {index > 0 || source ? <span aria-hidden>·</span> : null}
              <span className="min-w-0 truncate">{fact}</span>
            </Fragment>
          ))}
        </span>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </li>
  );
}
