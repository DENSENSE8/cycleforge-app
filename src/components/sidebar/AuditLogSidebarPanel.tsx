'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { User } from '@/components/Icons';
import { useAuditLogFilterRefinements, AuditLogFilterDropdown } from '@/components/audit-log/AuditLogFilterStrip';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SearchBar } from '@/components/ui/SearchBar';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { AUDIT_SECTIONS } from './audit-log-panel/audit-log-panel-shared';
import { ReceivingPOPicker } from './audit-log-panel/ReceivingPOPicker';
import { PackingTrackingPicker, TechSessionPicker, SkuPicker } from './audit-log-panel/AuditSectionPickers';
import { TraceSerialPicker } from './audit-log-panel/TraceSerialPicker';

/**
 * Audit-log sidebar — thin composition shell. Search / filter chrome live here;
 * L2 section nav lives in GlobalHeader. Each section's list-picker is a
 * presentational component under `./audit-log-panel/` (Packing/Tech/SKU share
 * one generic {@link useAuditSectionList}-backed picker).
 */
export function AuditLogSidebarPanel() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSection = AUDIT_SECTIONS.find(
    (s) => s.available && (pathname === s.href || pathname.startsWith(`${s.href}/`)),
  );

  const [searchQuery, setSearchQuery] = useState('');

  const { refinements, clearAll } = useAuditLogFilterRefinements();

  const isTrace = activeSection?.id === 'trace';

  return (
    <SidebarShell
      headerAbove={
        <>
          <div className={`${SIDEBAR_GUTTER} py-3 border-b border-border-hairline`}>
            <p className={`px-1 ${sectionLabel} text-emerald-600`}>Audit Log</p>
            <p className={`mt-1 px-1 text-role-caption font-semibold leading-snug text-text-soft`}>
              Who, when, and what changed.
            </p>
          </div>
          {/* In-context list filter — local base SearchBar. Trace is a
              submit-to-search input (Enter pushes the serial into `?serial=`);
              others filter live. The global header pill stays global. */}
          <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
            <SearchBar
              size="compact"
              variant="blue"
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => setSearchQuery('')}
              onSearch={(value) => {
                // The trace input says "scan", and a printed unit label is a
                // Digital Link / GS1 frame — unwrap it to the serial the trace
                // page actually queries.
                const v = isTrace ? unwrapScannedSerial(value) : value.trim();
                if (!v) return;
                if (isTrace) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('serial', v);
                  router.replace(`/audit-log/trace?${params.toString()}`);
                }
              }}
              placeholder={isTrace ? 'Scan or enter a serial…' : `Filter ${activeSection?.label || 'audit'}...`}
            />
          </div>
        </>
      }
      filter={{
        label: 'Audit Filters',
        refinements,
        onClearAll: clearAll,
        renderDropdown: (onClose) => <AuditLogFilterDropdown onClose={onClose} />,
      }}
      bodyClassName="pt-0 pb-6"
    >
      {activeSection?.id === 'trace' ? (
        <TraceSerialPicker query={searchQuery} />
      ) : activeSection?.id === 'receiving' ? (
        <ReceivingPOPicker
          query={searchQuery}
          selectedPo={searchParams.get('po')}
          onSelect={(po) => {
            const params = new URLSearchParams(searchParams.toString());
            if (po) params.set('po', po);
            else params.delete('po');
            router.replace(
              `/audit-log/receiving${params.toString() ? `?${params.toString()}` : ''}`,
            );
          }}
        />
      ) : activeSection?.id === 'packing' ? (
        <PackingTrackingPicker query={searchQuery} />
      ) : activeSection?.id === 'tech' ? (
        <TechSessionPicker query={searchQuery} />
      ) : activeSection?.id === 'sku' ? (
        <SkuPicker query={searchQuery} />
      ) : activeSection?.id === 'staff' ? (
        <div className="px-4 py-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-3">
            <User className="h-6 w-6" />
          </div>
          <p className="text-role-caption font-semibold text-text-default mb-1">Staff Audit Feed</p>
          <p className="text-role-caption text-text-soft max-w-[180px] mx-auto">
            Select a staff member in the filters above to load their cross-section audit feed.
          </p>
        </div>
      ) : (
        <div className="inset-empty text-center text-xs text-text-faint">
          Select a section in the header.
        </div>
      )}
    </SidebarShell>
  );
}
