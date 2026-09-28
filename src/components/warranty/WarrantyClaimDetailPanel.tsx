'use client';

/** Warranty claim inspector — Desk-family `RightRailHost` card (`detail:warranty`, non-modal **push**), reached by clicking a row on the… */

import { useEffect, useState } from 'react';
import { Loader2 } from '@/components/Icons';
import { useWarrantyClaim } from '@/hooks/useWarrantyClaims';
import { useWarrantyMutations } from '@/hooks/useWarrantyMutations';
import { WarrantyClockChip, WarrantyStatusBadge } from '@/components/warranty/chips';
import { WarrantyClaimActions } from '@/components/warranty/WarrantyClaimActions';
import { WarrantyTicketButton } from '@/components/warranty/WarrantyTicketPopover';
import { WarrantyQuotesSection } from '@/components/warranty/WarrantyQuotesSection';
import { SourceThisButton } from '@/components/sourcing/SourceThisButton';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import {
  FLOOR_DELETE_PEER_CLASS,
  InspectorActionFloor,
} from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import { EventTimeline } from '@/components/ui/EventTimeline';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import { requestConfirm } from '@/design-system/components/confirm';
import { warrantyEventsToTimeline } from '@/lib/timeline';
import { formatDateTimePST } from '@/utils/date';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import type { WarrantyClaimDetail } from '@/lib/warranty/types';

interface WarrantyClaimDetailPanelProps {
  claimId: number;
  onClose: () => void;
}

