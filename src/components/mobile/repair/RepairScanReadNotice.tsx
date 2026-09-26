'use client';

/** What the last read did — the one place on the phone the staffer's eye goes after the camera beeps. */

import { AlertTriangle, Check, ExternalLink, RotateCcw, X } from '@/components/Icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import type { SerialRejectReason } from '@/lib/kiosk/serial-read';

/** A unit as the staffer reads it: `Unit 2 · ThinkPad X1`. */
export interface UnitName {
  lineId: string;
  unit: number;
  title: string;
}

export type ReadNotice =
  | {
      kind: 'saved';
      target: UnitName;
      serial: string;
      /** The other unit that already carries this serial. */
      duplicateOf: UnitName | null;
      /** How the serial arrived: read off a label (or keyed into the lens), or found inside a link. */
      via: 'scan' | 'link';
      /** Serials the unit carries now, this one included. */
      count: number;
    }
  /** The read is already on `target` — nothing written. */
  | { kind: 'already'; target: UnitName; serial: string }
  /** Undo took the last read off `target`; `restored` is its list now (joined). */
  | { kind: 'undone'; target: UnitName; restored: string }
  | { kind: 'link'; url: string }
  | { kind: 'rejected'; value: string; reason: SerialRejectReason }
  | { kind: 'failed'; target: UnitName };

const REJECT_COPY: Record<SerialRejectReason, string> = {
  empty: 'The code was empty.',
  'too-short': 'Too short to be a serial.',
  'too-long': 'Too long to be a serial.',
  'not-a-serial': 'That code is not a serial.',
};

const unitName = (u: UnitName) => `Unit ${u.unit} · ${u.title}`;

export function RepairScanReadNotice({
  notice,
  onUndo,
  undoing,
  onDismiss,
}: {
  notice: ReadNotice;
  /** Take the last read back; null when there is none. */
  onUndo: (() => void) | null;
  undoing: boolean;
  onDismiss: () => void;
}) {
  const undo = onUndo ? (
    <Button variant="secondary" size="md" icon={<RotateCcw aria-hidden />} onClick={onUndo} disabled={undoing}>
      {undoing ? 'Undoing…' : 'Undo'}
    </Button>
  ) : null;

  const dismiss = (
    <IconButton
      onClick={onDismiss}
      size="touch"
      ariaLabel="Dismiss"
      icon={<X className="h-5 w-5" />}
      className="absolute right-0 top-0"
    />
  );

  if (notice.kind === 'saved') {
    const dup = notice.duplicateOf;
    return (
      <Alert
        variant={dup ? 'warning' : 'success'}
        className="border-0 px-mode-page pr-11"
        data-testid="repair-scan-notice"
        data-kind={dup ? 'duplicate' : 'saved'}
      >
        {dup ? <AlertTriangle aria-hidden /> : <Check aria-hidden />}
        <AlertTitle>Added to {unitName(notice.target)}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span className="font-mono text-role-body font-semibold opacity-100">{notice.serial}</span>
          {notice.count > 1 ? <span>{notice.count} serials on this unit now.</span> : null}
          {notice.via === 'link' ? <span>Taken from the serial inside a QR link.</span> : null}
          {dup ? <span>{unitName(dup)} already has this serial — check the label, or Undo.</span> : null}
          {undo}
        </AlertDescription>
        {dismiss}
      </Alert>
    );
  }

  if (notice.kind === 'link') {
    return (
      <Alert variant="warning" className="border-0 px-mode-page pr-11" data-testid="repair-scan-notice" data-kind="link">
        <AlertTriangle aria-hidden />
        <AlertTitle>That QR is a link, not a serial</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span className="max-w-full truncate font-mono">{notice.url}</span>
          <span>Nothing was written. Scan the serial barcode, or open the link.</span>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="md"
              icon={<ExternalLink aria-hidden />}
              onClick={() => window.open(notice.url, '_blank', 'noopener,noreferrer')}
            >
              Open link
            </Button>
            {undo}
          </div>
        </AlertDescription>
        {dismiss}
      </Alert>
    );
  }

  const { variant, icon, title, body } =
    notice.kind === 'already'
      ? {
          variant: 'default' as const,
          icon: <Check aria-hidden />,
          title: `Already on ${unitName(notice.target)}`,
          body: `${notice.serial} is on this unit already. Nothing was written.`,
        }
      : notice.kind === 'undone'
        ? {
            variant: 'default' as const,
            icon: <RotateCcw aria-hidden />,
            title: `Undone — ${unitName(notice.target)}`,
            body: notice.restored
              ? `Back to ${notice.restored}. The next read lands here.`
              : 'No serial again. The next read lands here.',
          }
        : notice.kind === 'rejected'
          ? {
              variant: 'destructive' as const,
              icon: <AlertTriangle aria-hidden />,
              title: REJECT_COPY[notice.reason],
              body: notice.value ? `Read “${notice.value}”. Nothing was written.` : 'Nothing was written.',
            }
          : {
              variant: 'destructive' as const,
              icon: <AlertTriangle aria-hidden />,
              title: `Not saved — ${unitName(notice.target)}`,
              body: 'The tablet did not take it. Scan again.',
            };
  return (
    <Alert variant={variant} className="border-0 px-mode-page pr-11" data-testid="repair-scan-notice" data-kind={notice.kind}>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{body}</span>
        {undo}
      </AlertDescription>
      {dismiss}
    </Alert>
  );
}
