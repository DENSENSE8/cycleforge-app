'use client';

/**
 * The record of a pasted number NOTHING on file carries (or whose lines sit
 * under an earlier number) — the Check's own facts, read from its answer,
 * and the number's next actions. A number with lines opens the purchase's
 * record ({@link IncomingDeliveryEvidence}) instead.
 */

import {
  EvidenceFact,
  EvidenceFacts,
  EvidenceNotice,
  EvidenceSection,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import type { PastedNumber } from '@/lib/receiving/pasted-numbers';
import { PASTED_NUMBER_NOTHING_ON_FILE, pastedNumberStatusFace } from './cards/PastedNumberCard';

const yesNo = (value: boolean | undefined) => (value == null ? '—' : value ? 'Yes' : 'No');

export interface PastedNumberVerb {
  id: string;
  label: string;
  run: () => void;
}

export function PastedNumberEvidence({
  number,
  check,
  verbs,
}: {
  number: PastedNumber;
  /** The Check's raw answer for this number; null while it has not answered. */
  check: CheckZohoReceivedRow | null;
  verbs: readonly PastedNumberVerb[];
}) {
  const { entry, sharedWith } = number;
  const status = pastedNumberStatusFace(entry);
  const local = check?.local ?? null;
  return (
    <div className="flex flex-1 flex-col gap-4 bg-mode-canvas p-4 text-mode-ink" data-testid="pasted-number-record">
      <div className={DESK_RECORD_COLUMN_CARD_CLASS}>
        <EvidenceNotice tone={entry.exception ? 'warn' : 'neutral'}>
          <span data-testid="pasted-number-record-status">
            <b className="font-semibold">{status.face}</b>
            {' — '}
            {sharedWith ? `its lines sit under ${sharedWith}` : PASTED_NUMBER_NOTHING_ON_FILE.toLowerCase()}
            {entry.exception && entry.exception.reason !== entry.detail ? ` · ${entry.exception.reason}` : ''}
          </span>
        </EvidenceNotice>
        <EvidenceSection label="Check" testId="pasted-number-record-check">
          {check ? (
            <EvidenceFacts>
              <EvidenceFact label="Number" mono>
                {entry.ref}
              </EvidenceFact>
              <EvidenceFact label="Reason">{check.reason}</EvidenceFact>
              <EvidenceFact label="Verdict">{check.verdict}</EvidenceFact>
              <EvidenceFact label="PO status">{check.status ?? '—'}</EvidenceFact>
              <EvidenceFact label="PO" mono>
                {check.po_number ?? '—'}
              </EvidenceFact>
              <EvidenceFact label="Vendor">{check.vendor_name ?? '—'}</EvidenceFact>
            </EvidenceFacts>
          ) : (
            <p className="text-role-data text-mode-muted">{entry.detail}</p>
          )}
        </EvidenceSection>
        {local ? (
          <EvidenceSection label="Warehouse" testId="pasted-number-record-local">
            <EvidenceFacts>
              <EvidenceFact label="Known">{yesNo(local.known)}</EvidenceFact>
              <EvidenceFact label="Delivered">{yesNo(local.delivered)}</EvidenceFact>
              <EvidenceFact label="Scanned">{yesNo(local.scanned)}</EvidenceFact>
              <EvidenceFact label="Unboxed">{yesNo(local.unboxed)}</EvidenceFact>
              <EvidenceFact label="Watch">{local.watch ?? '—'}</EvidenceFact>
            </EvidenceFacts>
          </EvidenceSection>
        ) : null}
        <EvidenceSection label="Next" testId="pasted-number-record-next">
          <div className="flex flex-wrap gap-2">
            {verbs.map((verb, index) => (
              <button
                key={verb.id}
                type="button"
                data-testid={`pasted-number-record-${verb.id}`}
                onClick={verb.run}
                className={evidenceVerbClass(index === 0)}
              >
                {verb.label}
              </button>
            ))}
          </div>
        </EvidenceSection>
      </div>
    </div>
  );
}
