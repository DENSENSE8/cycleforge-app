'use client';

import { PackOrderWorkspace } from '@/components/packer/PackOrderWorkspace';
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';

interface PackerRightPaneProps {
  packerId: string;
  activeOrderPane: PackActiveOrderPane | null;
  onCloseActiveOrder: () => void;
}

/**
 * Packer dashboard right pane — browse workbench (Queue · History) with
 * focused-order overlay (UnboxLineWorkspace pattern).
 */
export function PackerRightPane({
  packerId,
  activeOrderPane,
  onCloseActiveOrder,
}: PackerRightPaneProps) {
  const parsed = parseInt(packerId, 10);
  return (
    <PackOrderWorkspace
      packerId={Number.isFinite(parsed) ? parsed : 0}
      activeOrder={activeOrderPane}
      onCloseActiveOrder={onCloseActiveOrder}
    />
  );
}
