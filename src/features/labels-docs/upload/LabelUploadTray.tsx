'use client';

/**
 * The upload tray — transient: one row per file sent, each Added · Already on
 * file · Needs you · Failed with what landed ("38 labels added · 2 already on
 * file") or why it failed, and an N-of-M meter while the pick is still
 * sending. `kind` names what was sent: an order slot's shipping-label PDFs (a
 * batch each — the server splits it into labels) or Labels & docs files
 * (`usePrintFileUploads`). An order slot's pages that need the operator wait
 * under the rows with their question: the page itself, then a Tracking number
 * (File with / without tracking), the other order holding its tracking (Move
 * to this order · Keep on both · Cancel), or this order's own tracking
 * (Replace · Add as another box). Dismiss drops the finished rows. Renders
 * nothing when there is nothing to report.
 */

import { useState, type ReactNode } from 'react';
import { DocumentPreviewFrame } from '@/design-system/components/DocumentPreviewFrame';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { RecordFullId } from '@/design-system/components/record-ledger/RecordFullId';
import { Button, TextField } from '@/design-system/primitives';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';
import { AlertTriangle, Check, Clock, Copy, Loader2, X } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { detectTypedCarrier, type LabelFileOtherOrder } from '@/lib/label-ingestions/file-on-order-contracts';
import { labelPdfSrc } from '@/lib/label-prints/http-client';
import type { LabelPageUploads, LabelUploads, LabelUploadItem, WaitingLabelPage } from './use-label-uploads';

const STATUS_FACE: Record<LabelUploadItem['status'], { label: string; variant: 'default' | 'success' | 'secondary' | 'destructive' | 'warning' }> = {
  uploading: { label: 'Sending', variant: 'default' },
  waiting: { label: 'Needs you', variant: 'warning' },
  added: { label: 'Added', variant: 'success' },
  replayed: { label: 'Already on file', variant: 'secondary' },
  failed: { label: 'Failed', variant: 'destructive' },
};

const STATUS_GLYPH: Record<LabelUploadItem['status'], ReactNode> = {
  uploading: <Loader2 className="animate-spin" aria-hidden />,
  waiting: <Clock className="h-3 w-3" />,
  added: <Check aria-hidden />,
  replayed: <Copy aria-hidden />,
  failed: <AlertTriangle aria-hidden />,
};

const TRAY_WORDS = {
  labels: { sending: 'Uploading labels', done: 'Label uploads', dismiss: 'Dismiss label uploads' },
  files: { sending: 'Uploading files', done: 'Uploads', dismiss: 'Dismiss uploads' },
} as const;

/**
 * @param uploads the `useLabelUploads()` / `usePrintFileUploads()` result — the tray reads its rows, asks its waiting pages and dismisses through it.
 */
export function LabelUploadTray({ uploads, kind = 'labels' }: { uploads: LabelUploads | LabelPageUploads; kind?: keyof typeof TRAY_WORDS }) {
  const { items, pending, clear } = uploads;
  if (items.length === 0) return null;
  const words = TRAY_WORDS[kind];
  const waiting = 'waiting' in uploads ? uploads.waiting : [];
  const done = items.filter((item) => item.status !== 'uploading').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  const title = pending
    ? `${words.sending} · ${done} of ${items.length}`
    : `${words.done} · ${items.length}${waiting.length > 0 ? ` · ${waiting.length} waiting` : ''}${failed > 0 ? ` · ${failed} failed` : ''}`;

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
      {'waiting' in uploads && waiting.length > 0 ? (
        <ul className="divide-y divide-border-hairline border-t border-border-hairline" aria-label="Pages waiting on you">
          {waiting.map((page) => (
            <WaitingPage key={page.key} page={page} uploads={uploads} />
          ))}
        </ul>
      ) : null}
    </RecordGroup>
  );
}

