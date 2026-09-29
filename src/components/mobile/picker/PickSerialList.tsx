'use client';

import { useState } from 'react';
import { Check, Pencil, Trash2 } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { PickOrderSerialRow } from './usePickOrder';

const SERIAL_STATE_LABEL: Record<PickOrderSerialRow['state'], string> = {
  'to-pick': 'To pick',
  picked: 'Picked',
  scanned: 'Scanned',
};

/**
 * The order's serials. A serial on this card's live scan session is tapped
 * into an edit row in place: the serial in a field, Delete, Save. Save drops
 * the old serial and adds the corrected one (which picks its unit); Delete
 * drops it and puts its unit back to allocated.
 */
export function PickSerialList({
  rows,
  busy,
  onRemove,
  onReplace,
}: {
  rows: readonly PickOrderSerialRow[];
  busy: boolean;
  onRemove: (serial: string) => Promise<boolean>;
  onReplace: (from: string, to: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const close = () => setEditing(null);
  const save = async (serial: string) => {
    if (await onReplace(serial, draft)) close();
  };
  const remove = async (serial: string) => {
    if (await onRemove(serial)) close();
  };

  return (
    <ul aria-label="Serials" className="divide-y divide-mode-rule bg-mode-panel">
      {rows.map((row) => {
        const badges = (
          <>
            {row.bin ? <Badge variant="outline">{row.bin}</Badge> : null}
            <Badge variant={row.state === 'to-pick' ? 'outline' : 'success'} className="font-mono">
              {SERIAL_STATE_LABEL[row.state]}
            </Badge>
          </>
        );
        if (row.editable && editing === row.serial) {
          const unchanged = draft.trim().toUpperCase() === row.serial || !draft.trim();
          return (
            <li key={row.serial} data-testid="pick-serial-edit" className="flex flex-col gap-2 px-mode-page py-2.5">
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!unchanged) void save(row.serial);
                }}
              >
                <Input
                  aria-label={`Serial ${row.serial}`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') close();
                  }}
                  disabled={busy}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="h-11 font-mono text-role-field"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    icon={<Trash2 />}
                    disabled={busy}
                    onClick={() => void remove(row.serial)}
                  >
                    Delete
                  </Button>
                  <Button type="button" variant="ghost" size="md" className="ml-auto" disabled={busy} onClick={close}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="md" icon={<Check />} disabled={busy || unchanged}>
                    Save
                  </Button>
                </div>
              </form>
            </li>
          );
        }
        return (
          <li key={row.serial}>
            {row.editable ? (
              <button
                type="button"
                aria-label={`Edit serial ${row.serial}`}
                data-testid="pick-serial-row"
                disabled={busy}
                onClick={() => {
                  setEditing(row.serial);
                  setDraft(row.serial);
                }}
                className={cn(
                  'ds-raw-button flex min-h-mode-hit w-full items-center justify-between gap-3 px-mode-page py-2.5 text-left',
                  focusRing('control'),
                )}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-all font-mono text-mode-body font-semibold text-mode-ink">{row.serial}</span>
                  <Pencil className="size-4 shrink-0 text-mode-muted" />
                </span>
                <span className="flex shrink-0 items-center gap-2">{badges}</span>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 px-mode-page py-2.5">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-all font-mono text-mode-body font-semibold text-mode-ink">{row.serial}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">{badges}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
