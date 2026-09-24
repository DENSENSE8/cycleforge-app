'use client';

/**
 * /m/print printer step — PrintPreferences (USB/serial pair, profiles) plus the
 * picked print station (one named computer signed in as this staffer) and its
 * live status. Copy uses the signed-in name and the station's name.
 *
 * Callers: MobilePrintWorkspace options step. Pairing needs a user gesture on
 * the document that owns the USB port (this page on the packing computer).
 * User: "No need to display the silent printing. It should not say staff 1, it
 * should say the actual staff name."
 */

import { cn } from '@/utils/_cn';
import {
  FILTER_DROPDOWN_LABEL_CLASS,
  FILTER_DROPDOWN_SELECT_CLASS,
} from '@/design-system/components/FilterDropdownSelect';
import { PrintPreferences } from '@/components/settings/PrintPreferences';
import { StaffPrintStationPicker } from '@/components/mobile/print/StaffPrintStationPicker';
import type { StaffPrintPatch } from '@/hooks/useStaffPrintBridgeClient';
import { isBrowserPrintSupported } from '@/lib/print/browserPrint';
import {
  roleReady,
  type StaffPrintRole,
  type StaffPrintStation,
  type StaffPrintStatus,
} from '@/lib/print/staff-print-bridge';

export function MobilePrintOptionsDropdown({
  status,
  role,
  onPatch,
}: {
  status: StaffPrintStatus | null;
  role: StaffPrintRole;
  onPatch: (patch: StaffPrintPatch) => void;
}) {
  const profiles = (status?.profiles ?? []).filter((p) => p.role === role);
  const currentId = role === 'paper' ? status?.paper.profileId : status?.label.profileId;

  return (
    <>
      <label className="block">
        <span className={FILTER_DROPDOWN_LABEL_CLASS}>
          {role === 'paper' ? 'Paper printer' : 'Label printer'}
        </span>
        <select
          className={cn(FILTER_DROPDOWN_SELECT_CLASS, 'text-role-field')}
          value={currentId ?? ''}
          onChange={(e) => {
            const id = e.target.value || null;
            onPatch({ routing: role === 'paper' ? { paper: id } : { label: id } });
          }}
        >
          <option value="">{profiles.length ? 'Choose a profile' : 'None paired on that computer'}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.kind})
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function MobilePrintPrinterStep({
  stations,
  target,
  now,
  role,
  staffName,
  onPick,
  onPatch,
  onRefresh,
}: {
  stations: readonly StaffPrintStation[];
  target: StaffPrintStation | null;
  now: number;
  role: StaffPrintRole;
  staffName: string;
  onPick: (stationId: string | null) => void;
  onPatch: (patch: StaffPrintPatch) => void;
  onRefresh: () => void;
}) {
  const localCapable = isBrowserPrintSupported();
  const status = target?.status ?? null;
  const ready = roleReady(status, role);

  return (
    <>
      <p className="text-role-caption text-text-muted">
        Pair the printer on this page while signed in on the computer with the USB plug.
        A phone signed in as {staffName} picks which station prints and which saved profile it uses.
      </p>

      <PrintPreferences embedded onStoreChange={onRefresh} />

      <StaffPrintStationPicker
        stations={stations}
        target={target}
        now={now}
        staffName={staffName}
        onPick={onPick}
        onRefresh={onRefresh}
      />

      {!localCapable && status && (
        <MobilePrintOptionsDropdown status={status} role={role} onPatch={onPatch} />
      )}

      {status && !ready && (
        <p className="text-role-caption text-text-warning">
          Not ready yet. Pair USB/serial on {status.stationName}, then Refresh.
        </p>
      )}
      {ready && (
        <p className="text-role-caption text-text-success">
          Ready — {role === 'paper' ? status?.paper.name : status?.label.name} on {status?.stationName}.
        </p>
      )}
    </>
  );
}
