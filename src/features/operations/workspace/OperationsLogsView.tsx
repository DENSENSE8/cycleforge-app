'use client';

/** Operations › Logs: the event picker (paged) left of the picked event's record. */

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminLogsTab } from '@/components/admin/AdminLogsTab';
import { LogsPickerPane } from '@/components/admin/LogsPickerPane';

export function OperationsLogsView() {
  const searchParams = useSearchParams();
  // A narrower list from page 3 would land past its end: a filter change starts over at page 1.
  const filterKey = ['search', 'logKind', 'actorStaffId'].map((key) => searchParams.get(key) ?? '').join('\u0000');
  const [paging, setPaging] = useState({ filterKey, offset: 0 });
  const offset = paging.filterKey === filterKey ? paging.offset : 0;

  return (
    <div className="flex h-full min-h-0">
      <LogsPickerPane offset={offset} onOffsetChange={(next) => setPaging({ filterKey, offset: next })} />
      <div className="min-w-0 flex-1 overflow-y-auto">
        <AdminLogsTab offset={offset} />
      </div>
    </div>
  );
}
