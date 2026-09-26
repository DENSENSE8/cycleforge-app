'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { EmptyState } from '../../primitives';
import { Package } from '@/components/Icons';
import { ItemRecordFactList } from './ItemRecordFactList';
import { ItemRecordRow } from './ItemRecordRow';
import type { ItemRecord } from './item-record-types';

/** The shared item surface: */
function ItemRecordCard({
  items,
  activeId,
  onSelect,
  serialsLoading = false,
  emptyTitle = 'No items',
  emptyDescription = 'Nothing is recorded against this record.',
  footer,
  className,
  topRule = true,
}: {
  items: ItemRecord[];
  /** Which row is the surface's current context. */
  activeId?: string | number | null;
  onSelect?: (item: ItemRecord) => void;
  serialsLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Trailing slot under the last item — extra panels the caller owns. */
  footer?: ReactNode;
  className?: string;
  /**
   * Top hairline on the list. Off when a section bar already paints that
   * seam (`StationBlockLabel`) so the two rules do not stack.
   */
  topRule?: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6 text-text-faint" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className={cn('min-w-0 space-y-3', className)} data-item-record-card>
      <ul
        className={cn(
          'min-w-0 list-none p-0',
          topRule && 'border-t border-border-soft',
        )}
      >
        {items.map((item) => (
          <ItemRecordRow
            key={item.id}
            item={item}
            active={activeId != null && String(activeId) === String(item.id)}
            onSelect={onSelect}
            serialsLoading={serialsLoading}
          />
        ))}
      </ul>
      {items.map((item) =>
        item.facts?.length ? (
          <ItemRecordFactList key={`facts-${item.id}`} facts={item.facts} />
        ) : null,
      )}
      {footer}
    </div>
  );
}
