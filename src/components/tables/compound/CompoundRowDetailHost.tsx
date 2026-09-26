'use client';

/** Leaf + detail band, or the same facts in a BottomSheet on `/m/*`. */

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CompoundRowDetailBand } from '@/components/tables/compound/CompoundRowDetailBand';
import { CompoundRowDetailSheet } from '@/components/tables/compound/CompoundRowDetailSheet';
import type { CompoundRowDetail } from '@/components/tables/compound/compound-row-model';

export function CompoundRowDetailHost({
  rowId: _rowId,
  detail,
  title,
  columns,
  detailOpen,
  onCloseDetail,
  children,
}: {
  rowId: string;
  detail: CompoundRowDetail;
  title: string;
  columns: readonly { key: string; width: string; frozen?: boolean }[];
  detailOpen: boolean;
  onCloseDetail: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const mobile = Boolean(pathname?.startsWith('/m'));

  if (mobile) {
    return (
      <>
        {children}
        <CompoundRowDetailSheet
          open={detailOpen}
          onClose={onCloseDetail}
          detail={detail}
          title={title.trim() || undefined}
        />
      </>
    );
  }

  return (
    <>
      {children}
      {detailOpen ? (
        <CompoundRowDetailBand detail={detail} title={title} columns={columns} />
      ) : null}
    </>
  );
}
