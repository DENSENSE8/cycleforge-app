'use client';

/**
 * Right third of the inbound-order form: the order's CycleForge identity and
 * what landing it will do, from the server's dry run of the exact draft — plus
 * the submit, and delete for an order already entered by mistake. A return
 * shows what the unboxer will see (reason, RMA, listing); a purchase order its
 * cost total.
 */

import { useState, type ReactNode } from 'react';
import { ExternalLink } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { INBOUND_SOURCE_LABELS, type InboundSourceType } from '@/lib/inbound/source-registry';
import {
  canonicalInboundTracking,
  filledInboundLines,
  inboundOrderIdentity,
  INBOUND_ORDER_TYPE_LABELS,
  type InboundOrderDraft,
  type InboundOrderNeed,
} from '@/lib/inbound/inbound-order-draft';
import { deleteInboundOrderRequest } from '@/lib/inbound/inbound-order-client';
import type { InboundOrderPreview } from '@/lib/inbound/ingest-inbound-order';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { formatInboundMoney, inboundOrderCostTotal, openableListingUrl } from '@/lib/inbound/inbound-order-compose';

interface OutcomeProps {
  draft: InboundOrderDraft;
  missing: readonly InboundOrderNeed[];
  preview: InboundOrderPreview | null;
  previewing: boolean;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onDeleted: () => void;
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-border-hairline px-4 py-3 last:border-b-0">
      <h3 className={cn(RECORD_LABEL_CLASS, 'text-text-muted')}>{label}</h3>
      {children}
    </section>
  );
}

function Fact({ name, value, mono = false }: { name: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-role-caption">
      <span className="w-24 shrink-0 text-text-muted">{name}</span>
      <span className={cn('min-w-0 flex-1 break-words text-text-default', mono && RECORD_ID_CLASS)}>{value}</span>
    </div>
  );
}

function Note({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: ReactNode }) {
  return (
    <p className={cn('text-role-caption', tone === 'warn' ? 'text-amber-700' : tone === 'ok' ? 'text-emerald-700' : 'text-text-muted')}>
      {children}
    </p>
  );
}

