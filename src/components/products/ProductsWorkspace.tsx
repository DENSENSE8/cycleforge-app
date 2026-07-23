'use client';

import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ManualLibrary } from '@/components/manuals/ManualLibrary';

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

// Lazy-load the kit-parts ("what's in the box") workspace — only mounts when view=kit.
const KitPartsWorkspace = dynamic(
  () => import('./KitPartsWorkspace').then((m) => m.KitPartsWorkspace),
  {
    ssr: false,
    loading: () => <div className="p-6 text-sm text-text-faint">Loading kit parts…</div>,
  },
);

// Lazy-load the Catalog MDM browser — only mounts when view=catalog.
const ProductsCatalogWorkspace = dynamic(
  () =>
    import('./catalog/ProductsCatalogWorkspace').then((m) => m.ProductsCatalogWorkspace),
  {
    ssr: false,
    loading: () => <div className="p-6 text-sm text-text-faint">Loading catalog…</div>,
  },
);

export function ProductsWorkspace() {
  const searchParams = useSearchParams();
  const view = searchParams.get('view');

  if (view === 'labels') return <LabelsProductsWorkspace />;
  if (view === 'pairing') return <ProductsPairingShell />;
  // QC view: right pane shows the selected SKU's QC checklist (selection comes
  // from the sidebar's QcProductPicker via `?skuId=`).
  if (view === 'qc') return <QcChecklistWorkspace />;
  // Kit Parts view: right pane shows the selected SKU's "what's in the box" BOM
  // editor (selection comes from the sidebar's KitPartsPicker via `?skuId=`).
  if (view === 'kit') return <KitPartsWorkspace />;
  if (view === 'catalog') return <ProductsCatalogWorkspace />;
  // Manuals (default) renders the PDF viewer in the main pane — selection
  // comes from the sidebar's LibraryBrowser (`?id=`).
  return <ManualLibrary />;
}
