'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { Link2, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { Dialog, DialogContent, DialogTitle } from '@/design-system/components/Dialog';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IncomingAttachTrackingForm, type AttachTrackingPresetPo } from './IncomingAttachTrackingForm';

interface IncomingAttachTrackingPopoverProps {
  /** When set, skip the PO-search step entirely and open straight into the attach-tracking state for this PO — used by row-anchored triggers… */
  presetPo?: AttachTrackingPresetPo;
  /** Custom trigger node. Defaults to the standalone "Link tracking to PO" pill.
   *  Pass `null` when a host opens the modal via controlled `open` only (no trigger). */
  trigger?: React.ReactNode | null;
  /** Optional controlled open state (falls back to internal state). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Fired after a successful attach, and again after its Undo — lets a host
   * that owns its own query keys (e.g. the incoming delivery record, the
   * Purchasing sheet) refresh beyond the shared receiving feeds.
   */
  onAttached?: () => void;
}

/** The attach-tracking form (`IncomingAttachTrackingForm`) in its own small dialog — the Purchasing sheet's empty Tracking cell and station block rows. */
export function IncomingAttachTrackingPopover({
  presetPo,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onAttached,
}: IncomingAttachTrackingPopoverProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  // A station block row's PO (`station:attach-tracking`) — wins over `presetPo` while open.
  const [stationPreset, setStationPreset] = useState<AttachTrackingPresetPo | null>(null);
  const open = controlledOpen ?? internalOpen;
  // Where focus was before we opened — restored on close for keyboard users.
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (controlledOpen === undefined) setInternalOpen(next);
      if (!next) {
        setStationPreset(null);
        // Return focus to the launching control.
        lastFocusedRef.current?.focus?.();
      }
    },
    [controlledOpen, onOpenChange],
  );

  // Listen for station-builder attach-tracking events (fired when the
  // `incoming.attach_tracking` action is run from a station block row).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ poId: string | null; poNumber: string | null }>).detail;
      if (!detail?.poId) return;
      setStationPreset({ poId: detail.poId, poNumber: detail.poNumber });
      setOpen(true);
    };
    window.addEventListener('station:attach-tracking', handler as EventListener);
    return () => window.removeEventListener('station:attach-tracking', handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const po = stationPreset ?? presetPo;

  // Escape, focus trap, focus restore, scroll lock and the scrim all come from
  // the DS Dialog (Radix).

  const openModal = useCallback((e?: MouseEvent) => {
    // Remember the trigger so focus returns to it on close.
    lastFocusedRef.current = (e?.currentTarget as HTMLElement) ?? (document.activeElement as HTMLElement);
    setOpen(true);
  }, [setOpen]);

  // Compose the open handler onto the caller's trigger (preserving its own
  // onClick, e.g. the row's stopPropagation) so a custom trigger still works.
  // `trigger={null}` → headless (controlled open only — e.g. Incoming Sync menu).
  const triggerNode =
    trigger === null
      ? null
      : trigger
        ? isValidElement(trigger)
          ? cloneElement(trigger as ReactElement<{ onClick?: (e: MouseEvent) => void }>, {
              onClick: (e: MouseEvent) => {
                (trigger as ReactElement<{ onClick?: (e: MouseEvent) => void }>).props.onClick?.(e);
                openModal(e);
              },
            })
          : trigger
        : (
          <HoverTooltip
            label="Search a PO and attach carrier tracking number(s) before the boxes arrive"
            asChild
          >
            <Button
              variant="secondary"
              size="sm"
              icon={<Link2 className="h-3.5 w-3.5" />}
              onClick={openModal}
              ariaLabel="Search a PO and attach carrier tracking number(s) before the boxes arrive"
              className="mx-1.5 bg-indigo-50 text-indigo-700 ring-indigo-200 ring-inset hover:bg-indigo-100"
            >
              Link tracking to PO
            </Button>
          </HoverTooltip>
        );

  const modal = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className="flex max-h-[min(70vh,32rem)] w-[360px] max-w-full flex-col gap-0 rounded-xl p-3"
      >
        <div className="mb-2 flex items-center justify-between">
          <DialogTitle className="text-role-eyebrow text-text-soft">Attach tracking</DialogTitle>
          <IconButton
            icon={<X className="h-3.5 w-3.5" />}
            ariaLabel="Close"
            onClick={() => setOpen(false)}
            className="rounded p-0.5 hover:bg-surface-sunken"
          />
        </div>
        {/* Keyed per PO: the form seeds its PO on mount. */}
        <IncomingAttachTrackingForm key={po?.poId ?? 'search'} presetPo={po} onAttached={onAttached} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {triggerNode}
      {modal}
    </>
  );
}
