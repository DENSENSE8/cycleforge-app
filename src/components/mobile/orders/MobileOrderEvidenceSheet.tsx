'use client';

/**
 * The phone's evidence column — the desk ledger's `OutboundOrderEvidence` as a
 * bottom sheet (HANDOFF Step 3: "bottom sheet for evidence"). Opened by
 * tapping a {@link MobileOrderRecord} on `/m/orders?display=ledger`.
 *
 * Top to bottom: state strip (code · word · next) → the thing (photo, title
 * linked to the listing, SKU, item #) → FLOOR verbs (Pick → `/m/pick/[id]`,
 * Pack → `/m/pack/start/[id]`; the next step's verb is ink-filled) → order
 * verbs (pass pick, urgent, hold, listing, photos, documents, details) → the
 * fact list. Everything the record dropped for width lives here, so the owner
 * can test which facts earn a place back on the row (owner 2026-09-24).
 */

import { useRouter } from 'next/navigation';
import { type ReactNode } from 'react';
import { ExternalLink } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_PRICE_CLASS,
  recordStateCodeClass,
} from '@/design-system/tokens/industrial-record';
import { LIFECYCLE, LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { conditionGradeTableLabel } from '@/lib/conditions';
import { formatShipByFace } from '@/lib/orders/ship-by-face';
import {
  resolveOutboundPriorityAction,
  type OutboundPriorityAction,
  type OutboundTriageActionId,
} from '@/lib/shipping/outbound-workflow-actions';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { mobileRecordFacts, type MobileRecordRow } from '@/lib/work-orders/mobile-record-facts';
import { toShipPackerLabel, toShipPickerLabel } from '@/lib/work-orders/to-ship-assignment';
import { useOrderChannel } from '@/hooks/useCatalog';
import { BuyerNoteBlock } from '@/design-system/components/RecordNoteSlot';
import { cn } from '@/utils/_cn';

/** A 48px floor cell — square, flush, 1px edges shared with its neighbours. */
const VERB = cn(
  'ds-raw-button flex min-h-12 items-center justify-center gap-2 border-b border-r border-mode-edge px-3',
  RECORD_LABEL_CLASS,
  'disabled:opacity-40',
  focusRing('cell'),
);

function Verb({
  children,
  onClick,
  active = false,
  disabled = false,
  testId,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(VERB, active ? 'bg-mode-ink text-mode-bar' : 'bg-mode-panel text-mode-ink active:bg-mode-hover')}
    >
      {children}
    </button>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 min-w-0 items-center border-b border-mode-edge">
      <dt className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted')}>{label}</dt>
      <dd className="min-w-0 flex-1 text-role-data text-mode-ink">{children}</dd>
    </div>
  );
}

