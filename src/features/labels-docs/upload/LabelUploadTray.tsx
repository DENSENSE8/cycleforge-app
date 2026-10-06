'use client';

/**
 * The upload tray — transient: one row per file sent, each Added · Already on
 * file · Failed with what landed ("38 labels added · 2 already on file") or why
 * it failed, and an N-of-M meter while the pick is still sending. `kind`
 * names what was sent: an order slot's shipping-label PDFs (a batch each —
 * the server splits it into labels) or Labels & docs files (`usePrintFileUploads`).
 * Dismiss drops the finished rows. Renders nothing when there is nothing to
 * report.
 */

import type { ReactNode } from 'react';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';
import { AlertTriangle, Check, Copy, Loader2, X } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import type { LabelUploads, LabelUploadItem } from './use-label-uploads';

const STATUS_FACE: Record<LabelUploadItem['status'], { label: string; variant: 'default' | 'success' | 'secondary' | 'destructive' }> = {
  uploading: { label: 'Sending', variant: 'default' },
  added: { label: 'Added', variant: 'success' },
  replayed: { label: 'Already on file', variant: 'secondary' },
  failed: { label: 'Failed', variant: 'destructive' },
};

const STATUS_GLYPH: Record<LabelUploadItem['status'], ReactNode> = {
  uploading: <Loader2 className="animate-spin" aria-hidden />,
  added: <Check aria-hidden />,
  replayed: <Copy aria-hidden />,
  failed: <AlertTriangle aria-hidden />,
};

const TRAY_WORDS = {
  labels: { sending: 'Uploading labels', done: 'Label uploads', dismiss: 'Dismiss label uploads' },
  files: { sending: 'Uploading files', done: 'Uploads', dismiss: 'Dismiss uploads' },
} as const;

/**
 * @param uploads the `useLabelUploads()` / `usePrintFileUploads()` result — the tray reads its rows and dismisses through it.
 */
export function LabelUploadTray({ uploads, kind = 'labels' }: { uploads: LabelUploads; kind?: keyof typeof TRAY_WORDS }) {
  const { items, pending, clear } = uploads;
  if (items.length === 0) return null;
  const words = TRAY_WORDS[kind];
  const done = items.filter((item) => item.status !== 'uploading').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  const title = pending ? `${words.sending} · ${done} of ${items.length}` : `${words.done} · ${items.length}${failed > 0 ? ` · ${failed} failed` : ''}`;

  return (
    <RecordGroup
      title={title}
      testId={kind === 'labels' ? 'label-upload-tray' : 'file-upload-tray'}
      action={
        <Button variant="ghost" size="sm" icon={<X />} onClick={clear} aria-label={words.dismiss}>
          Dismiss
        </Button>
      }
    >
      {pending ? <ProgressBar current={done} goal={items.length} className="px-4 pb-2" /> : null}
      <ul className="max-h-72 overflow-y-auto px-4 pb-3" aria-live="polite">
        {items.map((item) => {
          const face = STATUS_FACE[item.status];
          return (
            <li key={item.key} className="flex min-w-0 items-start gap-2 py-1" data-status={item.status}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-role-data text-text-default" title={item.name}>
                  {item.name}
                </p>
                {item.summary ? <p className="truncate text-role-caption text-text-muted">{item.summary}</p> : null}
                {item.reason ? <p className="text-role-caption text-rose-700">{item.reason}</p> : null}
              </div>
              <Badge variant={face.variant}>
                {STATUS_GLYPH[item.status]}
                {face.label}
              </Badge>
            </li>
          );
        })}
      </ul>
    </RecordGroup>
  );
}
