'use client';

import { useMemo, type ReactNode } from 'react';
import type { ClaimType } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { SearchableSelectField } from '@/design-system/components';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimTemplateEditor } from './ClaimTemplateEditor';
import { ClaimRecipientsField } from './ClaimRecipientsField';

/**
 * Ticket details — Claim, then Subject, then Body · recipients.
 *
 * Platform and Type were editable here until 2026-08-30 (operator ruling). They
 * are carton CLASSIFICATION, not claim content: the workspace's Classify row
 * owns those writes (`useReceivingLineCore` → `useSourcePlatform` /
 * `useReceivingType`, plus the mobile Arrival flows), and a second editor for
 * them inside the claim form meant an operator could re-classify a carton while
 * filing a claim about it — two paths to one field, on a form whose job is the
 * claim. The subject still carries the carton's identity; it is seeded from the
 * template rather than patched from a select that is no longer here.
 */
export function ClaimComposeStep({ c }: { c: ReceivingClaimController }) {
  const claimTypeOptions = useMemo(
    () =>
      c.claimTypeItems.map((item) => ({
        value: item.id,
        label: item.label,
        group: 'Claim types',
      })),
    [c.claimTypeItems],
  );

  const beforeSubject: ReactNode = (
    <div className="border-t border-border-hairline">
      {/* Flush select owns the bottom hairline — label gutter only, no pb. */}
      <div className="space-y-1 pt-3" data-testid="claim-compose-claim-field">
        <p className="px-3 text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
          Claim
        </p>
        <SearchableSelectField
          appearance="flush"
          value={c.claimType}
          onChange={(id) => {
            if (id == null) return;
            c.setClaimType(id as ClaimType);
          }}
          options={claimTypeOptions}
          placeholder="Search or select claim…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No claim types match"
          ariaLabel="Claim"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-0 pt-2">
      {c.reason.trim() ? (
        <div className="space-y-1 border-b border-border-hairline px-3 pb-3" data-claim-issue>
          <p className="text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
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
