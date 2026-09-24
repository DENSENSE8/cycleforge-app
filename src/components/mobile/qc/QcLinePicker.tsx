'use client';

import { useQuery } from '@tanstack/react-query';
import { Barcode } from '@/components/Icons';
import { DetailFactRow, DetailNav, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { Button, Panel } from '@/design-system/primitives';
import type { LineSerial } from '@/lib/receiving/serial-projection';
import { resolveSkuIdentityTitle, type SkuIdentityTitleRow } from '@/lib/sku/sku-identity-law';
import { TESTING_RECEIVING_LINES_API } from '@/lib/surface-isolation';

interface QcLine extends SkuIdentityTitleRow {
  id: number;
  serials: LineSerial[];
}

/**
 * The line's CURRENT units through the testing twin of the receiving-lines
 * read — the endpoint already gated on `tech.qc_pass`, so a QC tech needs no
 * receiving permission. `view=testing` is that twin's required surface marker;
 * with `id` it answers the one line.
 */
function useQcLine(lineId: number) {
  return useQuery<QcLine>({
    queryKey: ['qc.line-units', lineId],
    queryFn: async () => {
      const res = await fetch(`${TESTING_RECEIVING_LINES_API}?view=testing&id=${lineId}&include=serials`, {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      if (res.status === 404) throw new Error(`No receiving line L-${lineId} in this organization.`);
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      return json.receiving_line as QcLine;
    },
    refetchOnWindowFocus: false,
  });
}

/**
 * The unit pick for an `L-` label scanned on the kernel armed for QC: the
 * line names a PO line that can hold several units, and QC is per unit, so
 * the tech picks one (operator 2026-09-24). Picking hands back the numeric
 * `serial_units.id` — the ref the checklist route keys on, and never
 * ambiguous with a numeric serial.
 */
export function QcLinePicker({
  lineId,
  onPick,
  onBack,
}: {
  lineId: number;
  onPick: (unitRef: string) => void;
  onBack: () => void;
}) {
  const { data: line, error, isLoading } = useQcLine(lineId);
  const units = line?.serials ?? [];

  return (
    <>
      {isLoading ? <p className="py-10 text-center text-sm font-semibold text-text-soft">Loading…</p> : null}

      {error ? (
        <div className="rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-mode-body font-semibold text-rose-700">
          {error.message}
        </div>
      ) : null}

      {line ? (
        <>
          <section aria-labelledby="qc-line-info" className="space-y-2">
            <DetailSectionHeading id="qc-line-info">Line L-{lineId}</DetailSectionHeading>
            <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
              <DetailFactRow label="Product" value={resolveSkuIdentityTitle(line) || '—'} />
              <DetailFactRow label="SKU" value={line.sku ? <span className="font-mono">{line.sku}</span> : '—'} />
              <DetailFactRow label="Units" value={units.length} />
            </Panel>
          </section>

          {units.length > 0 ? (
            <section aria-labelledby="qc-line-units" className="space-y-2">
              <DetailSectionHeading id="qc-line-units">Pick the unit</DetailSectionHeading>
              <DetailNav
                label={`Units on line L-${lineId}`}
                rows={units.map((unit) => ({
                  id: String(unit.id),
                  title: unit.serial_number,
                  icon: <Barcode />,
                  meta: unit.unit_uid ? `${unit.unit_uid} · ${unit.current_status}` : unit.current_status,
                  onSelect: () => onPick(String(unit.id)),
                }))}
              />
            </section>
          ) : (
            <p className="text-role-caption text-mode-muted">
              No units on this line yet — unbox labels each unit as it comes out of the box.
            </p>
          )}
        </>
      ) : null}

      <Button variant="secondary" size="lg" className="w-full rounded-mode" onClick={onBack}>
        Scan another label
      </Button>
    </>
  );
}
