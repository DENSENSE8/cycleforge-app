'use client';

/**
 * Link the rack / shelf a receiving Type goes to, from the Unbox next-step
 * card (directed putaway, operator 2026-10-07). Scan or type the location's
 * label; the card's arrow row shows the code the moment the write lands, and
 * every carton of that Type reads it from then on.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { Link2 } from '@/components/Icons';
import { Button, Popover, TextField } from '@/design-system/primitives';
import { intakeKindLabel } from '@/lib/receiving/kinds/registry';
import type { PutawayIntakeKind, PutawayTarget } from '@/lib/receiving/putaway-targets-contract';
import { usePutawayTargetLink } from '@/hooks/usePutawayTargets';

export function UnboxPutawayLinkControl({
  kind,
  linked,
}: {
  kind: PutawayIntakeKind;
  linked: PutawayTarget | null;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const link = usePutawayTargetLink();
  const typeLabel = intakeKindLabel(kind);

  const close = () => {
    setOpen(false);
    setCode('');
  };
  const submit = () => {
    const scanned = code.trim();
    if (!scanned || link.isPending) return;
    link.mutate({ action: 'link', kind, scanned }, { onSuccess: close });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit();
  };

  return (
    <>
      <Button
        ref={anchorRef}
        type="button"
        size="sm"
        variant="ghost"
        icon={<Link2 />}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="unbox-putaway-link"
      >
        {linked ? 'Change rack' : 'Link a rack'}
      </Button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        placement="bottom-end"
        gap={6}
        aria-label={`${typeLabel} rack`}
        className="w-80"
      >
        <div className="flex flex-col gap-3 p-3" data-testid="unbox-putaway-link-panel">
          <p className="text-role-caption text-text-muted">
            Where every {typeLabel} carton goes. Scan the rack or shelf label.
          </p>
          <TextField
            label="Rack or shelf"
            value={code}
            onChange={setCode}
            onKeyDown={onKeyDown}
            mono
            autoFocus
            data-testid="unbox-putaway-link-code"
          />
          <div className="flex items-center justify-end gap-2">
            {linked ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={link.isPending && link.variables?.action === 'unlink'}
                onClick={() => link.mutate({ action: 'unlink', kind }, { onSuccess: close })}
              >
                Unlink {linked.code}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={!code.trim()}
              loading={link.isPending && link.variables?.action === 'link'}
              onClick={submit}
              data-testid="unbox-putaway-link-submit"
            >
              Link
            </Button>
          </div>
        </div>
      </Popover>
    </>
  );
}
