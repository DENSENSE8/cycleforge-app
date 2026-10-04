'use client';

/**
 * Make movable rack — phase 7 of the room-agnostic racks handoff, from a
 * legacy room-coded shelf record (`C-04-07-3`). The sheet previews the
 * adoption (`adoptBay({ dryRun: true })`): the rack code it gets, where it
 * stands, and every shelf's code before → after. The operator keeps the
 * printed labels (they still scan) or re-codes them to `RK<n>-<level>` (which
 * means printing new ones). Confirm adopts, prints (the placard; every shelf
 * too when re-coded) and opens the new rack record. Stock never moves.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Warehouse } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { useLocationLabelPrint } from '@/hooks/useLocationLabelPrint';
import { rackLabelRows, rackPlacementText } from '@/lib/locations/rack-display';
import { adoptBay } from '@/lib/locations/racks-client';
import type { AdoptBayPlan } from '@/lib/locations/rack-types';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { locationLabelPrintSummary } from '@/lib/print/printLocationRows';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { plural, rackErrorSentence } from './rack-presentation';

const LABEL_CHOICES = [
  { id: 'keep', label: 'Keep labels', testId: 'adopt-keep-labels' },
  { id: 'recode', label: 'New rack labels', testId: 'adopt-recode-labels' },
];

export function MobileV2AdoptBaySheet({ bayCode, open, onClose }: { bayCode: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const printLabels = useLocationLabelPrint();
  const [keepBarcodes, setKeepBarcodes] = useState(true);
  const [plan, setPlan] = useState<{ planned: AdoptBayPlan | null; error: string | null; loading: boolean }>({ planned: null, error: null, loading: false });
  const [busy, setBusy] = useState(false);
  /** One key per open sheet: a retried Confirm after a dropped response adopts once. */
  const clientEventId = useRef(safeRandomUUID());

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPlan({ planned: null, error: null, loading: true });
    adoptBay({ bayCode, keepBarcodes, dryRun: true, clientEventId: clientEventId.current })
      .then((response) => {
        if (live) setPlan({ planned: response.dryRun ? response.planned : null, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (live) setPlan({ planned: null, error: rackErrorSentence(err, 'Could not plan the rack.'), loading: false });
      });
    return () => {
      live = false;
    };
  }, [bayCode, keepBarcodes, open]);

  const confirm = async () => {
    setBusy(true);
    try {
      const response = await adoptBay({ bayCode, keepBarcodes, clientEventId: clientEventId.current });
      if (response.dryRun) throw new Error('The server returned a plan instead of a rack.');
      const { rack } = response;
      void queryClient.invalidateQueries({ queryKey: ['racks'] });
      // Kept labels still scan; a shelf the adoption had to create has no label yet.
      const created = (plan.planned?.shelves ?? []).filter((row) => row.from == null).map((row) => row.to);
      const shelfCodes = new Set(keepBarcodes ? created : rack.shelves.map((shelf) => shelf.code));
      const result = await printLabels(rackLabelRows(rack, { placard: true, shelfCodes }));
      toast.success(`${rack.name} created · ${locationLabelPrintSummary(result)}`);
      clientEventId.current = safeRandomUUID();
      onClose();
      router.push(locationHubPath(rack.code));
    } catch (err) {
      toast.error(rackErrorSentence(err, 'Could not make the movable rack.'));
    } finally {
      setBusy(false);
    }
  };

  const planned = plan.planned;
  const missing = plan.loading ? 'Planning…' : planned ? null : 'Nothing to adopt';
  const shelfRows = planned?.shelves.filter((row) => row.position == null) ?? [];
  const printCount = 1 + (keepBarcodes ? shelfRows.filter((row) => row.from == null).length : shelfRows.length);

  return (
    <MobileV2ActionSheet
      open={open}
      onClose={onClose}
      eyebrow={bayCode}
      title="Make movable rack"
      description="The bay becomes a rack on wheels. Stock stays on its shelves."
      verbs={[
        {
          id: 'confirm',
          label: missing ?? `Make ${planned!.rack.name} · print ${printCount === 1 ? 'placard' : plural(printCount, 'label')}`,
          icon: <Warehouse />,
          primary: true,
          disabled: missing != null || busy,
          loading: busy,
          testId: 'adopt-confirm',
        },
      ]}
      onVerb={() => confirm()}
      dockLabel="Make movable rack"
      testId="adopt-bay-sheet"
    >
      <div className="px-mode-page pt-3">
        <TabSwitch
          tabs={LABEL_CHOICES}
          activeTab={keepBarcodes ? 'keep' : 'recode'}
          onTabChange={(id) => setKeepBarcodes(id === 'keep')}
        />
        <p className="break-words pt-2 text-role-caption text-text-muted">
          {keepBarcodes
            ? 'The shelf labels already on the bay keep scanning. Only the rack placard prints.'
            : 'Every shelf gets a rack code. Print and stick the new labels over the old ones.'}
        </p>
      </div>
      {plan.error ? (
        <p role="alert" className="break-words px-mode-page py-3 text-role-caption font-semibold text-text-danger" data-testid="adopt-error">
          {plan.error}
        </p>
      ) : null}
      {plan.loading ? <p className="break-words px-mode-page py-3 text-role-caption text-text-muted">Planning the rack…</p> : null}
      {planned ? (
        <>
          <MobileRecordCardList>
            <MobileRecordCard
              identity={planned.rack.name}
              title={rackPlacementText(planned)}
              detail={plural(shelfRows.length, 'shelf', 'shelves')}
              status={planned.rack.code}
              tone="ok"
              testId="adopt-rack"
            />
          </MobileRecordCardList>
          <MobileRecordCardList label="Shelves">
            {planned.shelves.map((row) => (
              <MobileRecordCard
                key={`${row.shelf}-${row.position ?? 0}-${row.to}`}
                identity={row.position == null ? `Shelf ${row.shelf}` : `Shelf ${row.shelf} · Position ${row.position}`}
                title={row.from == null ? `New shelf ${row.to}` : row.from === row.to ? `${row.to} (label kept)` : `${row.from} → ${row.to}`}
                status={row.from == null ? 'New' : row.from === row.to ? 'Kept' : 'New label'}
                tone={row.from != null && row.from !== row.to ? 'warn' : 'neutral'}
                testId="adopt-shelf"
              />
            ))}
          </MobileRecordCardList>
        </>
      ) : null}
    </MobileV2ActionSheet>
  );
}
