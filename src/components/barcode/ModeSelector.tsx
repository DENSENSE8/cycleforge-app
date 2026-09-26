import React from 'react';
import { Printer, Database, Hash, RotateCcw } from '../Icons';

// 'bin-labels' was previously bundled here; bin/zone printing now lives at
// /warehouse (WarehouseSidebarPanel → Labels tab). Keep this union focused
// on per-SKU barcode workflows.
export type BarcodeMode = 'print' | 'auto-unit' | 'sn-to-sku' | 'reprint';

/** The per-SKU barcode mode vocabulary — id, operator label, hint and glyph. */
export const BARCODE_MODES: { id: BarcodeMode; label: string; description: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'print',     label: 'Print',   description: 'Pair OEM serial',    Icon: Printer   },
    { id: 'auto-unit', label: 'Unit',    description: 'Auto unit labels',   Icon: Hash      },
    { id: 'sn-to-sku', label: 'Log SN',  description: 'Serial → SKU log',  Icon: Database  },
    { id: 'reprint',   label: 'Reprint', description: 'Same label again',  Icon: RotateCcw },
];
