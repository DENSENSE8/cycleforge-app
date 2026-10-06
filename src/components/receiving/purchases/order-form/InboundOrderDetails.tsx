'use client';

/**
 * The right third of the inbound-order form — the live "Details" that
 * confirm what was typed before it lands: identity (platform + full order #),
 * type, what priority resolves to, vendor, dates, every tracking number, each
 * item (qty × unit price, condition, photos, listing serials) and the total,
 * the "Still needed" checklist, the server's dry run (what landing creates or
 * updates) — and the one submit. Delete stays for an order entered by mistake.
 */

import { useState, type ReactNode } from 'react';
import { Button } from '@/design-system/primitives';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { conditionLabel } from '@/lib/conditions';
import { deleteInboundOrderRequest } from '@/lib/inbound/inbound-order-client';
import {
  formatInboundMoney,
  inboundAutoPriorityLabel,
  inboundLineName,
  inboundLineTotalCents,
  inboundOrderCostTotal,
  inboundPriorityChoices,
} from '@/lib/inbound/inbound-order-compose';
import {
  canonicalInboundTracking,
  filledInboundLines,
  INBOUND_ORDER_TYPE_LABELS,
  INBOUND_PRIORITY_AUTO,
} from '@/lib/inbound/inbound-order-draft';
import { useInboundPlatformChoices } from '@/lib/inbound/use-inbound-platform-choices';
import type { InboundOrderFormModel } from '@/lib/inbound/use-inbound-order-form';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { formatDateKeyMedium } from '@/utils/date';

function Block({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-mode-divide px-4 py-3 last:border-b-0" data-testid={testId}>
      <h3 className={cn(RECORD_LABEL_CLASS, 'text-text-muted')}>{label}</h3>
      {children}
    </section>
  );
}

function Fact({ name, children, mono = false }: { name: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-role-caption">
      <span className="w-24 shrink-0 text-text-muted">{name}</span>
      <span className={cn('min-w-0 flex-1 break-words text-text-default', mono && RECORD_ID_CLASS)}>{children}</span>
    </div>
  );
}

const Unsaid = ({ children = '—' }: { children?: ReactNode }) => <span className="text-text-muted">{children}</span>;

