'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



interface DuplicateRoleDialogProps {
  open: boolean;
  sourceRoleId: number;
  sourceLabel: string;
  onClose: () => void;
  onDuplicated: (newRoleId: number) => void;
}

const KEY_RE = /^[a-z][a-z0-9_]{0,40}$/;

export function DuplicateRoleDialog({ open, sourceRoleId, sourceLabel, onClose, onDuplicated }: DuplicateRoleDialogProps) {
  const [label, setLabel] = useState(`${sourceLabel} (copy)`);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setErr(null);
    const finalKey = key.trim();
    if (!KEY_RE.test(finalKey)) { setErr('Key must start with a letter; lowercase letters, digits, underscores only.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/roles/${sourceRoleId}/duplicate`, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: finalKey, label: label.trim() || undefined }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        const code = String((data as { error?: string }).error || '');
        setErr(code === 'KEY_TAKEN' ? 'That key is already used.' : code || 'Could not duplicate.');
        return;
      }
      const data = await r.json() as { role: { id: number } };
      onDuplicated(data.role.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }, [sourceRoleId, label, key, onDuplicated, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent hideClose className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate role</DialogTitle>
          <DialogDescription>
            Copies permissions and color from <b>{sourceLabel}</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-role-caption font-semibold uppercase tracking-wider text-text-soft">New label</span>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              className={cn("mt-1 w-full rounded-md border border-border-default inset-cozy text-sm", focusRing('field', 'accent'))}
            />
          </label>
          <label className="block">
            <span className="block text-role-caption font-semibold uppercase tracking-wider text-text-soft">New key</span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40))}
              placeholder="shift_lead"
              className={cn("mt-1 w-full rounded-md border border-border-default inset-cozy text-sm font-mono", focusRing('field', 'accent'))}
            />
          </label>
        </div>

        {err && <div className="rounded-lg bg-surface-danger inset-field text-xs text-text-danger">{err}</div>}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit} loading={busy} disabled={!KEY_RE.test(key.trim())}>
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
