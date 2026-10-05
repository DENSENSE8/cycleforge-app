'use client';

/**
 * Print station › Stations › **Add print station** (owner 2026-10-04): a
 * popover hung right under the page header's Add print station button, like
 * Add FNSKU. A name (required, unique for the org) mints an org-owned station
 * and its single-use pairing code; the code shows once, with a QR of the
 * station page that pairs on arrival. Open that page on the computer that
 * prints — no staff sign-in there.
 */

import { useState, type FormEvent, type RefObject } from 'react';
import QRCode from 'react-qr-code';
import { Plus } from '@/components/Icons';
import { CopyChip } from '@/components/ui/CopyChip';
import { Button, Panel, TextField } from '@/design-system/primitives';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import type { PrintStations } from '@/hooks/usePrintStations';
import { printStationDeviceHref } from '@/lib/nav/route-tree';
import { PRINT_STATION_NAME_MAX } from '@/lib/print/print-station';
import type { PrintStationEnrollment } from '@/lib/print/print-station-registry-contracts';

export function PrintStationEnrollPopover({
  anchorRef,
  port,
  onClose,
  onEnrolled,
}: {
  /** The header's Add print station button: the popover hangs right under it, right-aligned. */
  anchorRef: RefObject<HTMLElement | null>;
  port: Pick<PrintStations, 'enroll'>;
  onClose: () => void;
  /** The code was shown and the popover closed: open the new station (its record replaces the header, so never sooner). */
  onEnrolled: (stationId: string) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<(PrintStationEnrollment & { name: string }) | null>(null);
  const trimmed = name.trim();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const minted = await port.enroll(trimmed);
      setEnrollment({ ...minted, name: trimmed });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The print station was not added.');
    } finally {
      setSaving(false);
    }
  };

  const pairUrl = enrollment ? `${window.location.origin}${printStationDeviceHref({ code: enrollment.code })}` : null;
  const close = () => (enrollment ? onEnrolled(enrollment.stationId) : onClose());

  return (
    <AnchoredLayer open onClose={close} anchorRef={anchorRef} placement="bottom-end" level="panelPopover" gap={6}>
      <Panel
        padding="none"
        radius="xl"
        elevation="overlay"
        aria-label="Add print station"
        data-testid="print-station-enroll"
        className="flex max-h-[var(--anchored-available-height,none)] w-[24rem] flex-col overflow-y-auto"
      >
        {enrollment && pairUrl ? (
          <div className="flex flex-col gap-3 px-4 py-4" data-testid="print-station-enroll-code">
            <p className="text-sm font-semibold text-text-default">{enrollment.name} is ready to pair</p>
            <p className="text-role-caption text-text-muted">
              On the computer that prints, scan this or open the link — no sign-in there. The code works once, until{' '}
              {new Date(enrollment.expiresAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.
            </p>
            <Panel radius="2xl" padding="sm" className="mx-auto">
              <QRCode value={pairUrl} size={180} level="M" />
            </Panel>
            <div className="flex items-center justify-between gap-3">
              <span className="text-role-caption text-text-muted">Pairing code</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-3xl font-semibold tracking-[0.18em] text-text-default" data-testid="print-station-pairing-code">
                  {enrollment.code}
                </span>
                <CopyChip value={enrollment.code} display="Copy code" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-role-caption text-text-muted">Station link</span>
              <CopyChip value={pairUrl} display="Copy link" />
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={close} data-testid="print-station-enroll-done">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <div className="flex flex-col gap-3 px-4 py-4">
              <TextField
                label="Station name"
                value={name}
                onChange={(next) => setName(next.slice(0, PRINT_STATION_NAME_MAX))}
                required
                autoFocus
              />
              <p className="text-role-caption text-text-muted">An org-owned computer that prints FBA labels with nobody signed in.</p>
              {error ? (
                <p role="alert" className="text-role-caption text-text-danger">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border-hairline px-4 py-3">
              <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!trimmed} icon={<Plus aria-hidden />} data-testid="print-station-enroll-save">
                Add print station
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </AnchoredLayer>
  );
}