export function InboundOrderDetails({ form, onCancel }: { form: InboundOrderFormModel; onCancel: () => void }) {
  const { draft, missing, preview, previewing, record, submitting, error } = form;
  const platforms = useInboundPlatformChoices();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const platformLabel = platforms.find((p) => p.value === draft.platform)?.label ?? (draft.platform || null);
  const typeLabel = INBOUND_ORDER_TYPE_LABELS[draft.type];
  const priority =
    draft.priority === INBOUND_PRIORITY_AUTO
      ? inboundAutoPriorityLabel(draft.platform, platformLabel)
      : (inboundPriorityChoices().find((c) => c.value === draft.priority)?.label ?? draft.priority);
  const tracking = preview?.tracking ?? canonicalInboundTracking(draft).map((t) => ({ ...t, cartonId: null, otherOrder: null }));
  const filled = new Set(filledInboundLines(draft));
  const lines = draft.lines.map((line, index) => ({ line, index })).filter(({ line }) => filled.has(line));
  // Unchanged content still lands new listing photos on the order's lines.
  const photosHeld = form.photos.some((p) => p.length > 0);
  const cost = inboundOrderCostTotal(draft);
  const existing = preview?.existing ?? null;
  const created = preview?.lines.filter((l) => l.action === 'create').length ?? 0;
  const updated = preview?.lines.filter((l) => l.action === 'update').length ?? 0;

  const remove = async () => {
    if (!existing) return;
    setDeleting(true);
    try {
      const result = await deleteInboundOrderRequest(existing.inboundOrderId);
      toast.success(`Deleted inbound order ${existing.inboundOrderId} · ${result.deletedLineIds.length} line(s)`);
      setConfirmDelete(false);
      form.refreshPreview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={DESK_RECORD_COLUMN_CARD_CLASS} data-testid="inbound-order-details">
      <Block label="Details">
        <Fact name="Type">{typeLabel}</Fact>
        <Fact name="Platform">{platformLabel ?? <Unsaid />}</Fact>
        <Fact name="Order #" mono={Boolean(draft.orderNumber.trim())}>
          {draft.orderNumber.trim() || <Unsaid />}
        </Fact>
        <Fact name="Priority">{priority}</Fact>
        <Fact name={draft.type === 'RETURN' ? 'Buyer' : 'Vendor'}>{draft.vendor.trim() || <Unsaid />}</Fact>
        <Fact name="Ordered">{draft.orderDate ? formatDateKeyMedium(draft.orderDate) : <Unsaid />}</Fact>
        <Fact name="Expected">{draft.expectedDate ? formatDateKeyMedium(draft.expectedDate) : <Unsaid />}</Fact>
        {draft.type === 'RETURN' ? (
          <>
            <Fact name="Reason">{draft.returnReason.trim() || <Unsaid>No return reason yet</Unsaid>}</Fact>
            <Fact name="RMA #" mono={Boolean(draft.rmaId.trim())}>
              {draft.rmaId.trim() || <Unsaid />}
            </Fact>
          </>
        ) : null}
      </Block>

      <Block label={`Tracking · ${tracking.length}`} testId="inbound-details-tracking">
        {tracking.length === 0 ? (
          <p className="text-role-caption text-text-warning">No tracking yet — no carton is made, so a door scan cannot open this order.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {tracking.map((t) => (
              <li key={t.number} className="flex flex-wrap items-baseline gap-x-2 text-role-caption">
                <span className={cn(RECORD_ID_CLASS, 'text-text-default')}>{t.number}</span>
                <span className={t.otherOrder ? 'text-text-warning' : 'text-text-muted'}>
                  {t.otherOrder ? `already on ${t.otherOrder} — joins that carton` : t.cartonId ? `${t.carrier} · carton ${t.cartonId}` : `${t.carrier || 'Carrier unknown'} · new carton`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block label={`Items · ${lines.length}`} testId="inbound-details-items">
        {lines.length === 0 ? (
          <Unsaid>No item yet</Unsaid>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map(({ line, index }) => {
              const photoCount = (form.photos[index]?.length ?? 0) + form.landedPhotos(line).length;
              const serials = line.listingSerials ?? [];
              return (
                <li key={index} className="flex flex-col gap-0.5 text-role-caption">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 break-words font-medium text-text-default">{inboundLineName(line)}</span>
                    <span className={cn(RECORD_ID_CLASS, 'shrink-0 text-text-default')}>{formatInboundMoney(inboundLineTotalCents(line), draft.currency)}</span>
                  </div>
                  <span className="text-text-muted">
                    {line.quantity ?? '?'} × {formatInboundMoney(line.unitCostCents, draft.currency)}
                    {' · '}
                    {line.conditionGrade ? conditionLabel(line.conditionGrade, 'option') : 'Condition not said'}
                    {' · '}
                    {photoCount} photo{photoCount === 1 ? '' : 's'}
                  </span>
                  {serials.length ? <span className={cn(RECORD_ID_CLASS, 'break-all text-text-muted')}>Serials: {serials.join(', ')}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-baseline gap-2 border-t border-mode-divide pt-2 text-role-caption">
          <span className="flex-1 text-text-muted">Order total</span>
          <span className={cn(RECORD_ID_CLASS, 'text-text-default')}>{formatInboundMoney(cost.subtotalCents, draft.currency)}</span>
        </div>
        {cost.missingCost ? (
          <p className="text-role-caption text-text-warning">
            {cost.missingCost} item{cost.missingCost === 1 ? '' : 's'} without a price
          </p>
        ) : null}
      </Block>

      <Block label={missing.length ? 'Still needed' : 'Ready'} testId="inbound-details-missing">
        {missing.length === 0 ? (
          <p className="text-role-caption text-text-success">Everything receiving needs is here.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {missing.map((need) => (
              <li key={need.field} className="flex items-center gap-2 text-role-caption text-text-warning">
                <span className="size-1.5 shrink-0 rounded-mode-pill bg-text-warning" aria-hidden />
                {need.label}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block label={previewing ? 'Landing will · checking…' : 'Landing will'} testId="inbound-details-preview">
        {!preview ? (
          <p className="text-role-caption text-text-muted">Type the order number or an item to see what lands.</p>
        ) : preview.unchanged ? (
          <p className="text-role-caption text-text-success">Already landed exactly like this — saving again changes nothing.</p>
        ) : (
          <>
            <p className="text-role-caption text-text-default">
              {existing ? `Update inbound order ${existing.inboundOrderId}` : 'Create a new inbound order'} · {created} new line{created === 1 ? '' : 's'}
              {updated ? `, ${updated} updated` : ''}
            </p>
            {preview.untouchedLineKeys.length > 0 ? (
              <p className="text-role-caption text-text-warning">Kept as they are (not in this form): {preview.untouchedLineKeys.join(', ')}</p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {preview.lines.map((l) => (
                <li key={l.lineKey} className="flex gap-2 text-role-caption">
                  <span className={cn(RECORD_ID_CLASS, 'w-10 shrink-0 text-text-muted')}>{l.lineKey}</span>
                  <span className={cn('min-w-0 flex-1 break-words', l.catalog ? 'text-text-default' : 'text-text-warning')}>
                    {l.catalog ? `${l.catalog.sku} · ${l.catalog.title}` : 'Not in the catalog — lands by its text'}
                  </span>
                </li>
              ))}
            </ul>
            {preview.sameNumberElsewhere.length ? (
              <p className="text-role-caption text-text-warning">
                The same number exists as{' '}
                {preview.sameNumberElsewhere
                  .map((o) => `${o.sourceType}${o.sourcePlatform !== 'none' ? `/${o.sourcePlatform}` : ''} (order ${o.inboundOrderId})`)
                  .join(', ')}{' '}
                — a different order.
              </p>
            ) : null}
          </>
        )}
      </Block>

      {existing && existing.receivedLines === 0 && !record ? (
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
        {record?.refusal ? <p className="text-role-caption text-text-warning">{record.refusal}</p> : null}
        {error ? (
          <p role="alert" className="text-role-caption text-text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={missing.length > 0 || submitting || (Boolean(preview?.unchanged) && !photosHeld) || record?.refusal != null}
            title={missing.length ? `Still needed: ${missing.map((m) => m.label).join(', ')}` : 'Add (⌘ Enter)'}
            className="flex-[2]"
            data-testid="inbound-order-submit"
          >
            {record || existing ? `Update ${typeLabel.toLowerCase()}` : `Add ${typeLabel.toLowerCase()}`}
          </Button>
        </div>
      </footer>
    </div>
  );
}
