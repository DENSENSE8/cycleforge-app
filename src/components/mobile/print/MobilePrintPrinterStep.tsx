'use client';

/**
 * /m/print printer step — PrintPreferences (USB/serial pair, profiles) plus
 * this staffer's computer's live status. Channel still keys on staffId; copy
 * uses the signed-in name.
 *
 * Callers: MobilePrintWorkspace options step. Pairing needs a user gesture on
 * the document that owns the USB port (this page on the packing computer).
 * User: "No need to display the silent printing. It should not say staff 1, it
 * should say the actual staff name."
 */

import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import {
  FILTER_DROPDOWN_LABEL_CLASS,
  FILTER_DROPDOWN_SELECT_CLASS,
} from '@/design-system/components/FilterDropdownSelect';
import { PrintPreferences } from '@/components/settings/PrintPreferences';
import { isBrowserPrintSupported } from '@/lib/print/browserPrint';
import {
  roleReady,
  type StaffPrintRole,
  type StaffPrintStatus,
} from '@/lib/print/staff-print-bridge';

export function MobilePrintOptionsDropdown({
  status,
  role,
  onPatch,
}: {
  status: StaffPrintStatus | null;
  role: StaffPrintRole;
  onPatch: (patch: { silent?: boolean; routing?: { label?: string | null; paper?: string | null } }) => void;
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
  status,
  role,
  staffName,
  onPatch,
  onRefresh,
}: {
  status: StaffPrintStatus | null;
  role: StaffPrintRole;
  staffName: string;
  onPatch: (patch: { silent?: boolean; routing?: { label?: string | null; paper?: string | null } }) => void;
  onRefresh: () => void;
}) {
  const localCapable = isBrowserPrintSupported();
  const ready = roleReady(status, role);

  return (
    <>
      <p className="text-role-caption text-text-muted">
        Pair the printer on this page while signed in on the computer with the USB plug.
        A phone signed in as {staffName} chooses which saved profile that computer uses.
      </p>

      <PrintPreferences embedded onStoreChange={onRefresh} />

      {!localCapable && (
        <MobilePrintOptionsDropdown status={status} role={role} onPatch={onPatch} />
      )}

      {!status && (
        <p className="text-role-caption text-text-warning">
          Waiting for {staffName}’s computer… keep the app open on the machine with the printer.
        </p>
      )}
      {status && !ready && (
        <p className="text-role-caption text-text-warning">
          Not ready yet. Pair USB/serial on the computer, then Refresh.
        </p>
      )}
      {ready && (
        <p className="text-role-caption text-text-success">
          Ready — {role === 'paper' ? status?.paper.name : status?.label.name}.
        </p>
      )}
      <Button type="button" variant="secondary" onClick={onRefresh}>
        Refresh
      </Button>
    </>
  );
}
