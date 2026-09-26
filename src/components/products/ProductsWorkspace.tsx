'use client';

import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ManualLibrary } from '@/components/manuals/ManualLibrary';
import { parseProductsView } from '@/components/products/products-view';

// Lazy-load the labels workbench — pulls in the DataMatrix renderer + barcode
// helpers + catalog list; not needed for the default Manuals view.
const LabelsProductsWorkspace = dynamic(
  () =>
    import('@/components/labels/LabelsProductsWorkspace').then(
      (m) => m.LabelsProductsWorkspace,
    ),
  {
    ssr: false,
    loading: () => <div className="p-6 text-sm text-text-faint">Loading labels…</div>,
  },
);

// Lazy-load the pairing shell — pulls in the Product Hub graph + suggestion
// fetcher, none of which the default Manuals view needs.
const ProductsPairingShell = dynamic(
  () => import('./pairing/ProductsPairingShell').then((m) => m.ProductsPairingShell),
  {
    ssr: false,
    loading: () => <div className="p-6 text-sm text-text-faint">Loading pairing workspace…</div>,
  },
);

// Lazy-load the QC checklist workspace — only mounts when view=qc.
const QcChecklistWorkspace = dynamic(
  () => import('./QcChecklistWorkspace').then((m) => m.QcChecklistWorkspace),
  {
    ssr: false,
    loading: () => <div className="p-6 text-sm text-text-faint">Loading QC checklist…</div>,
  },
);

// Reference (`view=catalog`) and Kit Parts (`view=kit`) were removed 2026-09-15 (operator:

export function ProductsWorkspace() {
  const searchParams = useSearchParams();
  const view = parseProductsView(searchParams.get('view'));

  switch (view) {
    case 'labels':
      return <LabelsProductsWorkspace />;
    case 'pairing':
      return <ProductsPairingShell />;
    // QC view: right pane shows the selected SKU's QC checklist (selection comes
    // from the sidebar's QcProductPicker via `?skuId=`).
    case 'qc':
      return <QcChecklistWorkspace />;
    // Manuals (default) renders the PDF viewer in the main pane — selection
    // comes from the sidebar's LibraryBrowser (`?id=`).
    case 'manuals':
      return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <ManualLibrary />
        </div>
      );
  }
}
