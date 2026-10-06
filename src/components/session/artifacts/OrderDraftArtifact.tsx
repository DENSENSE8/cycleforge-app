'use client';

/**
 * The order card — an order drafted in chat (`draft_manual_order`), phone or
 * any sales channel, or just created (`create_manual_order`). Inline, triage
 * face: identity first (order number, customer), then the lines, the facts,
 * and a **Still needed** checklist for the order's channel.
 *
 * Every action is a request, never a write from here:
 *  - Open in form  → `/orders/new?prefill=…`, the SAME field
 *    contract, so the intake form opens with these exact values;
 *  - Create        → a chat turn ("Create this order"), which proposes and
 *    then waits for the operator's yes (confirm-before-write);
 *  - a product / account pick → a chat turn naming it;
 *  - Open order    → the existing order this draft duplicates;
 *  - Take payment  → a chat turn for `request_payment` by order number;
 *  - Open in intake → the created order's caged intake session.
 */

import { useRouter } from 'next/navigation';
import { AlertCircle, Check, ExternalLink, Receipt, Send } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import type { ArtifactOrderDraft } from '@/lib/assistant/ui-artifacts';
import { conditionLabel } from '@/lib/conditions';
import { formatCents, manualOrderTotals, orderChannelKind, orderPrefillHref, stashOrderPrefill } from '@/lib/orders/manual-order-draft';
import { cn } from '@/utils/_cn';

const LABEL = 'text-ai-label text-ai-faint';

