'use client';

/**
 * Imperative confirm — Kinetic Ledger AlertDialog host for `useConfirmedAction`.
 *
 * Mount `<ConfirmDialogHost />` once from Providers (alongside AppToaster).
 * Call `requestConfirm({ title, description })` from non-React or hook code.
 */

import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './AlertDialog';

type ConfirmRequest = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
};

type Pending = ConfirmRequest & {
  resolve: (value: boolean) => void;
};

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/** Promise-based confirm. Resolves true on confirm, false on cancel/dismiss. */
export function requestConfirm(req: ConfirmRequest | string): Promise<boolean> {
  const normalized: ConfirmRequest =
    typeof req === 'string' ? { description: req } : req;

  return new Promise<boolean>((resolve) => {
    if (pending) {
      pending.resolve(false);
    }
    pending = { ...normalized, resolve };
    notify();
  });
}

export function ConfirmDialogHost() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Pending | null>(null);

  useEffect(() => {
    const sync = () => {
      setCurrent(pending);
      setOpen(Boolean(pending));
    };
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const finish = (value: boolean) => {
    const p = pending;
    pending = null;
    setOpen(false);
    setCurrent(null);
    notify();
    p?.resolve(value);
  };

  if (!current) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{current.title ?? 'Confirm'}</AlertDialogTitle>
          <AlertDialogDescription>{current.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={(e) => {
              e.preventDefault();
              finish(false);
            }}
          >
            {current.cancelLabel ?? 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={current.tone ?? 'danger'}
            onClick={(e) => {
              e.preventDefault();
              finish(true);
            }}
          >
            {current.confirmLabel ?? 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
