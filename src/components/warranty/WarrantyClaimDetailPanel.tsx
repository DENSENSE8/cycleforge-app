'use client';

/**
 * Warranty claim inspector — Desk-family `RightRailHost` card (`detail:warranty`,
 * non-modal **push**), reached by clicking a row on the claims grid.
 *
 * Stack (chrome → identity → index|leaf → floor), the Unfound / History shape:
 *   1. `[→|] …………………………` — navigation only ({@link DeskRailChromeRow})
 *   2. status + clock chips over the claim number
 *   3. {@link DeskInspectorIndexShell} — Overview · Subject · Repairs ·
 *      Timeline · Conversation
 *   4. {@link InspectorActionFloor} — Source · Ticket, flush trailing Delete
 *
 * `WarrantyClaimActions` (deny / repair / quote / RMA forms) sits under the
 * Overview leaf rather than on the floor: the floor is icons-first and terminal,
 * and those are multi-field forms. Same placement Orders uses for
 * `OrderUpdateDock` under its Order leaf.
 *
 * ## What this replaced, and why it was worth replacing
 *
 * Until 2026-08-10 this was a page-local right-edge column mounted straight into
 * `WarrantyWorkspace`: `w-[420px] shrink-0 border-l … shadow-xl`, wrapped in an
 * `AnimatePresence` keyed on the claim id, sliding in on a spring `x: 420`.
 * Every one of those is a documented ban:
 *
 * - a **private** `w-[420px]` right-edge element is precisely what
 *   `src/lib/right-rail/store.ts` exists to prevent — it could sit beside a
 *   `RightRailHost` occupant, giving the work surface two right columns;
 * - the per-claim `key` played exit → empty → enter on every step, the defect
 *   the "stable occupant id" rule names for queue-walk inspectors;
 * - a **spring** on a width its siblings lay out against rubber-bands the work
 *   surface (`push.rail` must stay a tween), and an `x` translate slides the
 *   column out of the slot it just reserved;
 * - the shell re-typed the card recipe by hand and reached for `shadow-xl`
 *   instead of `elevationClass`;
 * - and it had no resize, no park, and no `→|`.
 *
 * It survived because nothing could see it: "this table has no inspector" and
 * "this table has a hand-rolled one" looked identical from the outside. The
 * binding now declares `recordPlane: { kind: 'inspector', occupantId:
 * 'detail:warranty' }`, and the union has no arm that can describe a fork.
 */

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
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
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
import { PaneHeaderLabel } from '@/components/ui/pane-header';
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
      <h3 className="mb-2 text-role-eyebrow uppercase tracking-widest text-text-soft">{title}</h3>
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

  const leaves: DeskInspectorLeaf[] = claim
    ? [
        {
          id: 'overview',
          label: 'Overview',
          content: (
            <LeafBody>
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
                            <span className="text-role-micro uppercase tracking-widest text-text-soft">
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
        <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow onClose={onClose} closeTitle="Close claim" />
          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <PaneHeaderLabel
              eyebrow={
                claim ? (
                  <span className="inline-flex items-center gap-1.5">
                    <WarrantyStatusBadge status={claim.status} />
                    <WarrantyClockChip
                      daysRemaining={claim.daysRemaining}
                      basis={claim.clockBasis}
                    />
                  </span>
                ) : (
                  'WARRANTY'
                )
              }
              value={claim?.claimNumber ?? '—'}
              valueTitle={identity}
            />
          </div>
        </div>

        {remove.isError && (
          <p className="shrink-0 border-b border-border-danger bg-surface-danger px-5 py-2 text-role-caption text-text-danger">
            {remove.error instanceof Error ? remove.error.message : 'Delete failed.'}
          </p>
        )}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-role-caption text-text-faint">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="m-5 border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-text-danger">
            {error instanceof Error ? error.message : 'Failed to load claim.'}
          </div>
        ) : !claim ? (
          <div className="m-5 border border-dashed border-border-soft bg-surface-sunken px-4 py-6 text-center text-role-caption text-text-faint">
            Claim not found.
          </div>
        ) : (
          <DeskInspectorIndexShell
            leaves={leaves}
            activeId={navId}
            onActiveIdChange={setNavId}
            defaultActiveId="overview"
            ariaLabel="Warranty claim topics"
            testId="warranty-inspector-index"
            backLabel="Back to topics"
          />
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
