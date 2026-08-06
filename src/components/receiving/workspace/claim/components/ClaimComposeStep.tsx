import { useMemo } from 'react';
import type { ClaimType } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { SearchableSelectField } from '@/design-system/components';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimTemplateEditor } from './ClaimTemplateEditor';
import { ClaimRecipientsField } from './ClaimRecipientsField';

/**
 * Ticket details — flush claim-type combobox (cmdk + DS Popover), subject/body,
 * recipients. Claim types today are fixed category labels (no tenant dictionary
 * / workflow-rule create path yet). File/Update lives in the sticky footer.
 */
export function ClaimComposeStep({ c }: { c: ReceivingClaimController }) {
  const claimTypeOptions = useMemo(
    () =>
      c.claimTypeItems.map((item) => ({
        value: item.id,
        label: item.label,
        group: 'Standard types',
      })),
    [c.claimTypeItems],
  );

  return (
    <div className="space-y-0 pt-2">
      {/* Row gutter matches Subject / Recipients — flush is field chrome only. */}
      <div className="space-y-1 px-3 pb-3">
        <p className="text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
          Claim type
        </p>
        <SearchableSelectField
          appearance="flush"
          value={c.claimType}
          onChange={(id) => {
            if (id == null) return;
            c.setClaimType(id as ClaimType);
          }}
          options={claimTypeOptions}
          placeholder="Search or select claim type…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No claim types match"
          ariaLabel="Claim type"
        />
      </div>
      <ClaimTemplateEditor template={c.template} row={c.row} />
      <ClaimRecipientsField
        notePublic={c.notePublic}
        onNotePublicChange={c.setNotePublic}
        ccEmails={c.ccEmails}
        onCcEmailsChange={c.setCcEmails}
      />
    </div>
  );
}