function Assignee({ staffId, name, colorHex }: { staffId: number | null; name: string | null; colorHex?: string | null }) {
  if (!staffId && !name) return <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Unassigned</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <StaffAvatar staffId={staffId} name={name} colorHex={colorHex} size="xs" shape="square" alt="" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function MobileOrderEvidenceSheet({
  row,
  blocked,
  todayKey,
  resolveName,
  onClose,
  onPassPick,
  onPriorityAction,
  onHold,
  onTriage,
  onOpenPhotos,
  onOpenDocuments,
  onOpenDetail,
}: {
  row: MobileRecordRow | null;
  blocked: boolean;
  todayKey: string;
  resolveName: (id: number) => string;
  onClose: () => void;
  onPassPick: (row: MobileRecordRow) => void;
  onPriorityAction: (row: MobileRecordRow, action: OutboundPriorityAction) => void;
  onHold: (row: MobileRecordRow) => void;
  /** Exception triage — the queue's typed commands (damaged · discrepancy). */
  onTriage: (row: MobileRecordRow, action: OutboundTriageActionId) => void;
  onOpenPhotos: (row: MobileRecordRow) => void;
  onOpenDocuments: (row: MobileRecordRow) => void;
  onOpenDetail: (row: MobileRecordRow) => void;
}) {
  const router = useRouter();
  const resolveOrderChannel = useOrderChannel();
  if (!row) return null;

  const facts = mobileRecordFacts(row, { blocked, todayKey });
  const channel = resolveOrderChannel(row.orderId, row.accountSource);
  const spec = LIFECYCLE[facts.state];
  const location = formatOutboundStoragePath(row.storageLocations);
  const listingHref = getExternalUrlByItemNumber(row.itemNumber || row.sku);
  const priority = resolveOutboundPriorityAction(Boolean(row.isUrgent));
  const picker = toShipPickerLabel(row, resolveName);
  const packer = toShipPackerLabel(row, resolveName);
  // The verb the next step names is the one the eye should land on.
  const nextVerb = /pack/i.test(facts.next.label) ? 'pack' : /pick|label/i.test(facts.next.label) ? 'pick' : null;
  const allocated = row.allocatedUnitCount ?? 0;
  const picked = row.pickedUnitCount ?? 0;

  return (
    <BottomSheet open onClose={onClose} forceVariant="sheet" title={`Order ${facts.orderLabel}`} scrollBody>
      {/* BottomSheet portals out of the page's region; re-declare industrial. */}
      <ModeRegion mode="industrial" className="-mx-6 -mb-6 min-h-0 flex-1 overflow-y-auto overscroll-contain bg-mode-bar text-mode-ink" data-testid="mobile-order-evidence">
        <div
          className="flex min-h-12 items-center gap-2 border-y border-mode-ink px-4"
        >
          <span aria-hidden className={cn('h-2 w-2 shrink-0', LIFECYCLE_CLASSES[facts.state].dot)} />
          <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(spec))}>
            {spec.code} · {spec.label}
          </span>
          <span
            className={cn(
              RECORD_LABEL_CLASS,
              'ml-auto',
              facts.next.blocked ? LIFECYCLE_CLASSES.outOfStock.text : 'text-mode-ink',
            )}
          >
            {facts.next.label}
          </span>
        </div>
        {/* The buyer note is read before the item is pulled: top of the sheet. */}
        <BuyerNoteBlock note={row.buyerNote ?? null} />

        {/* The high-resolution image the row's 32px thumbnail stands in for;
            tap it for every photo of this item # + SKU. */}
        <button
          type="button"
          aria-label="All photos"
          data-testid="mobile-evidence-photos"
          onClick={() => onOpenPhotos(row)}
          className={cn(
            'ds-raw-button relative flex aspect-[4/3] max-h-72 w-full items-center justify-center overflow-hidden border-b border-mode-ink bg-mode-well',
            focusRing('cell'),
          )}
        >
          {row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- catalog CDN image
            <img src={row.imageUrl} alt="" className="h-full w-full object-contain" draggable={false} />
          ) : (
            <span aria-hidden className="font-mono text-role-display font-black text-mode-muted">
              {facts.initials}
            </span>
          )}
          <span className={cn(RECORD_LABEL_CLASS, 'absolute bottom-0 right-0 border-l border-t border-mode-edge bg-mode-panel px-2 py-1')}>
            All photos
          </span>
        </button>
        <div className="flex flex-col gap-1 border-b border-mode-ink bg-mode-panel p-3">
          {listingHref ? (
            <a
              href={listingHref}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-3 text-role-body font-bold underline decoration-mode-edge underline-offset-2"
            >
              {row.title || '—'}
            </a>
          ) : (
            <p className="line-clamp-3 text-role-body font-bold">{row.title || '—'}</p>
          )}
          <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            SKU <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{row.sku || '—'}</span>
            {row.itemNumber ? (
              <>
                {' · '}ITEM <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{row.itemNumber}</span>
              </>
            ) : null}
          </p>
        </div>

        {/* Floor verbs — the process this display exists to test. */}
        <div className="grid grid-cols-2 border-l border-mode-edge" data-testid="mobile-evidence-floor">
          <Verb testId="mobile-evidence-pick" active={nextVerb === 'pick'} disabled={blocked} onClick={() => router.push(`/m/pick/${row.entityId}`)}>
            Pick
          </Verb>
          <Verb testId="mobile-evidence-pack" active={nextVerb === 'pack'} disabled={blocked} onClick={() => router.push(`/m/pack/start/${row.entityId}`)}>
            Pack
          </Verb>
          <Verb testId="mobile-evidence-pass-pick" onClick={() => onPassPick(row)}>
            Pass pick
          </Verb>
          <Verb testId="mobile-evidence-priority" onClick={() => onPriorityAction(row, priority)}>
            {priority.label}
          </Verb>
        </div>

        {/* Exception controls — what stops this line, in one place. */}
        <p className={cn(RECORD_LABEL_CLASS, 'border-b border-mode-edge px-4 py-2 text-mode-muted')}>Exceptions</p>
        <div className="grid grid-cols-3 border-l border-mode-edge" data-testid="mobile-evidence-exceptions">
          <Verb testId="mobile-evidence-hold" onClick={() => onHold(row)}>
            {blocked ? 'Clear hold' : 'Out of stock'}
          </Verb>
          <Verb testId="mobile-evidence-damaged" onClick={() => onTriage(row, 'damaged')}>
            Damaged
          </Verb>
          <Verb testId="mobile-evidence-discrepancy" onClick={() => onTriage(row, 'discrepancy')}>
            Discrepancy
          </Verb>
        </div>

        <div className="grid grid-cols-3 border-l border-mode-edge" data-testid="mobile-evidence-order">
          <Verb
            testId="mobile-evidence-listing"
            disabled={!listingHref}
            onClick={() => listingHref && window.open(listingHref, '_blank', 'noopener,noreferrer')}
          >
            Listing <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </Verb>
          <Verb testId="mobile-evidence-documents" onClick={() => onOpenDocuments(row)}>
            Labels · slip
          </Verb>
          <Verb testId="mobile-evidence-detail" onClick={() => onOpenDetail(row)}>
            Details
          </Verb>
        </div>

        <dl className="flex flex-col px-4 pb-4">
          <Fact label="Location">
            <span className={cn(RECORD_ID_CLASS, 'block break-words', location ? 'text-mode-ink' : 'text-mode-warn')}>
              {location ? location.split(' | ').map((path) => <span key={path} className="block">{path}</span>) : 'UNASSIGNED'}
            </span>
            {allocated > 0 ? (
              <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
                {picked}/{allocated} picked
              </span>
            ) : null}
          </Fact>
          <Fact label="Platform">
            <span className={RECORD_LABEL_CLASS}>{channel.label || '—'}</span>
            {channel.connectionName ? (
              <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>{channel.connectionName}</span>
            ) : null}
          </Fact>
          <Fact label="Order #">
            <span className={cn(RECORD_ID_CLASS, 'select-all break-all')}>{facts.orderLabel}</span>
          </Fact>
          <Fact label="Ship by">
            <span
              className={cn(
                RECORD_LABEL_CLASS,
                facts.overdueDays > 0 ? LIFECYCLE_CLASSES.outOfStock.text : 'text-mode-ink',
              )}
            >
              {formatShipByFace(facts.shipByKey, facts.overdueDays)}
            </span>
          </Fact>
          <Fact label="Condition">
            <span className={cn(RECORD_LABEL_CLASS, conditionGradeTextClass(row.condition))}>
              {conditionGradeTableLabel(row.condition)}
            </span>
          </Fact>
          <Fact label="Quantity">
            <span className={RECORD_ID_CLASS}>{facts.qty}</span>
          </Fact>
          <Fact label="Price">
            <span className={RECORD_PRICE_CLASS}>{facts.price ?? '—'}</span>
          </Fact>
          <Fact label="Pick">
            <Assignee staffId={row.techId} name={picker} colorHex={row.techColorHex} />
          </Fact>
          <Fact label="Pack">
            <Assignee staffId={row.packerId} name={packer} colorHex={row.packerColorHex} />
          </Fact>
        </dl>
      </ModeRegion>
    </BottomSheet>
  );
}
