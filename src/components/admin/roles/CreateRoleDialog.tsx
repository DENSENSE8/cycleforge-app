'use client';

/**
 * Modal to create a new (non-system) role. Triggered by "+ Create role"
 * in RolesSidebarPanel. Starts with an empty permission set — admin tunes
 * the toggles in the editor after creation.
 */

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



interface CreateRoleDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (newRoleId: number) => void;
}

const KEY_RE = /^[a-z][a-z0-9_]{0,40}$/;

export function CreateRoleDialog({ open, onClose, onCreated }: CreateRoleDialogProps) {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [color, setColor] = useState('#6b7280');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

  const submit = useCallback(async () => {
    setErr(null);
    const finalKey = key.trim() || slugify(label);
    if (!label.trim()) { setErr('Label is required.'); return; }
    if (!KEY_RE.test(finalKey)) { setErr('Key must start with a letter and use only lowercase letters, digits, and underscores.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/admin/roles', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: finalKey, label: label.trim(), color, permissions: [] }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        const code = String((data as { error?: string }).error || '');
        setErr(code === 'KEY_TAKEN' ? 'That key is already used. Try another.' : code || 'Could not create role.');
        return;
      }
      const data = await r.json() as { role: { id: number } };
      onCreated(data.role.id);
      setLabel(''); setKey(''); setColor('#6b7280');
      onClose();
    } finally {
      setBusy(false);
    }
  }, [label, key, color, onCreated, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent hideClose className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create role</DialogTitle>
          <DialogDescription>
            New role starts with no permissions. Add toggles in the editor after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-role-caption font-semibold text-text-soft">Label</span>
            <input
              autoFocus
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!key) setKey(slugify(e.target.value));
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              className={cn("mt-1 w-full rounded-md border border-border-default inset-cozy text-sm", focusRing('field', 'accent'))}
              placeholder="Shift Lead"
            />
          </label>
          <label className="block">
            <span className="block text-role-caption font-semibold text-text-soft">Key (slug)</span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40))}
              className={cn("mt-1 w-full rounded-md border border-border-default inset-cozy text-sm font-mono", focusRing('field', 'accent'))}
              placeholder="shift_lead"
            />
            <span className="mt-0.5 block text-role-micro text-text-faint">Stable identifier; cannot be changed later.</span>
          </label>
          <label className="block">
            <span className="block text-role-caption font-semibold text-text-soft">Color</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-border-default"
              />
              <code className="rounded-md bg-surface-sunken px-2 py-1 text-role-caption font-mono text-text-muted">{color}</code>
            </div>
          </label>
        </div>

        {err && <div className="rounded-lg bg-red-50 inset-field text-xs text-red-700">{err}</div>}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} loading={busy} disabled={!label.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
