'use client';

/**
 * Short — a received carton whose PO lines arrived short. Two ways out: the
 * count was wrong (`Set counts` on one line → `PATCH /api/receiving-lines`),
 * or the units really are missing (`File claim` → the Zendesk claim, which
 * moves the carton to Claim). Both are dock-verb forms, so both are sheets.
 */

import { useState } from 'react';
import { ListChecks, Pencil, Ticket } from '@/components/Icons';
import { DetailNavRow, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DetailDock } from '@/design-system/components/DetailDock';
import { SearchableSelectField } from '@/design-system/components';
import { Button, TextField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useResolveShortException } from '@/hooks/exceptions';
import type { CartonExceptionFacts } from '@/lib/exceptions/facts';
import { receivingProductTitle } from '@/lib/receiving/po-group-title';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  CLAIM_TYPE_FAMILY,
  CLAIM_TYPE_LABEL,
  defaultReceivingClaimType,
  type ClaimType,
} from '@/lib/receiving-claim-type';
import { toast } from '@/lib/toast';
import { CartonFacts } from './CartonFacts';
import type { PhoneResolverProps } from './resolver-props';

type ShortVerb = 'set-counts' | 'file-claim';

const CARTON_SCOPE = 'carton';

const CLAIM_TYPE_OPTIONS = (Object.keys(CLAIM_TYPE_LABEL) as ClaimType[]).map((type) => ({
  value: type,
  label: CLAIM_TYPE_LABEL[type],
  group: CLAIM_TYPE_FAMILY[type],
}));

/** A typed count: blank = leave it alone; otherwise a whole number ≥ 0. */
function parseCount(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : 'invalid';
}