export function InboundOrderOutcome({ draft, missing, preview, previewing, submitting, error, onCancel, onDeleted }: OutcomeProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const identity = draft.platform.trim() && draft.orderNumber.trim() ? inboundOrderIdentity(draft) : null;
  const tracking = canonicalInboundTracking(draft);
  const existing = preview?.existing ?? null;
  const created = preview?.lines.filter((l) => l.action === 'create').length ?? 0;
  const updated = preview?.lines.filter((l) => l.action === 'update').length ?? 0;
  const typeLabel = INBOUND_ORDER_TYPE_LABELS[draft.type];
  const cost = draft.type === 'PO' ? inboundOrderCostTotal(draft) : null;
  const returnedListing = draft.type === 'RETURN' ? (filledInboundLines(draft)[0] ?? draft.lines[0]).listingUrl.trim() : '';
  const returnedListingHref = openableListingUrl(returnedListing);

  const remove = async () => {
    if (!existing) return;
    setDeleting(true);
    try {
      const r = await deleteInboundOrderRequest(existing.inboundOrderId);
      toast.success(`Deleted order ${existing.inboundOrderId} · ${r.deletedLineIds.length} line(s)`);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col" data-testid="inbound-order-outcome">
      <Block label="Identity">
        {identity ? (
          <>
            <Fact name="Type" value={typeLabel} />
            <Fact
              name="Source"
              value={`${INBOUND_SOURCE_LABELS[identity.sourceType as InboundSourceType]}${identity.sourcePlatform !== 'none' ? ` · ${identity.sourcePlatform}` : ''}`}
            />
            <Fact name="Order #" value={identity.externalOrderIdNorm} mono />
            <Fact name="CycleForge" value={existing ? `inbound order ${existing.inboundOrderId} (${existing.status})` : 'new inbound order'} mono={Boolean(existing)} />
          </>
        ) : (
          <Note tone="info">Platform and order number make the order&apos;s identity.</Note>
        )}
      </Block>

      {draft.type === 'RETURN' ? (
        <Block label="At unbox">
          <Note tone="info">What staff see when they open the box — confirm it before adding.</Note>
          <Fact name="Reason" value={draft.returnReason.trim() || <span className="text-amber-700">No return reason yet</span>} />
          <Fact name="RMA" value={draft.rmaId.trim() || '—'} mono={Boolean(draft.rmaId.trim())} />
          <Fact
            name="Listing"
            value={
              returnedListingHref ? (
                <a
                  href={returnedListingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn('inline-flex max-w-full items-center gap-1 underline underline-offset-2', focusRing('control'))}
                >
                  <span className="truncate">{new URL(returnedListingHref).host}</span>
                  <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
                </a>
              ) : returnedListing ? (
                <span className="text-amber-700">Not a web link — {returnedListing}</span>
              ) : (
                <span className="text-amber-700">No listing link yet</span>
              )
            }
          />
        </Block>
      ) : null}

      {cost ? (
        <Block label="Cost">
          <Fact
            name="Total"
            value={
              <>
                <span className={RECORD_ID_CLASS}>{formatInboundMoney(cost.subtotalCents, draft.currency)}</span>
                {cost.missingCost ? (
                  <span className="text-amber-700">
                    {' '}
                    · {cost.missingCost} line{cost.missingCost === 1 ? '' : 's'} missing cost
                  </span>
                ) : null}
              </>
            }
          />
        </Block>
      ) : null}

      <Block label={missing.length ? 'Still needed' : 'Ready'}>
        {missing.length === 0 ? (
          <Note tone="ok">Everything receiving needs is here.</Note>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {missing.map((m) => (
              <li key={m.field} className="text-role-caption text-amber-700">• {m.label}</li>
            ))}
          </ul>
        )}
      </Block>

      <Block label={previewing ? 'What it will do · checking…' : 'What it will do'}>
        {!preview ? (
          <Note tone="info">Fill the order number or an item to see what lands.</Note>
        ) : preview.unchanged ? (
          <Note tone="ok">Already on Incoming exactly like this — adding it again changes nothing.</Note>
        ) : (
          <>
            <Note tone="info">
              {existing ? `Updates inbound order ${existing.inboundOrderId}` : 'Creates a new inbound order'} ·{' '}
              {created} new line{created === 1 ? '' : 's'}
              {updated ? `, ${updated} updated` : ''}
            </Note>
            {preview.untouchedLineKeys.length > 0 ? (
              <Note tone="warn">Kept as they are (not in this form): {preview.untouchedLineKeys.join(', ')}</Note>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {preview.lines.map((l) => (
                <li key={l.lineKey} className="flex gap-2 text-role-caption">
                  <span className={cn(RECORD_ID_CLASS, 'w-10 shrink-0 text-text-muted')}>{l.lineKey}</span>
                  <span className={cn('min-w-0 flex-1 truncate', l.catalog ? 'text-text-default' : 'text-amber-700')}>
                    {l.catalog ? `${l.catalog.sku} · ${l.catalog.title}` : 'Not in the catalog — lands by its text'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Block>

      <Block label="Arrival">
        {tracking.length === 0 ? (
          <Note tone="warn">No tracking yet — no carton is made, so a door scan cannot open this order until one is added.</Note>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {(preview?.tracking ?? tracking.map((t) => ({ ...t, cartonId: null, otherOrder: null }))).map((t) => (
              <li key={t.number} className="text-role-caption">
                <span className={cn(RECORD_ID_CLASS, 'text-text-default')}>{t.number}</span>{' '}
                <span className={t.otherOrder ? 'text-amber-700' : 'text-text-muted'}>
                  {t.otherOrder
                    ? `already on ${t.otherOrder} — joins that carton`
                    : t.cartonId
                      ? `carton ${t.cartonId}`
                      : `${t.carrier || 'carrier'} · new carton; its scan opens this order`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {preview?.sameNumberElsewhere.length ? (
          <Note tone="warn">
            The same number exists as{' '}
            {preview.sameNumberElsewhere.map((o) => `${o.sourceType}${o.sourcePlatform !== 'none' ? `/${o.sourcePlatform}` : ''} (order ${o.inboundOrderId})`).join(', ')} — a different order.
          </Note>
        ) : null}
      </Block>

      {existing && existing.receivedLines === 0 ? (
        <Block label="Entered by mistake?">
          {confirmDelete ? (
            <div className="flex gap-2">
              <Button variant="danger" size="sm" loading={deleting} onClick={() => void remove()}>
                Delete order {existing.inboundOrderId}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete inbound order {existing.inboundOrderId}
            </Button>
          )}
        </Block>
      ) : null}

      <footer className="flex flex-col gap-2 px-4 py-3">
        {error ? <p role="alert" className="text-role-caption text-rose-700">{error}</p> : null}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={missing.length > 0 || submitting || Boolean(preview?.unchanged)}
            className="flex-[2]"
          >
            {existing ? `Update ${typeLabel.toLowerCase()}` : `Add ${typeLabel.toLowerCase()}`}
          </Button>
        </div>
      </footer>
    </div>
  );
}
