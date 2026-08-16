'use client';

import { useMemo, type ReactNode } from 'react';
import type { ClaimType } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { SearchableSelectField } from '@/design-system/components';
import { usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import { returnPlatformForSource } from '@/lib/receiving/return-platform-for-source';
import {
  platformClassifyOptions,
  typeClassifyOptions,
} from '../../line-edit/classify-pill-options';
import { useSourcePlatform } from '../../line-edit/hooks/useSourcePlatform';
import { useReceivingType } from '../../line-edit/hooks/useReceivingType';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimTemplateEditor } from './ClaimTemplateEditor';
import { ClaimRecipientsField } from './ClaimRecipientsField';

/**
 * Ticket details — Platform · Type · Claim, then Subject, then Body ·
 * recipients. Platform/type writes update Classify via
 * `receiving-package-updated` and patch only the subject identity segment
 * (never a full template refetch).
 */
export function ClaimComposeStep({ c }: { c: ReceivingClaimController }) {
  const listingLink = String(c.row.receiving_listing_url ?? '').trim();
  const { sourcePlatform, setSourcePlatform, savePlatform } = useSourcePlatform(c.row, {
    listingLink,
  });
  const { intakeType, setIntakeType, saveType } = useReceivingType(c.row);
  const platformCatalog = usePlatformCatalog();
  const typeCatalog = useReceivingTypeCatalog();
  const isUnmatched = c.row.receiving_source === 'unmatched';
  const receivingIdMissing = c.row.receiving_id == null;

  const platformSelectOptions = useMemo(() => {
    const opts = platformClassifyOptions({
      catalogOptions: platformCatalog.options,
      isUnmatched,
    });
    return opts.map((o) => ({
      value: o.value,
      label: o.label,
      meta: o.title,
      group: 'Platforms',
    }));
  }, [platformCatalog.options, isUnmatched]);

  const typeSelectOptions = useMemo(() => {
    const opts = typeClassifyOptions({ catalogOptions: typeCatalog.options });
    return opts.map((o) => ({
      value: o.value,
      label: o.label,
      meta: o.title,
      group: 'Standard types',
    }));
  }, [typeCatalog.options]);

  const claimTypeOptions = useMemo(
    () =>
      c.claimTypeItems.map((item) => ({
        value: item.id,
        label: item.label,
        group: 'Claim types',
      })),
    [c.claimTypeItems],
  );

  const catalogPlatformLabel = (slug: string) =>
    platformCatalog.options.find((o) => o.value === slug)?.label ?? null;
  const catalogTypeLabel = (code: string) =>
    typeCatalog.options.find((o) => o.value === code)?.label ?? null;

  const beforeSubject: ReactNode = (
    <div
      data-testid="claim-compose-carton-identity"
      className="border-t border-border-hairline"
    >
      {/* Flush selects own the bottom hairline — label gutter only, no pb / divide-y. */}
      <div className="space-y-1 pt-3">
        <p className="px-3 text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
          Platform
        </p>
        <SearchableSelectField
          appearance="flush"
          value={sourcePlatform}
          disabled={receivingIdMissing}
          onChange={(id) => {
            if (id == null) return;
            const next = String(id);
            const isReturn = String(intakeType ?? '').trim().toUpperCase() === 'RETURN';
            setSourcePlatform(next);
            c.template.applyCartonIdentity({
              sourcePlatform: next,
              receivingType: intakeType,
              isReturn,
              returnPlatform: isReturn ? returnPlatformForSource(next) : null,
              catalogPlatformLabel: catalogPlatformLabel(next),
              catalogTypeLabel: catalogTypeLabel(String(intakeType ?? '')),
            });
            void savePlatform(next, { isReturn });
          }}
          options={platformSelectOptions}
          placeholder="Search or select…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No platforms match"
          ariaLabel="Platform"
        />
      </div>
      <div className="space-y-1 pt-3">
        <p className="px-3 text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
          Type
        </p>
        <SearchableSelectField
          appearance="flush"
          value={intakeType || null}
          disabled={receivingIdMissing}
          onChange={(id) => {
            if (id == null) return;
            const next = String(id);
            const isReturn = next.trim().toUpperCase() === 'RETURN';
            setIntakeType(next);
            c.template.applyCartonIdentity({
              sourcePlatform,
              receivingType: next,
              isReturn,
              returnPlatform: isReturn ? returnPlatformForSource(sourcePlatform) : null,
              catalogPlatformLabel: catalogPlatformLabel(sourcePlatform),
              catalogTypeLabel: catalogTypeLabel(next),
            });
            void saveType(next);
          }}
          options={typeSelectOptions}
          placeholder="Search or select…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No types match"
          ariaLabel="Type"
        />
      </div>
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
