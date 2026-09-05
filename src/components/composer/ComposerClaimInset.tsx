'use client';

/**
 * Claim accessory faces — claim type, link existing, AI draft status, seller.
 *
 * Link opens from the top-right Link icon (ClaimTicketPicker). Hermes AI draft
 * CTA lives in the dock foot left of Location; Sparkles opens this review
 * plate. Claim-type SearchableSelect opens upward under the welded hinge.
 * Never a toast on carton entry for degraded drafts.
 */

import { useMemo } from 'react';
import { Copy, Loader2, Sparkles } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { CLAIM_TYPE_OPTIONS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { CLAIM_TYPE_LABEL, type ClaimType } from '@/lib/receiving-claim-type';
import { ClaimTicketPicker } from '@/components/receiving/workspace/claim/components/ClaimTicketPicker';
import {
  DenseComposeBodyBand,
  DenseComposeBodyTextarea,
} from '@/design-system/components/DenseComposeFields';
import type { ComposerTicketClaim } from '@/components/receiving/workspace/line-edit/hooks/useComposerTicketClaim';
import type { ComposerAccessoryFace } from './composer-accessory-face';

export function composerAccessoryCaption(
  face: ComposerAccessoryFace,
  claim: ComposerTicketClaim,
): string {
  const item = claim.contextLine;
  const type = CLAIM_TYPE_LABEL[claim.claimType];
  if (face === 'draft') {
    if (claim.draftDegraded) {
      return 'AI draft kept the factual template — review before filing';
    }
    if (claim.loading) return 'Drafting claim from carton facts…';
    if (claim.draftModel) {
      return item ? `AI draft · ${claim.draftModel} · ${item}` : `AI draft · ${claim.draftModel}`;
    }
    return item ? `AI draft · ${item}` : 'AI draft from carton facts';
  }
  if (face === 'seller') {
    return item ? `Refining seller paste · ${item}` : 'Refining seller paste — not the ticket body';
  }
  if (face === 'link') {
    return item ? `Link existing ticket · ${item}` : 'Link an existing ticket';
  }
  return item ? `Claim type · ${type} · ${item}` : `Claim type · ${type}`;
}

export function ComposerClaimInset({
  claim,
  face,
}: {
  claim: ComposerTicketClaim;
  face: ComposerAccessoryFace;
}) {
  const typeOptions = useMemo(
    () =>
      CLAIM_TYPE_OPTIONS.filter((opt) => opt.value !== 'unfound' || !claim.hasPo).map((opt) => ({
        value: opt.value,
        label: opt.label,
        group: 'Claim types',
      })),
    [claim.hasPo],
  );

  if (face === 'seller') {
    return (
      <div className="flex min-w-0 flex-col gap-0.5 p-1.5" data-testid="composer-seller-strip">
        <div className="flex items-center justify-end gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => claim.redraftSeller()}
            disabled={claim.sellerLoading}
            icon={
              claim.sellerLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )
            }
          >
            {claim.sellerLoading ? 'Drafting…' : 'AI draft'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => claim.persistSeller()}
            disabled={!claim.sellerMessage.trim()}
          >
            Save draft
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => claim.copySellerMessage()}
            disabled={!claim.sellerMessage.trim()}
            icon={<Copy className="h-3 w-3" />}
          >
            Copy to send
          </Button>
        </div>
        <DenseComposeBodyBand>
          <DenseComposeBodyTextarea
            id="composer-seller-message"
            value={claim.sellerMessage}
            onChange={(e) => claim.setSellerMessage(e.target.value)}
            rows={4}
            placeholder={claim.sellerLoading ? 'Drafting seller message…' : 'Seller-facing paste…'}
          />
        </DenseComposeBodyBand>
      </div>
    );
  }

  if (face === 'draft') {
    return (
      <div className="flex min-w-0 flex-col gap-0.5 p-1.5" data-testid="composer-draft-tool">
        <p className="px-1.5 text-role-micro text-text-default">
          {claim.draftDegraded
            ? 'Hermes kept the factual template. Edit the body below, or use AI draft left of Location.'
            : claim.loading
              ? 'Drafting from claim facts…'
              : claim.draftModel
                ? `Drafted · ${claim.draftModel}`
                : 'Hermes rewrites the factual template. Use AI draft left of Location to redraft.'}
        </p>
      </div>
    );
  }

  if (face === 'link') {
    return (
      <div className="flex min-w-0 flex-col gap-0.5 p-1.5" data-testid="composer-claim-link">
        <ClaimTicketPicker search={claim.search} onSelect={claim.search.setSelectedTicket} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1 p-1.5" data-testid="composer-claim-inset">
      <SearchableSelectField
        appearance="flush"
        placement="top-stretch"
        value={claim.claimType}
        onChange={(id) => {
          if (id == null) return;
          claim.setClaimType(id as ClaimType);
        }}
        options={typeOptions}
        placeholder="Claim type…"
        searchPlaceholder="Type to filter…"
        emptyMessage="No claim types match"
        ariaLabel="Claim type"
      />
      {claim.reason ? (
        <p className="px-1.5 text-role-micro text-text-default" data-testid="composer-claim-reason">
          Issue · {claim.reason}
        </p>
      ) : null}
    </div>
  );
}
