'use client';

import { useMemo } from 'react';
import { ChevronRight, User } from '@/components/Icons';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives/Button';
import type { CustomerDirectoryEntry } from '@/lib/customers/customer-throughput';
import { cn } from '@/utils/_cn';
import { customerDateFace, customerPlatformFace } from './customer-format';

export function CustomerDirectoryList({
  rows, loading, failed, fetching, selectedId, narrowed, onOpen,
}: {
  rows: readonly CustomerDirectoryEntry[];
  loading: boolean;
  failed: boolean;
  fetching: boolean;
  selectedId: number | null;
  narrowed: boolean;
  onOpen: (customerId: number) => void;
}) {
  if (loading && rows.length === 0) return <UniversalLoader isLoading label="Loading customers" className="min-h-64" />;
  if (failed) return <div className="p-4"><EvidenceNotice tone="warn">Couldn&apos;t load customers.</EvidenceNotice></div>;
  if (rows.length === 0) {
    return <div className="p-4"><EvidenceNotice>{narrowed ? 'No customers match that contact.' : 'No customers yet.'}</EvidenceNotice></div>;
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-mode-canvas" aria-busy={fetching || undefined}>
      <ul className="divide-y divide-mode-fact bg-surface-card" aria-label="Customers">
        {rows.map((customer) => {
          const repeat = customer.orderCount > 1;
          const contact = customer.phone || customer.email || customer.place || 'No contact on file';
          const isOpen = customer.id === selectedId;
          return (
            <li key={customer.id}>
              <Button
                variant="ghost"
                radius="flush"
                className={cn(
                  'group h-auto min-h-16 w-full justify-start gap-3 px-4 py-2.5 text-left hover:bg-mode-hover focus-visible:bg-mode-hover',
                  isOpen && 'bg-mode-hover ring-2 ring-inset ring-mode-mark',
                )}
                onClick={() => onOpen(customer.id)}
                ariaLabel={`Open ${customer.name}, ${customer.orderCount} orders`}
                aria-current={isOpen ? 'true' : undefined}
                {...{ [DESK_RECORD_KEY_ATTR]: String(customer.id) }}
                data-testid="customer-directory-row"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-mode-pill bg-mode-well text-mode-muted">
                  <User className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-role-data font-semibold text-mode-ink">{customer.name}</span>
                    <span className="shrink-0 text-role-micro font-semibold tabular-nums text-mode-muted">C-{customer.id}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-role-caption font-normal text-mode-muted">{contact}</span>
                  <span className="mt-1 flex flex-wrap gap-x-1.5 text-role-micro font-medium text-mode-muted">
                    <span className={repeat ? 'text-mode-warn' : ''}>{repeat ? `Repeat · ${customer.orderCount} orders` : `${customer.orderCount} order${customer.orderCount === 1 ? '' : 's'}`}</span>
                    <span aria-hidden>·</span>
                    <span>Latest {customerDateFace(customer.lastOrderAt)}</span>
                  </span>
                </span>
                <span className="flex max-w-32 shrink-0 flex-col items-end gap-1">
                  {customer.platforms.slice(0, 2).map((platform) => (
                    <span key={platform} className="flex items-center text-role-micro font-medium text-mode-muted">
                      <PlatformMark platformValue={platform} />
                      {customerPlatformFace(platform)}
                    </span>
                  ))}
                </span>
                <ChevronRight className="size-4 shrink-0 text-mode-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CustomerDirectorySummary({ rows }: { rows: readonly CustomerDirectoryEntry[] }) {
  const orderCount = useMemo(() => rows.reduce((total, customer) => total + customer.orderCount, 0), [rows]);
  return (
    <div className="p-4">
      <RecordGroup title="Customer book">
        <div className="px-4 pb-1">
          <EvidenceFactRow label="Customers">{rows.length}</EvidenceFactRow>
          <EvidenceFactRow label="Orders">{orderCount}</EvidenceFactRow>
        </div>
      </RecordGroup>
    </div>
  );
}