export function ShortResolver({ facts, onResolved }: PhoneResolverProps<CartonExceptionFacts>) {
  const { has } = useAuth();
  const resolve = useResolveShortException();
  const canWrite = has('receiving.mark_received');
  // An unfound carton's placeholder stub carries `id < 0` — never editable.
  const lines = facts.lines.filter((line) => line.id > 0);
  const firstShort =
    lines.find((line) => line.quantity_expected != null && line.quantity_received < line.quantity_expected) ??
    lines[0] ??
    null;

  const [countsLine, setCountsLine] = useState<ReceivingLineRow | null>(null);
  const [received, setReceived] = useState('');
  const [expected, setExpected] = useState('');

  const [claimOpen, setClaimOpen] = useState(false);
  const [claimType, setClaimType] = useState<ClaimType>('missing');
  const [claimScope, setClaimScope] = useState<string>(CARTON_SCOPE);
  const [reason, setReason] = useState('');

  const openCounts = (line: ReceivingLineRow) => {
    setReceived(String(line.quantity_received));
    setExpected(line.quantity_expected == null ? '' : String(line.quantity_expected));
    setCountsLine(line);
  };

  const openClaim = () => {
    const line = firstShort;
    setClaimType(
      defaultReceivingClaimType({
        shipmentStatus: line?.shipment_status,
        receivingType: line?.receiving_type,
        cartonIntakeType: line?.carton_intake_type,
        intakeType: line?.intake_type,
        receivingSource: facts.carton.source,
        hasPo: Boolean(facts.carton.zohoPurchaseorderId),
        qaStatus: line?.qa_status,
        quantityReceived: line?.quantity_received,
        quantityExpected: line?.quantity_expected,
      }),
    );
    setClaimScope(line ? String(line.id) : CARTON_SCOPE);
    setReason('');
    setClaimOpen(true);
  };

  const saveCounts = () => {
    if (!countsLine) return;
    const nextReceived = parseCount(received);
    const nextExpected = parseCount(expected);
    if (nextReceived === 'invalid' || nextExpected === 'invalid') {
      toast.error('Counts are whole numbers, 0 or more.');
      return;
    }
    const changedReceived = nextReceived != null && nextReceived !== countsLine.quantity_received;
    const changedExpected = nextExpected != null && nextExpected !== countsLine.quantity_expected;
    if (!changedReceived && !changedExpected) {
      setCountsLine(null);
      return;
    }
    resolve
      .mutateAsync({
        action: 'set-quantity',
        lineId: countsLine.id,
        ...(changedReceived ? { quantityReceived: nextReceived } : {}),
        ...(changedExpected ? { quantityExpected: nextExpected } : {}),
      })
      .then(() => {
        setCountsLine(null);
        onResolved(`Counts saved on ${receivingProductTitle(countsLine)}.`);
      })
      .catch((error: Error) => toast.error(error.message || 'Could not save the counts.'));
  };

  const fileClaim = () => {
    const trimmedReason = reason.trim();
    resolve
      .mutateAsync({
        action: 'file-claim',
        receivingId: facts.carton.receivingId,
        lineId: claimScope === CARTON_SCOPE ? null : Number(claimScope),
        claimType,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      })
      .then(() => {
        setClaimOpen(false);
        onResolved(`${CLAIM_TYPE_LABEL[claimType]} claim filed.`);
      })
      .catch((error: Error) => toast.error(error.message || 'Could not file the claim.'));
  };

  const onVerb = (verb: ShortVerb) => {
    if (verb === 'file-claim') openClaim();
    else if (firstShort) openCounts(firstShort);
  };

  return (
    <>
      <CartonFacts carton={facts.carton} />
      <section aria-labelledby="short-lines-heading" className="bg-mode-panel">
        <DetailSectionHeading id="short-lines-heading">Lines · received of expected</DetailSectionHeading>
        {lines.length === 0 ? (
          <p className="px-mode-page py-3 text-role-caption text-mode-muted">This carton has no lines yet.</p>
        ) : (
          <nav aria-label="Carton lines" className="[&>*:last-child]:border-b-0">
            {lines.map((line) => {
              const short =
                line.quantity_expected != null ? Math.max(0, line.quantity_expected - line.quantity_received) : 0;
              return (
                <DetailNavRow
                  key={line.id}
                  title={receivingProductTitle(line)}
                  meta={[
                    line.sku,
                    `${line.quantity_received} of ${line.quantity_expected ?? '—'}`,
                    short > 0 ? `${short} short` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  icon={<ListChecks />}
                  onSelect={canWrite ? () => openCounts(line) : undefined}
                />
              );
            })}
          </nav>
        )}
      </section>
      {!canWrite ? (
        <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-text-muted">
          Changing counts or filing a claim needs receiving access (Mark received).
        </p>
      ) : null}
      <div className="flex-1 bg-mode-panel" />
      <DetailDock
        label="Short exception actions"
        verbs={[
          {
            id: 'set-counts',
            label: 'Set counts',
            icon: <Pencil />,
            primary: true,
            disabled: !canWrite || !firstShort,
            loading: resolve.isPending && resolve.variables?.action === 'set-quantity',
          },
          {
            id: 'file-claim',
            label: 'File claim',
            icon: <Ticket />,
            disabled: !canWrite,
            loading: resolve.isPending && resolve.variables?.action === 'file-claim',
          },
        ]}
        onVerb={onVerb}
      />

      <BottomSheet open={countsLine != null} onClose={() => setCountsLine(null)} title="Set counts">
        {countsLine ? (
          <div className="flex flex-col gap-3">
            <p className="text-role-caption text-text-muted">{receivingProductTitle(countsLine)}</p>
            <TextField
              label="Received"
              value={received}
              onChange={setReceived}
              inputMode="numeric"
              mono
            />
            <TextField
              label="Expected"
              value={expected}
              onChange={setExpected}
              inputMode="numeric"
              mono
            />
            <Button
              variant="primary"
              radius="mode"
              size="lg"
              loading={resolve.isPending}
              disabled={!canWrite}
              onClick={saveCounts}
            >
              Save counts
            </Button>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet open={claimOpen} onClose={() => setClaimOpen(false)} title="File claim">
        <div className="flex flex-col gap-3">
          <SearchableSelectField
            label="Claim type"
            value={claimType}
            onChange={(value) => {
              if (value != null) setClaimType(value as ClaimType);
            }}
            options={CLAIM_TYPE_OPTIONS}
            ariaLabel="Claim type"
            testId="short-claim-type"
          />
          <SearchableSelectField
            label="For"
            value={claimScope}
            onChange={(value) => setClaimScope(value == null ? CARTON_SCOPE : String(value))}
            options={[
              { value: CARTON_SCOPE, label: 'Whole carton' },
              ...lines.map((line) => ({
                value: String(line.id),
                label: receivingProductTitle(line),
                meta: line.sku ?? undefined,
              })),
            ]}
            ariaLabel="Claim line"
            testId="short-claim-line"
          />
          <TextField label="Reason (optional)" value={reason} onChange={setReason} multiline rows={3} />
          <Button
            variant="primary"
            radius="mode"
            size="lg"
            loading={resolve.isPending}
            disabled={!canWrite}
            onClick={fileClaim}
          >
            File claim
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
