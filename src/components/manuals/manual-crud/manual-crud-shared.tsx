'use client';

import { AlertCircle, Check, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
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



// ─── Shared shell ──────────────────────────────────────────────────────────

const MANUALS_UPDATED_EVENT = 'manuals-updated';

export function dispatchManualsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MANUALS_UPDATED_EVENT));
  }
}

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  busy: boolean;
  children: React.ReactNode;
  footer: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
}

export function ModalShell({
  open, onClose, eyebrow, title, busy, children, footer, maxWidth = 'md',
}: ModalShellProps) {
  const widthClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[maxWidth];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent hideClose className={`${widthClass} gap-0 overflow-hidden p-0`}>
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-border-soft px-4 py-3">
          <div>
            <p className="text-role-micro uppercase tracking-[0.16em] text-text-soft">{eyebrow}</p>
            <DialogTitle className="mt-1 text-sm font-semibold">{title}</DialogTitle>
            <DialogDescription className="sr-only">
              {eyebrow}: {title}
            </DialogDescription>
          </div>
          <IconButton
            icon={<X className="h-4 w-4" />}
            onClick={onClose}
            disabled={busy}
            ariaLabel="Close"
            className="rounded-full border border-border-soft bg-surface-card p-2 hover:border-border-default hover:bg-surface-hover hover:text-text-default"
          />
        </DialogHeader>
        <div className="space-y-4 px-4 py-4">{children}</div>
        <DialogFooter className="border-t border-border-hairline bg-surface-canvas/60 px-4 py-3">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-role-micro uppercase tracking-[0.14em] text-text-soft">
      {children}
    </span>
  );
}

export const inputClass =
  cn('w-full rounded-lg border border-border-soft bg-surface-card px-3 py-2 text-sm text-text-default placeholder:text-text-faint', focusRing('field', 'accent'));

export { FILTER_DROPDOWN_SELECT_CLASS as selectClass } from '@/design-system/components/FilterDropdownSelect';

export function PrimaryButton({
  busy, disabled, children, onClick, danger,
}: {
  busy?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Button
      variant={danger ? 'danger' : 'brand'}
      size="sm"
      loading={busy}
      disabled={disabled}
      icon={<Check className="h-3.5 w-3.5" />}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function SecondaryButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-role-caption font-semibold text-red-700">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export const TYPE_OPTIONS = [
  { value: '',             label: 'Unspecified' },
  { value: 'manual',       label: 'Manual' },
  { value: 'packing-list', label: 'Packing List' },
  { value: 'pl-plus-m',    label: 'PL + M' },
];

export const STATUS_OPTIONS = [
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'assigned',   label: 'Assigned' },
  { value: 'archived',   label: 'Archived' },
];
