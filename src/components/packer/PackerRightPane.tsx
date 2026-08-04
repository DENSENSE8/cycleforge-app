'use client';

import { PackOrderWorkspace } from '@/components/packer/PackOrderWorkspace';
import type {
  PackActiveFbaPane,
  PackActiveOrderPane,
} from '@/components/packer/usePackerOrderPane';

interface PackerRightPaneProps {
  packerId: string;
  activeOrderPane: PackActiveOrderPane | null;
  /** FBA scan result — the bench's other active entity (see PackFbaScanCard). */
  activeFbaPane?: PackActiveFbaPane | null;
  onCloseActiveOrder: () => void;
}

/**
 * Packer dashboard right pane — browse workbench (Queue · History) with
 * focused-order overlay (UnboxLineWorkspace pattern).
 */
export function PackerRightPane({
  packerId,
  activeOrderPane,
  activeFbaPane = null,
  onCloseActiveOrder,
}: PackerRightPaneProps) {
  const parsed = parseInt(packerId, 10);
  return (
    <PackOrderWorkspace
      packerId={Number.isFinite(parsed) ? parsed : 0}
      activeOrder={activeOrderPane}
      activeFba={activeFbaPane}
      onCloseActiveOrder={onCloseActiveOrder}
    />
  );
}