/** One order, full number first — the collision question shows this order beside the other. */
function OrderFace({ role, order }: { role: string; order: LabelFileOtherOrder }) {
  return (
    <div className="min-w-0">
      <p className="text-role-eyebrow text-text-faint">{role}</p>
      <RecordFullId value={order.orderNumber} label="order number" />
      <p className="text-role-caption text-text-muted">{[order.platform, order.status].filter(Boolean).join(' · ') || '—'}</p>
    </div>
  );
}

function WaitingPage({ page, uploads }: { page: WaitingLabelPage; uploads: LabelPageUploads }) {
  const [typed, setTyped] = useState(page.answers.tracking ?? '');
  const { check, busy } = page;
  const question = page.needs[0];
  const typedCarrier = typed.trim() ? detectTypedCarrier(typed) : null;
  const answer = uploads.answer.bind(null, page.key);
  const cancel = (
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => uploads.cancel(page.key)}>
      Cancel
    </Button>
  );

  return (
    <li className="flex min-w-0 gap-3 px-4 py-3" data-testid="label-upload-waiting-page" data-question={question}>
      <div className="flex h-60 w-40 shrink-0">
        <DocumentPreviewFrame title={`${page.fileName} · page ${page.pageNumber}`} src={labelPdfSrc(page.label.id)} mimeHint="pdf" className="rounded-lg" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="truncate text-role-caption text-text-muted" title={page.fileName}>
          {page.fileName} · page {page.pageNumber}
        </p>

        {question === 'tracking' ? (
          <>
            <p className="text-role-data text-text-default">No tracking number was read from this page.</p>
            <TextField
              label="Tracking number"
              mono
              value={typed}
              onChange={setTyped}
              disabled={busy}
              autoComplete="off"
              trailing={typed.trim() ? <Badge variant={typedCarrier ? 'secondary' : 'outline'}>{typedCarrier ?? 'Carrier not recognised'}</Badge> : null}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" loading={busy && Boolean(page.answers.tracking)} disabled={busy || !typed.trim()} onClick={() => answer({ tracking: typed.trim(), withoutTracking: undefined })}>
                File with tracking
              </Button>
              <Button variant="secondary" size="sm" loading={busy && Boolean(page.answers.withoutTracking)} disabled={busy} onClick={() => answer({ withoutTracking: true, tracking: undefined })}>
                File without tracking
              </Button>
              {cancel}
            </div>
          </>
        ) : null}

        {question === 'collision' ? (
          <>
            <p className="text-role-data text-text-default">
              Tracking <span className="font-mono">{check.tracking}</span> is already on another order.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <OrderFace role="This order" order={check.order} />
              {check.otherOrders.map((other) => (
                <OrderFace key={other.orderId} role="Other order" order={other} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" disabled={busy} loading={busy && page.answers.collision === 'move'} onClick={() => answer({ collision: 'move' })}>
                Move to this order
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} loading={busy && page.answers.collision === 'keep'} onClick={() => answer({ collision: 'keep' })}>
                Keep on both
              </Button>
              {cancel}
            </div>
          </>
        ) : null}

        {question === 'existing' ? (
          <>
            <p className="text-role-data text-text-default">
              This order already ships on a different tracking. This label is <span className="font-mono">{check.tracking}</span>.
            </p>
            <div className="min-w-0">
              <p className="text-role-eyebrow text-text-faint">On this order</p>
              {check.orderTracking.map((tracking) => (
                <RecordFullId key={tracking} value={tracking} label="tracking number" />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" disabled={busy} loading={busy && page.answers.existing === 'replace'} onClick={() => answer({ existing: 'replace' })}>
                Replace
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} loading={busy && page.answers.existing === 'add'} onClick={() => answer({ existing: 'add' })}>
                Add as another box
              </Button>
              {cancel}
            </div>
          </>
        ) : null}

        {check.sameAlready ? <p className="text-role-caption text-text-muted">Already on this order</p> : null}
        {page.error ? <p className="text-role-caption text-rose-700">{page.error}</p> : null}
      </div>
    </li>
  );
}