/** Leaf body port — one scroll region per leaf, matching the Unfound golden. */
function LeafBody({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>;
}

/** A titled group inside a leaf. Eyebrow role, never a hand-typed `text-xs`. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 text-role-eyebrow text-text-soft">{title}</h3>
      {children}
    </section>
  );
}

function clockBasisLabel(basis: WarrantyClaimDetail['clockBasis']): string | null {
  if (basis === 'DELIVERED') return 'Carrier delivered';
  if (basis === 'PACKED_PLUS_ESTIMATE') return 'Packed + estimate (provisional)';
  return null;
}

export function WarrantyClaimDetailPanel({ claimId, onClose }: WarrantyClaimDetailPanelProps) {
  const { data: claim, isLoading, error } = useWarrantyClaim(claimId);
  const { remove } = useWarrantyMutations();

  /** Index | leaf — opens on Overview; Back → topics. Re-seeds per claim. */
  const [navId, setNavId] = useState<string>('overview');
  useEffect(() => {
    setNavId('overview');
  }, [claimId]);

  const deleteClaim = async () => {
    if (!claim) return;
    const ok = await requestConfirm({
      description: `Delete claim ${claim.claimNumber}? It will disappear from all warranty views (the audit trail is kept).`,
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    remove.mutate({ id: claim.id }, { onSuccess: onClose });
  };

  const identity = claim?.productTitle || claim?.sku || claim?.serialNumber || 'Warranty claim';

  /**
   * Band trailing cluster — the read-only warranty clock, then the ▦ door onto
   * the claims grid's column display. Metric before verb, and both before the
   * host's reserved `⤢ ✕` cell, which the shell appends itself.
   */
  const bandTrailing = (
    <>
      {claim ? (
        <span className="flex h-full items-center pr-1">
          <WarrantyClockChip daysRemaining={claim.daysRemaining} basis={claim.clockBasis} />
        </span>
      ) : null}
    </>
  );

  const leaves: DeskInspectorLeaf[] = claim
    ? [
        {
          id: 'overview',
          label: 'Overview',
          content: (
            <LeafBody>
              {/* Identity in the BODY, not a second header line (2026-08-21). */}
              <div className="mb-5 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-role-caption text-text-primary">
                    {claim.claimNumber}
                  </span>
                  <WarrantyStatusBadge status={claim.status} />
                </div>
                <p className="text-role-caption text-text-soft" title={identity}>
                  {identity}
                </p>
              </div>

              <Group title="Warranty clock">
                <OrderFactList>
                  <OrderFactRow
                    label="Starts"
                    value={claim.warrantyStartsAt ? formatDateTimePST(claim.warrantyStartsAt) : null}
                  />
                  <OrderFactRow
                    label="Expires"
                    value={
                      claim.warrantyExpiresAt ? formatDateTimePST(claim.warrantyExpiresAt) : null
                    }
                  />
                  <OrderFactRow
                    label="Term"
                    value={claim.warrantyDays ? `${claim.warrantyDays} days` : null}
                  />
                  <OrderFactRow label="Basis" value={clockBasisLabel(claim.clockBasis)} />
                  <OrderFactRow
                    label="Delivered"
                    value={claim.deliveredAt ? formatDateTimePST(claim.deliveredAt) : null}
                  />
                  <OrderFactRow
                    label="Packed/scanned"
                    value={claim.packedScannedAt ? formatDateTimePST(claim.packedScannedAt) : null}
                  />
                </OrderFactList>
              </Group>

              <Group title="Purchase proof">
                <OrderFactList>
                  <OrderFactRow
                    label="Purchased"
                    value={claim.purchasedAt ? formatDateTimePST(claim.purchasedAt) : null}
                  />
                  <OrderFactRow
                    label="Proof"
                    value={
                      claim.purchaseProofUrl ? (
                        <a
                          className="text-text-accent underline"
                          href={claim.purchaseProofUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>
                      ) : null
                    }
                  />
                </OrderFactList>
              </Group>

              {(claim.denialReasonCode || claim.denialNotes) && (
                <Group title="Denial">
                  <OrderFactList cols={1}>
                    <OrderFactRow label="Reason code" value={claim.denialReasonCode} />
                    <OrderFactRow label="Notes" value={claim.denialNotes} />
                  </OrderFactList>
                </Group>
              )}

              <WarrantyClaimActions claim={claim} />
            </LeafBody>
          ),
        },
        {
          id: 'subject',
          label: 'Subject',
          content: (
            <LeafBody>
              <Group title="Subject">
                <OrderFactList>
                  <OrderFactRow label="Serial" value={claim.serialNumber} mono />
                  <OrderFactRow label="SKU" value={claim.sku} mono />
                  <OrderFactRow label="Order" value={claim.orderId ?? claim.sourceOrderId} mono />
                  <OrderFactRow label="Source" value={claim.sourceSystem} />
                  <OrderFactRow label="Customer" value={claim.customerName} />
                  <OrderFactRow label="Tracking" value={claim.sourceTrackingNumber} mono span />
                </OrderFactList>
              </Group>

              <Group title="Linked">
                <OrderFactList>
                  <OrderFactRow label="RMA" value={claim.rmaNumber} mono />
                  <OrderFactRow label="Repair ticket" value={claim.repairTicket} mono />
                  <OrderFactRow
                    label="Support ticket"
                    value={
                      claim.zendeskTicketId != null && zendeskTicketUrl(claim.zendeskTicketId) ? (
                        <a
                          className="text-text-accent underline"
                          href={zendeskTicketUrl(claim.zendeskTicketId) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                        >
                          #{claim.zendeskTicketId}
                        </a>
                      ) : null
                    }
                  />
                </OrderFactList>
              </Group>
            </LeafBody>
          ),
        },
        {
          id: 'repairs',
          label: `Repairs (${claim.repairAttempts.length})`,
          content: (
            <LeafBody>
              <Group title="Repair attempts">
                {claim.repairAttempts.length === 0 ? (
                  <p className="text-role-caption text-text-faint">No repair attempts logged.</p>
                ) : (
                  <ul className="divide-y divide-border-hairline">
                    {claim.repairAttempts.map((a) => (
                      <li key={a.id} className="py-2 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-role-caption font-semibold text-text-muted">
                            Attempt #{a.attemptNo}
                          </span>
                          {a.outcome && (
                            <span className="text-role-micro text-text-soft">
                              {a.outcome}
                            </span>
                          )}
                        </div>
                        {a.diagnosis && (
                          <p className="mt-1 text-role-caption text-text-muted">{a.diagnosis}</p>
                        )}
                        {a.notes && (
                          <p className="mt-1 text-role-micro text-text-soft">{a.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Group>

              {claim.quotes.length > 0 && (
                <Group title={`Paid-repair quotes (${claim.quotes.length})`}>
                  <WarrantyQuotesSection claimId={claim.id} quotes={claim.quotes} />
                </Group>
              )}
            </LeafBody>
          ),
        },
        {
          id: 'timeline',
          label: 'Timeline',
          content: (
            <LeafBody>
              <EventTimeline
                items={warrantyEventsToTimeline(claim.events)}
                density="compact"
                highlightLatest={false}
                emptyMessage="No events yet."
              />
            </LeafBody>
          ),
        },
        {
          id: 'conversation',
          label: 'Conversation',
          content: (
            <LeafBody>
              {claim.notes && (
                <p className="mb-3 whitespace-pre-wrap border border-border-hairline bg-surface-sunken px-3 py-2 text-role-caption text-text-muted">
                  {claim.notes}
                </p>
              )}
              <ThreadPanel entityType="WARRANTY_CLAIM" entityId={claim.id} dense />
            </LeafBody>
          ),
        },
      ]
    : [];

  return (
    // STABLE occupant id: the claims grid is walked row by row, so a per-claim
    // id would play exit → empty → enter on every step. The caller re-keys this
    // component per claim, so every editor re-seeds on the swap.
    <DetailStackRailRegistrar
      id="detail:warranty"
      onClose={onClose}
      modal={false}
      ariaLabel={`Warranty claim ${claim?.claimNumber ?? ''} details`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* ONE band, and it is the TOP row — the host paints `⤢ ✕` absolutely at `top-0 right-0`, so anything above the band would sit under them. */}
        {claim ? (
          <DeskInspectorIndexShell
            stance="index"
            title="Claim"
            headerRightSlot={bandTrailing}
            leaves={leaves}
            activeId={navId}
            onActiveIdChange={setNavId}
            defaultActiveId="overview"
            ariaLabel="Warranty claim topics"
            testId="warranty-inspector-index"
            backLabel="Back to topics"
          />
        ) : (
          // No claim yet (loading / error / gone) — there is still no index
          // above this rail's states, so the band declares itself standalone
          // rather than painting a chevron that goes nowhere.
          <DeskInspectorIndexShell
            stance="standalone"
            title="Claim"
            headerRightSlot={bandTrailing}
            ariaLabel="Warranty claim"
            testId="warranty-inspector-index"
            body={
              isLoading ? (
                <div className="flex flex-1 items-center justify-center gap-2 py-10 text-role-caption text-text-faint">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : error ? (
                <div className="m-5 border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-text-danger">
                  {error instanceof Error ? error.message : 'Failed to load claim.'}
                </div>
              ) : (
                <div className="m-5 border border-dashed border-border-soft bg-surface-sunken px-4 py-6 text-center text-role-caption text-text-faint">
                  Claim not found.
                </div>
              )
            }
          />
        )}

        {/* The delete error belongs beside the control that produced it — and
            above the band it would have pushed the host's window controls off
            the top row. */}
        {remove.isError && (
          <p className="shrink-0 border-t border-border-danger bg-surface-danger px-5 py-2 text-role-caption text-text-danger">
            {remove.error instanceof Error ? remove.error.message : 'Delete failed.'}
          </p>
        )}

        {claim && (
          <InspectorActionFloor>
            {claim.productTitle || claim.sku ? (
              <SourceThisButton
                searchQuery={claim.productTitle || claim.sku}
                label="Source"
                variant="ghost"
              />
            ) : null}
            <WarrantyTicketButton claimId={claim.id} linked={claim.zendeskTicketId != null} />
            <InspectorFlushDelete
              isArmed={false}
              isDeleting={remove.isPending}
              onClick={() => void deleteClaim()}
              label="Delete claim"
              confirmLabel="Click again to confirm delete"
              data-testid="warranty-details-delete"
              className={FLOOR_DELETE_PEER_CLASS}
            />
          </InspectorActionFloor>
        )}
      </div>
    </DetailStackRailRegistrar>
  );
}
