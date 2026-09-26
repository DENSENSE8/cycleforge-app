'use client';

/** `/m/repair-scan/info` — every fact about the counter visit a phone is joined to, read-only. */

import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import type { CompanionVisit } from '@/lib/kiosk/companion-shape';
import { splitSerials } from '@/lib/kiosk/serial-list';
import { repairScanHubHref, useRepairScanVisit } from './useRepairScanVisit';

export function RepairScanVisitInfo({ token }: { token: string }) {
  const { visit, ended, loading, error, reload } = useRepairScanVisit(token);
  return (
    <DetailRecordFrame<CompanionVisit>
      record={visit}
      state={{
        loading,
        error,
        onRetry: reload,
        notice: ended ? 'This phone link has ended. Scan the new QR on the tablet.' : undefined,
      }}
      bar={{
        title: visit?.cart ? `Cart #${visit.cart.id}` : 'Repair visit',
        mono: Boolean(visit?.cart),
        subtitle: 'Visit details',
        backHref: repairScanHubHref(token),
      }}
    >
      {(v) => (
        <div className="flex-1 divide-y divide-mode-rule">
          <DetailFacts>
            <DetailFact label="Customer" value={v.cart?.customer?.trim() || 'Walk-in customer'} />
            <DetailFact
              label="Cart"
              value={v.cart ? `#${v.cart.id}` : null}
              mono
              copy={v.cart ? String(v.cart.id) : null}
              hint={v.cart ? undefined : 'The tablet has not saved this cart yet'}
            />
            <DetailFact label="Tablet" value={v.tablet ?? null} />
            <DetailFact
              label="Serials"
              value={`${v.devices.filter((d) => d.serialNumber.trim()).length} of ${v.devices.length} units`}
            />
            <DetailFact
              label="Link ends"
              value={new Date(v.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            />
          </DetailFacts>
          {v.devices.length > 0 && (
            <>
              <DetailSectionHeading>Units</DetailSectionHeading>
              <DetailFacts label="Units">
                {v.devices.map((d, i) => {
                  const serials = splitSerials(d.serialNumber);
                  return (
                    <DetailFact
                      key={d.lineId}
                      label={`Unit ${i + 1}`}
                      value={
                        serials.length ? (
                          <ul data-testid="repair-scan-info-serials">
                            {serials.map((serial) => (
                              <li key={serial}>{serial}</li>
                            ))}
                          </ul>
                        ) : (
                          'Needs serial'
                        )
                      }
                      mono={serials.length > 0}
                      copy={serials.length === 1 ? serials[0] : null}
                      hint={[d.title, d.sku, serials.length > 1 ? `${serials.length} serials` : null].filter(Boolean).join(' · ')}
                    />
                  );
                })}
              </DetailFacts>
            </>
          )}
        </div>
      )}
    </DetailRecordFrame>
  );
}