function shipByFace(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function OrderDraftArtifact({ artifact }: { artifact: ArtifactOrderDraft }) {
  const router = useRouter();
  const { draft, unresolved, missing, duplicate, channelChoices } = artifact;
  const created = artifact.status === 'created' ? artifact.created : null;
  const c = draft.customer;
  const s = c.shipTo;
  const cityLine = [s.city, [s.state, s.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const address = [s.address1, s.address2, cityLine, s.country && s.country !== 'US' ? s.country : '']
    .filter(Boolean)
    .join(' · ');
  const totals = manualOrderTotals(draft.lines);
  const marketplace = orderChannelKind(draft) === 'marketplace';
  const ready = !created && !duplicate && missing.length === 0 && unresolved.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-3 px-3 py-3 text-ai-prose-sm text-ai-ink" data-order-draft={artifact.status}>
      {/* ── identity ── */}
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-ai-title font-semibold" data-order-number>
            {draft.orderNumber || '—'}
          </span>
          <span className="min-w-0 truncate font-medium">{c.name || (marketplace ? 'Buyer not named yet' : 'Customer not named yet')}</span>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-ai-label font-medium',
            created ? 'text-text-success' : ready ? 'text-ai-ink' : 'text-text-warning',
          )}
        >
          {created ? <Check className="h-3.5 w-3.5" /> : null}
          {created ? 'Created · held for triage' : ready ? 'Ready to create' : 'Draft'}
        </span>
      </div>

      {/* ── customer ── */}
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className={LABEL}>{marketplace ? 'Buyer' : 'Customer'}</dt>
        <dd className="min-w-0">
          {[c.phone, c.email].filter(Boolean).join(' · ') || <span className="text-ai-faint">No contact yet</span>}
          <span className="ml-2 text-ai-label text-ai-faint">
            {artifact.customerMatch === 'existing' ? 'Existing customer' : 'New customer'}
          </span>
        </dd>
        <dt className={LABEL}>Ship to</dt>
        <dd className="min-w-0">{address || <span className="text-ai-faint">No address yet</span>}</dd>
        <dt className={LABEL}>Ship by</dt>
        <dd>
          {draft.shipBy ? shipByFace(draft.shipBy) : <span className="text-ai-faint">Not set</span>}
          {draft.isUrgent ? <span className="ml-2 font-medium text-text-warning">Urgent</span> : null}
        </dd>
        <dt className={LABEL}>Platform</dt>
        <dd className="min-w-0" data-order-channel>
          {draft.channelLabel || draft.channel || <span className="text-ai-faint">Not picked yet</span>}
          {!created && channelChoices.length > 1 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {channelChoices.map((choice) => (
                <Button
                  key={choice.value}
                  type="button"
                  variant="secondary"
                  size="sm"
                  radius="pill"
                  onClick={() => requestComposerSeed({ text: `The channel is ${choice.label}`, autoSend: true })}
                >
                  {choice.label}
                </Button>
              ))}
            </div>
          ) : null}
        </dd>
        {draft.listingUrl ? (
          <>
            <dt className={LABEL}>Listing</dt>
            <dd className="min-w-0 truncate">
              <a href={draft.listingUrl} target="_blank" rel="noreferrer" className="underline decoration-ai-line underline-offset-2">
                {draft.listingUrl.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            </dd>
          </>
        ) : null}
        {marketplace || draft.trackingNumber || draft.buyLabel ? (
          <>
            <dt className={LABEL}>Shipping</dt>
            <dd className="min-w-0" data-order-tracking>
              {draft.trackingNumber ? (
                <span className="font-mono">{draft.trackingNumber}</span>
              ) : draft.buyLabel ? (
                'Buy a label after create'
              ) : (
                <span className="text-ai-faint">No tracking yet</span>
              )}
            </dd>
          </>
        ) : null}
        {draft.parcel ? (
          <>
            <dt className={LABEL}>Parcel</dt>
            <dd className="tabular-nums">
              {[
                draft.parcel.weightOz != null ? `${draft.parcel.weightOz} oz` : null,
                draft.parcel.lengthIn != null && draft.parcel.widthIn != null && draft.parcel.heightIn != null
                  ? `${draft.parcel.lengthIn} × ${draft.parcel.widthIn} × ${draft.parcel.heightIn} in`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </>
        ) : null}
        {draft.buyerNote ? (
          <>
            <dt className={LABEL}>Note</dt>
            <dd className="min-w-0">{draft.buyerNote}</dd>
          </>
        ) : null}
      </dl>

      {/* ── lines ── */}
      <ol className="flex flex-col divide-y divide-ai-line rounded-ai-card border border-ai-line" data-order-lines>
        {draft.lines.map((line, i) => (
          <li key={`${line.sku}-${i}`} className="flex min-w-0 items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="min-w-0 font-medium">{line.title}</p>
              <p className="text-ai-label text-ai-faint">
                {line.sku ? <span className="font-mono">{line.sku}</span> : <span>Not paired to a catalog SKU yet</span>}
                {line.itemNumber ? <span className="font-mono"> · item #{line.itemNumber}</span> : null}
                {line.condition ? ` · ${conditionLabel(line.condition)}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p>
                {line.quantity} ×{' '}
                {line.unitPriceCents == null ? (
                  <span className={marketplace ? 'text-ai-faint' : 'text-text-warning'}>no price</span>
                ) : (
                  formatCents(line.unitPriceCents, draft.currency)
                )}
              </p>
              {line.unitPriceCents != null ? (
                <p className="text-ai-label text-ai-faint">{formatCents(line.unitPriceCents * line.quantity, draft.currency)}</p>
              ) : null}
            </div>
          </li>
        ))}
        {unresolved.map((open, j) => {
          const lineNo = draft.lines.length + j + 1;
          return (
            <li key={`open-${j}`} className="flex min-w-0 flex-col gap-1.5 px-3 py-2" data-order-line-open>
              <p className="min-w-0">
                <span className="font-medium">“{open.query}”</span>
                <span className="ml-2 text-ai-label text-text-warning">
                  {open.candidates.length > 1 ? `${open.candidates.length} products match — pick one` : 'No catalog match'}
                </span>
              </p>
              {open.candidates.length > 1 ? (
                <div className="flex flex-wrap gap-1.5">
                  {open.candidates.map((cand) => (
                    <Button
                      key={cand.skuCatalogId}
                      type="button"
                      variant="secondary"
                      size="sm"
                      radius="pill"
                      onClick={() => requestComposerSeed({ text: `Line ${lineNo} is SKU ${cand.sku}`, autoSend: true })}
                    >
                      <span className="font-mono">{cand.sku}</span>
                      <span className="max-w-[16rem] truncate">{cand.title}</span>
                    </Button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
        {draft.lines.length === 0 && unresolved.length === 0 ? (
          <li className="px-3 py-2 text-ai-faint">No products yet</li>
        ) : null}
      </ol>

      {/* ── totals ── */}
      {totals.priced ? (
        <div className="flex items-baseline justify-between px-1 tabular-nums">
          <span className={LABEL}>Total (shipping and tax not added yet)</span>
          <span className="font-semibold">{formatCents(totals.totalCents, draft.currency)}</span>
        </div>
      ) : null}

      {/* ── already in the system ── */}
      {duplicate && !created ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-ai-card bg-ai-sunken px-3 py-2" data-order-duplicate>
          <span className="flex items-start gap-1.5 text-text-warning">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Order <span className="font-mono">{duplicate.orderNumber}</span> is already in the system
              {duplicate.matchedOn === 'tracking' ? ' with this tracking number' : ''}.
            </span>
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => router.push(`/shipping/orders?triage=${duplicate.orderPk}`)}
            data-open-duplicate
          >
            Open order {duplicate.orderNumber}
          </Button>
        </div>
      ) : null}

      {/* ── still needed ── */}
      {!created && missing.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-ai-card bg-ai-sunken px-3 py-2" data-order-missing>
          <p className={LABEL}>Still needed</p>
          <ul className="flex flex-col gap-0.5">
            {missing.map((m) => (
              <li key={m} className="flex items-start gap-1.5 text-text-warning">
                <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-sm border border-current" />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── actions ── */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {created ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() => router.push(`/shipping/orders?triage=${created.orderIds[0]}`)}
            >
              Open in intake
            </Button>
            {marketplace ? null : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={<Receipt className="h-3.5 w-3.5" />}
                onClick={() =>
                  requestComposerSeed({ text: `Take payment for order ${draft.orderNumber} by payment link`, autoSend: true })
                }
              >
                Take payment
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() => {
                stashOrderPrefill(draft);
                router.push(orderPrefillHref(draft));
              }}
              data-open-in-form
            >
              Open in form
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<Send className="h-3.5 w-3.5" />}
              disabled={!ready}
              title={ready ? undefined : duplicate ? 'This order is already in the system' : 'Fill in what is still needed first'}
              onClick={() => requestComposerSeed({ text: 'Create this order', autoSend: true })}
              data-create-order
            >
              Create
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
