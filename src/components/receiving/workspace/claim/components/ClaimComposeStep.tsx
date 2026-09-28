'use client';

import { useMemo, type ReactNode } from 'react';
import type { ClaimType } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { SearchableSelectField } from '@/design-system/components';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimTemplateEditor } from './ClaimTemplateEditor';
import { ClaimRecipientsField } from './ClaimRecipientsField';

const FAMILY_ORDER = ['Investigation', 'Vendor claim', 'Other'];

/** Ticket details — Reason, then Subject, then Body · recipients. */
export function ClaimComposeStep({ c }: { c: ReceivingClaimController }) {
  // Grouped by family so the operator says investigation vs claim; the pick
  // is the ticket's recorded reason (a receiving_exceptions row).
  const claimTypeOptions = useMemo(
    () =>
      [...c.claimTypeItems]
        .sort((a, b) => FAMILY_ORDER.indexOf(a.group) - FAMILY_ORDER.indexOf(b.group))
        .map((item) => ({
          value: item.id,
          label: item.label,
          group: item.group,
        })),
    [c.claimTypeItems],
  );

  const beforeSubject: ReactNode = (
    <div className="border-t border-border-hairline">
      {/* Flush select owns the bottom hairline — label gutter only, no pb. */}
      <div className="space-y-1 pt-3" data-testid="claim-compose-claim-field">
        <p className="px-3 text-role-eyebrow text-text-faint">
          Reason
        </p>
        <SearchableSelectField
          appearance="flush"
          value={c.claimType}
          onChange={(id) => {
            if (id == null) return;
            c.setClaimType(id as ClaimType);
          }}
          options={claimTypeOptions}
          placeholder="Search or select reason…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No reasons match"
          ariaLabel="Reason"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-0 pt-2">
      {c.reason.trim() ? (
        <div className="space-y-1 border-b border-border-hairline px-3 pb-3" data-claim-issue>
          <p className="text-role-eyebrow text-text-faint">
            Issue
          </p>
          <p className="text-role-caption text-text-default">{c.reason}</p>
        </div>
      ) : null}
      <ClaimTemplateEditor
        template={c.template}
        row={c.row}
        beforeSubject={beforeSubject}
      />
      <ClaimRecipientsField
        notePublic={c.notePublic}
        onNotePublicChange={c.setNotePublic}
        ccEmails={c.ccEmails}
        onCcEmailsChange={c.setCcEmails}
      />
    </div>
  );
}
