'use client';

import { useRef, useState } from 'react';
import { MoreHorizontal, Unlink, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button, IconButton, Popover } from '@/design-system/primitives';
import { useSplitLineSerial } from '@/components/receiving/workspace/hooks/useSplitLineSerial';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { receivingWorkspaceLineTitle } from '@/lib/receiving/po-group-title';

export interface PoLineSerialSplitContext {
  staffId: string;
  cartonSource: string | null | undefined;
  receivingId: number;
  onAfterSplit?: (line: ReceivingLineRow) => void;
}

interface Props {
  line: ReceivingLineRow;
  /** When set, Unlink is offered for unmatched cartons that have a serial. */
  serialSplit?: PoLineSerialSplitContext;
}

/**
 * Title-row ⋮ overflow for a PO line — currently just the (conditional)
 * unlink/split action: move a serial onto its own unmatched row after a
 * {@link RightPaneOverlay} confirm (same shell family as ReceivingClaimModal).
 *
 * Item-description ("more details") editing left this menu on 2026-08-08: the
 * per-line description is edited in the right-edge **Inventory** Display
 * (`InventoryDisplayHost` → `onSaveDescription`), so the redundant inline
 * editor was removed from the centre PO line item. When no action applies
 * (a matched line with no unlink target) the menu renders nothing — the ⋮
 * only appears where it still does something.
 */
export function PoLineTitleMenu({ line, serialSplit }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { split, busy } = useSplitLineSerial();

  const canUnlink =
    serialSplit != null &&
    serialSplit.cartonSource === 'unmatched' &&
    (line.serials?.length ?? 0) > 0;

  const closeMenu = () => setMenuOpen(false);

  const handleRequestUnlink = () => {
    closeMenu();
    setConfirmOpen(true);
  };

  const handleConfirmUnlink = async () => {
    if (!serialSplit || busy) return;
    const ok = await split({
      receivingId: serialSplit.receivingId,
      line,
      staffId: serialSplit.staffId,
      onSuccess: () => serialSplit.onAfterSplit?.(line),
    });
    if (ok) setConfirmOpen(false);
  };

  // The ⋮ menu now hosts only the conditional Unlink action — a matched line
  // with no unlink target has no line actions, so render nothing rather than an
  // empty menu (item-description "more details" moved to the Inventory Display).
  if (!canUnlink) return null;

  return (
    <>
      <HoverTooltip label="Line actions" asChild>
        <IconButton
          ref={triggerRef}
          ariaLabel="Line actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          className={`group -m-1 flex shrink-0 items-center justify-center rounded-md p-1 transition-colors hover:bg-blue-100 ${
            menuOpen ? 'bg-blue-100' : ''
          }`}
          icon={
            <MoreHorizontal
              className={`h-3.5 w-3.5 ${
                menuOpen
                  ? 'text-blue-600'
                  : 'text-text-faint group-hover:text-text-muted'
              }`}
              aria-hidden
            />
          }
        />
      </HoverTooltip>

      <Popover
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={triggerRef}
        placement="bottom-end"
        role="menu"
        aria-label="Line actions"
        className="min-w-[14rem]"
        padded={false}
        onClick={(e) => e.stopPropagation()}
      >
        <ul className="py-1">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                handleRequestUnlink();
              }}
              className="ds-raw-button flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption text-amber-700 transition-colors hover:bg-amber-50"
            >
              <Unlink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 font-medium">Unlink item</span>
            </button>
          </li>
        </ul>
      </Popover>

      <RightPaneOverlay
        open={confirmOpen}
        onClose={() => {
          if (!busy) setConfirmOpen(false);
        }}
        align="center"
        className="w-[min(94vw,24rem)]"
        aria-label="Confirm unlink item"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-hairline px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-role-body font-semibold text-text-default">Unlink item</h2>
            <p className="mt-0.5 truncate text-role-caption text-text-soft">
              {receivingWorkspaceLineTitle(line)}
            </p>
          </div>
          <HoverTooltip label="Close" asChild>
            <IconButton
              ariaLabel="Close"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
              className="shrink-0 text-text-faint hover:text-text-muted"
              icon={<X className="h-4 w-4" aria-hidden />}
            />
          </HoverTooltip>
        </header>
        <div className="px-4 py-3 text-role-data text-text-default">
          Unlink this item from the carton? The serial moves to its own row.
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border-hairline px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy}
            icon={<Unlink className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => void handleConfirmUnlink()}
          >
            Unlink
          </Button>
        </footer>
      </RightPaneOverlay>
    </>
  );
}
