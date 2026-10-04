'use client';

import { Button } from '@/design-system/primitives';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/**
 * A yes/no confirmation on the Radix bottom sheet — replaces `window.confirm`.
 * The confirming verb is the full-width bottom target (Fitts F1); Cancel sits
 * above it. Opened from inside another sheet it stacks on top natively.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      {/* No message → no description; an explicit undefined silences Radix's missing-description warning. */}
      <SheetContent side="bottom" {...(message ? {} : { 'aria-describedby': undefined })} data-testid="confirm-sheet">
        <SheetHeader className="shrink-0 px-mode-page pb-0 pt-4 pr-12">
          <SheetTitle className="text-left text-base">{title}</SheetTitle>
          {message ? <SheetDescription className="text-left text-sm leading-relaxed text-text-muted">{message}</SheetDescription> : null}
        </SheetHeader>
        <SheetBody className="grid gap-2">
          <Button variant="secondary" size="lg" radius="surface" className="w-full" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="xl"
            radius="surface"
            depth
            className="w-full"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
