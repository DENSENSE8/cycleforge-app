'use client';

import type { FormEvent } from 'react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { Check } from '@/components/Icons';

/**
 * The shell every unit-hub verb sheet shares — one scanned field (plus an
 * optional note), the notice / error lines, and the POST helper — so Pair,
 * Move and Stash cannot drift into separate looks.
 */

export function SheetAlerts({ notice, error }: { notice: string | null; error: string | null }) {
  return (
    <>
      {notice ? (
        <p
          role="status"
          className="rounded-mode border border-amber-200 bg-amber-50 px-mode-page py-2.5 text-role-caption font-semibold text-amber-800"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-mode border border-rose-200 bg-rose-50 px-mode-page py-2.5 text-role-caption font-semibold text-rose-700"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}

export function UnitRefSheet({
  open,
  title,
  label,
  value,
  onChange,
  note,
  busy,
  error,
  notice,
  submitLabel,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Optional free-text note sent with the write. */
  note?: { value: string; onChange: (next: string) => void };
  busy: boolean;
  error: string | null;
  notice: string | null;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      {/* The sheet portals out of the page's ModeRegion; re-declare triage so
          the mode radius / padding / hit tokens resolve inside the sheet. */}
      <ModeRegion mode="triage" asChild>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                onSubmit();
              }}
            >
              <TextField
                label={label}
                value={value}
                onChange={onChange}
                mono
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
              {note ? (
                <TextField label="Note (optional)" value={note.value} onChange={note.onChange} multiline rows={2} disabled={busy} />
              ) : null}
              <SheetAlerts notice={notice} error={error} />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full rounded-mode"
                icon={<Check />}
                loading={busy}
                disabled={busy || !value.trim()}
              >
                {submitLabel}
              </Button>
            </form>
          </SheetBody>
        </SheetContent>
      </ModeRegion>
    </Sheet>
  );
}

/** POST a unit verb; the response plus its body (`null` when the body is not JSON). */
export async function postUnitVerb(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}
