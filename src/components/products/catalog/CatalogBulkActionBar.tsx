'use client';

/**
 * Sticky bottom bar when catalog rows are checked — Copy TSV for sheet paste.
 */

import { useCallback } from 'react';
import { toast } from '@/lib/toast';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { Copy } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  CATALOG_COPY_HEADER,
  formatCatalogCopyRow,
  toTsvBlock,
} from '@/lib/station/format-station-copy-row';
import { emitToggleAll } from '@/lib/selection/table-selection';

interface Props {
  scope: string;
  selected: CatalogListRow[];
}

export function CatalogBulkActionBar({ scope, selected }: Props) {
  const count = selected.length;

  const copyTsv = useCallback(() => {
    if (selected.length === 0) return;
    const block = toTsvBlock(CATALOG_COPY_HEADER, selected.map(formatCatalogCopyRow));
    void navigator.clipboard.writeText(block).then(
      () => toast.success(`Copied ${selected.length} SKU${selected.length === 1 ? '' : 's'}`),
      () => toast.error('Copy failed'),
    );
  }, [selected]);

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label="Catalog bulk actions"
      className="sticky bottom-0 left-0 right-0 z-sticky border-t border-border-soft bg-surface-card/95 px-4 py-3 backdrop-blur-md"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <div className="text-sm font-semibold text-text-default">
          {count} selected
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => emitToggleAll(scope, 'none')}
          className="text-role-caption text-text-soft hover:text-text-muted"
        >
          Clear
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="primary" size="md" icon={<Copy />} onClick={copyTsv}>
            Copy
          </Button>
        </div>
      </div>
    </div>
  );
}
