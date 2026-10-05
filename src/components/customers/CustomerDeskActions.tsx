'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from '@/components/Icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { Button, TextField } from '@/design-system/primitives';
import { toast } from '@/lib/toast';

interface CustomerDeskActionsProps {
  onCreated: (customerId: number) => void;
}

/** Customers' page-level create verb; the desk chrome owns its top-right placement. */
export function CustomerDeskActions({ onCreated }: CustomerDeskActionsProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const action = useMemo(() => (
    <DeskHeaderAction
      type="button"
      variant="primary"
      size="md"
      icon={<Plus aria-hidden />}
      label="New customer"
      onClick={() => setOpen(true)}
      data-testid="customers-new"
    />
  ), []);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; id?: number; error?: string } | null;
      if (!response.ok || !body?.ok || !body.id) throw new Error(body?.error || 'Could not create the customer');
      const id = body.id;
      await queryClient.invalidateQueries({ queryKey: ['customers.directory'] });
      setOpen(false);
      setName('');
      setPhone('');
      setEmail('');
      toast.success('Customer created');
      onCreated(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{action}</DeskActionSlotRegistrar>
      <Dialog open={open} onOpenChange={(next) => { if (!next) close(); else setOpen(true); }}>
        <DialogContent data-testid="new-customer-dialog">
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New customer</DialogTitle>
              <DialogDescription>Add the contact details staff will use to identify this customer.</DialogDescription>
            </DialogHeader>
            <TextField label="Name" value={name} onChange={setName} autoFocus autoComplete="name" disabled={saving} required />
            <TextField label="Phone" value={phone} onChange={setPhone} inputMode="tel" autoComplete="tel" disabled={saving} />
            <TextField label="Email" value={email} onChange={setEmail} inputMode="email" type="email" autoComplete="email" disabled={saving} />
            {error ? <p role="alert" className="text-role-caption font-semibold text-text-danger">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!name.trim() || saving}>Create customer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
