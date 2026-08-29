'use client';

import { useCallback, useEffect } from 'react';
import { Download } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { usePackedOrdersFeed } from '@/hooks/usePackedOrdersFeed';
import {
  buildPackedOrderExportCsv,
  packedOrderExportFilename,
  type ExportableOrderRow,
} from '@/lib/dashboard/order-export-csv';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const EXPORT_FACE = cn(WORKBENCH_CHROME_PILL_CLASS, 'font-semibold');

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}

export function PackedExportButton() {
  const { records, dateFrom, dateTo } = usePackedOrdersFeed();
  const count = records.length;

  const exportCsv = useCallback(() => {
    if (count === 0) return;
    try {
      const window = { dateFrom, dateTo };
      const csv = buildPackedOrderExportCsv(records as ExportableOrderRow[], window);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = packedOrderExportFilename(window);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${count} row${count === 1 ? '' : 's'}`);
    } catch {
      toast.error('Could not build the export — retry in a moment');
    }
  }, [count, dateFrom, dateTo, records]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (e.code !== 'KeyE') return;
      e.preventDefault();
      e.stopPropagation();
      exportCsv();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [exportCsv]);

  return (
    <Button
      size="sm"
      variant="secondary"
      icon={<Download className="h-3.5 w-3.5" />}
      ariaLabel="Export filtered packed orders"
      onClick={exportCsv}
      disabled={count === 0}
      className={EXPORT_FACE}
      data-testid="outbound-chrome-export"
    >
      Export
    </Button>
  );
}
