'use client';

/** Review · Missing item number — the **check-then-approve** body of the rail. */

import { useMemo, useState, type ClipboardEvent } from 'react';
import { AlertTriangle, Check, ExternalLink } from '@/components/Icons';
import { Button, TextField } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderIdChip } from '@/components/ui/CopyChip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { sourcePlatformMeta, sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import {
  LISTING_URL_PARSE_MESSAGE,
  listingCheckHref,
  parseListingUrl,
} from '@/lib/inventory/listing-candidate';

function openListing(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** Shared "Open listing" affordance — the check gesture, in one place. */
function OpenListingButton({
  href,
  label = 'Open listing',
}: {
  href: string | null;
  label?: string;
}) {
  if (!href) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<ExternalLink className="h-3.5 w-3.5" />}
      onClick={() => openListing(href)}
      title={href}
    >
      {label}
    </Button>
  );
}

export function ListingApprovalSection({
  accountSource,
  productTitle,
  itemNumber,
  onItemNumberChange,
  onSubmit,
  disabled = false,
}: {
  /** Order's account source label (e.g. `eBay-RS`) — the check-link fallback. */
  accountSource: string | null;
  /** What the sheet says was sold, so the operator can compare it to the page. */
  productTitle: string | null;
  /** The value Resolve will commit. Owned by the rail (it gates the header CTA). */
  itemNumber: string;
  onItemNumberChange: (next: string) => void;
  /**
   * Commit. Enter in the item-number field calls it bare (the field's own
   * value); Approve & resolve passes the approved candidate explicitly, because
   * it fills and commits in one beat and state has not re-rendered yet.
   */
  onSubmit: (explicitItemNumber?: string) => void;
  disabled?: boolean;
}) {
  const [urlInput, setUrlInput] = useState('');

  const parsed = useMemo(
    () => (urlInput.trim() ? parseListingUrl(urlInput) : null),
    [urlInput],
  );
  const candidate = parsed?.ok ? parsed.candidate : null;
  const parseError = parsed && !parsed.ok ? LISTING_URL_PARSE_MESSAGE[parsed.reason] : null;

  // Derived, never stored — see the docblock.
  const approved = candidate != null && itemNumber.trim() === candidate.itemNumber;

  const approveAndResolve = (next: { itemNumber: string }) => {
    onItemNumberChange(next.itemNumber);
    onSubmit(next.itemNumber);
  };

  const candidateMeta = candidate?.platform
    ? sourcePlatformMeta(candidate.platform)
    : sourcePlatformMetaFromLabel(accountSource);

  // The href for the *committed* value: the pasted listing while it is the one
  // approved, otherwise rebuilt from the order's platform so a TYPED id is
  // checkable too.
  const fieldCheckHref = listingCheckHref({
    itemNumber,
    listingUrl: approved ? candidate?.listingUrl : null,
    accountSource,
  });

  /** A listing URL pasted into the ITEM NUMBER box is still a listing URL — before this it was committed verbatim, so the order got an… */
  const handleItemNumberPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!parseListingUrl(pasted).ok) return;
    e.preventDefault();
    setUrlInput(pasted);
    onItemNumberChange('');
  };

  return (
    <div className="space-y-4">
      {/* ── 1 · Feed it a listing ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <TextField
          label="Listing URL"
          value={urlInput}
          onChange={setUrlInput}
          autoFocus
          disabled={disabled}
          inputClassName="text-role-caption"
        />

        {parseError ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="text-role-caption">{parseError}</p>
          </div>
        ) : null}

        {/* ── 2 · Check it, then approve ─────────────────────────────────── */}
        {candidate ? (
          <div className="space-y-3 rounded-xl border border-border-soft bg-surface-canvas p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-role-eyebrow text-text-soft">
                From listing URL
              </span>
              {candidateMeta.value ? (
                <HoverTooltip label={candidateMeta.label} asChild focusable={false}>
                  <span className="inline-flex shrink-0" aria-label={candidateMeta.label}>
                    <PlatformMark platformValue={candidateMeta.value} meta={candidateMeta} />
                  </span>
                </HoverTooltip>
              ) : null}
            </div>

            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="shrink-0 text-role-eyebrow text-text-soft">
                Item number
              </span>
              <OrderIdChip
                value={candidate.itemNumber}
                display={candidate.itemNumber}
                plain
                truncateDisplay={false}
                fitDisplayWidth
              />
            </div>

            {/* The comparison the operator is actually making: does the page
                behind that link sell the thing this order says it sold? */}
            {productTitle ? (
              <p className="text-role-caption text-text-muted">
                Order says: <span className="text-text-default">{productTitle}</span>
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <OpenListingButton href={candidate.listingUrl} />
              <Button
                variant="primary"
                size="sm"
                icon={<Check className="h-3.5 w-3.5" />}
                onClick={() => void approveAndResolve(candidate)}
                disabled={disabled}
                data-testid="approve-and-resolve"
              >
                Approve &amp; resolve
              </Button>
              {approved ? (
                <span className="inline-flex items-center gap-1.5 text-role-caption font-semibold text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                  Approved
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 3 · The value Resolve commits ─────────────────────────────────── */}
      <div className="space-y-2">
        {/* The floating label IS the placeholder (TextField's contract) — the
            accepted shapes go in the helper line, not a second hint inside the box. */}
        <TextField
          label="Item number"
          value={itemNumber}
          onChange={onItemNumberChange}
          onPaste={handleItemNumberPaste}
          mono
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        {/* Check link for a typed id too — the plan's rule is that whatever is
            about to be committed must be openable before it is. */}
        {itemNumber.trim() && !approved ? (
          <OpenListingButton href={fieldCheckHref} label="Check this item number" />
        ) : null}
        <p className="text-role-caption text-text-muted">
          eBay item # / ASIN / listing id. Resolve re-runs the same sheet → order import path with
          this Item Number filled in, which creates the order that row was missing.
        </p>
      </div>
    </div>
  );
}
