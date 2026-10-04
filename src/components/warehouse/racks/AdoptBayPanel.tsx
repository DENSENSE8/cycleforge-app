'use client';

/**
 * Make movable rack — phase 7 on the desk: turn a legacy aisle-bay into a
 * movable rack (the phone's adopt sheet on the bay record). The server's
 * `dryRun` plan is the preview — the rack number, where it stands, every shelf
 * row's code before → after — under the keep-vs-re-code choice. Confirm adopts
 * it (stock untouched: it is keyed by location id) and opens the rack record.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from '@/components/Icons';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { rackErrorMessage, rackPlacementText } from '@/lib/locations/rack-display';
import { adoptBay } from '@/lib/locations/racks-client';
import { safeRandomUUID } from '@/lib/safe-uuid';

const LABEL_TABS = [
  { id: 'keep', label: 'Keep printed labels' },
  { id: 'recode', label: 'Re-code to rack labels' },
];

export function AdoptBayPanel({ bayCode, onAdopted }: { bayCode: string; onAdopted: (rackCode: string) => void }) {
  const [keepBarcodes, setKeepBarcodes] = useState(true);
  const [commitId] = useState(() => safeRandomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ['rack-adopt-preview', bayCode, keepBarcodes],
    queryFn: () => adoptBay({ bayCode, keepBarcodes, dryRun: true, clientEventId: safeRandomUUID() }),
    staleTime: 30_000,
    retry: false,
  });
  const plan = preview.data?.dryRun ? preview.data.planned : null;
  const changed = plan ? plan.shelves.filter((row) => row.from !== row.to).length : 0;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adoptBay({ bayCode, keepBarcodes, dryRun: false, clientEventId: commitId });
      if (!res.dryRun) onAdopted(res.rack.code);
    } catch (err) {
      setError(rackErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="adopt-bay">
      <TabSwitch
        tabs={LABEL_TABS}
        activeTab={keepBarcodes ? 'keep' : 'recode'}
        onTabChange={(id) => setKeepBarcodes(id === 'keep')}
        size="sm"
      />
      <p className="text-role-data text-mode-muted">
        {keepBarcodes
          ? 'The shelf labels already on the bay keep working — nothing to reprint. Print the new rack placard.'
          : 'Every shelf gets a rack code. Print the placard and the new shelf labels, then replace the old ones.'}
      </p>
      {preview.isPending ? (
        <EvidenceNotice>Planning the rack…</EvidenceNotice>
      ) : preview.error ? (
        <EvidenceNotice tone="warn">{rackErrorMessage(preview.error)}</EvidenceNotice>
      ) : plan ? (
        <>
          <RecordGroup title={`${plan.rack.name} · ${plan.rack.code}`} testId="adopt-bay-plan">
            <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
              <EvidenceFactRow label="Stands at">{rackPlacementText(plan)}</EvidenceFactRow>
              <EvidenceFactRow label="Rows">
                {plan.shelves.length} · {changed === 0 ? 'no code changes' : `${changed} re-coded`}
              </EvidenceFactRow>
              <EvidenceFactRow label="Stock">Stays where it is</EvidenceFactRow>
            </div>
          </RecordGroup>
          <RecordGroup title="Shelf codes">
            <ul className="flex flex-col px-4 pb-1">
              {plan.shelves.map((row) => (
                <li
                  key={`${row.shelf}-${row.position ?? 0}-${row.to}`}
                  className="flex flex-wrap items-baseline gap-x-2 border-b border-mode-fact py-2 last:border-b-0"
                >
                  <span className="text-role-data font-semibold text-mode-ink">
                    Shelf {row.shelf}
                    {row.position != null ? ` · position ${row.position}` : ''}
                  </span>
                  <span className="font-mono text-role-data text-mode-muted">{row.from ?? 'new shelf'}</span>
                  {row.from !== row.to ? (
                    <>
                      <ArrowRight aria-hidden className="h-3.5 w-3.5 self-center text-mode-muted" />
                      <span className="font-mono text-role-data text-mode-ink">{row.to}</span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </RecordGroup>
        </>
      ) : null}
      {error ? <EvidenceNotice tone="warn">{error}</EvidenceNotice> : null}
      <Button variant="primary" loading={busy} disabled={!plan} onClick={() => void confirm()} data-testid="adopt-bay-confirm">
        {plan ? `Make ${plan.rack.name}` : 'Waiting for the plan'}
      </Button>
    </div>
  );
}
