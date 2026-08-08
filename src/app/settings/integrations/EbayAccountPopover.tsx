'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Popover } from '@/design-system/primitives/Popover';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { RefreshCw, Trash2 } from '@/components/Icons';
import type { AccountSummary } from './registry';
import { FIELD_INPUT_CLS } from './form-styles';

interface EbayConnectPopoverProps {
  role: 'seller' | 'buyer';
  existingLabels: string[];
  oauthStartPath: string;
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

/** Popover for naming a new eBay account before OAuth redirect. */
export function EbayConnectPopover({
  role,
  existingLabels,
  oauthStartPath,
  open,
  onClose,
  anchorRef,
}: EbayConnectPopoverProps) {
  const prefix = role === 'buyer' ? 'ebay-buyer' : 'ebay';
  const suggested = existingLabels.length === 0 ? `${prefix}-main` : `${prefix}-${existingLabels.length + 1}`;
  const [label, setLabel] = useState(suggested);
  const [error, setError] = useState<string | null>(null);
  const kind = role === 'buyer' ? 'Purchasing' : 'Selling';

  const connect = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Account label is required');
      return;
    }
    if (existingLabels.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
      setError(`An account labeled "${trimmed}" already exists`);
      return;
    }
    const roleParam = role === 'buyer' ? '&role=buyer' : '';
    window.location.href = `${oauthStartPath}?accountName=${encodeURIComponent(trimmed)}${roleParam}`;
  };

  const isBuyer = role === 'buyer';

  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} placement="bottom-start" className={isBuyer ? 'w-96' : 'w-80'} role="dialog" aria-label={`Connect eBay ${kind} account`}>
      <div className="space-y-3 p-1">
        <div>
          <p className="text-role-body font-semibold text-text-default">Connect {kind} account</p>
          {isBuyer ? (
            <div className="mt-1 space-y-1.5 text-role-caption text-text-soft">
              <p>
                Links an eBay <span className="font-medium text-text-default">buyer</span> account so purchases
                appear on <span className="font-medium text-text-default">Incoming</span> as purchase orders.
              </p>
              <p>
                On eBay, grant access for this purchasing account — their screen may say “view your data”;
                that is eBay’s wording, not a Cycle Forge setting.
              </p>
              <p>
                After you return: open Incoming and use <span className="font-medium text-text-default">Marketplace</span> to
                pull purchases (or wait for the ~30m sync).
              </p>
              <p className="text-text-muted">
                Pick a workspace label for cards and sync tools. eBay username appears after authorization.
              </p>
            </div>
          ) : (
            <p className="mt-0.5 text-role-caption text-text-soft">
              Links a storefront account for selling orders and tracking. Pick a workspace label — shown on
              cards and in sync tools. eBay username appears after authorization. Use{' '}
              <span className="font-medium text-text-default">Add purchasing</span> instead if you need buyer
              purchases on Incoming.
            </p>
          )}
        </div>
        <label className="block">
          <span className="text-role-caption font-semibold text-text-default">Account label</span>
          <input
            className={`${FIELD_INPUT_CLS} mt-1`}
            value={label}
            onChange={(e) => { setLabel(e.target.value); setError(null); }}
            placeholder={suggested}
            autoFocus
          />
        </label>
        {error && <p className="text-role-caption font-medium text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={connect}>Continue to eBay</Button>
        </div>
      </div>
    </Popover>
  );
}

interface EbayAccountDetailPopoverProps {
  account: AccountSummary;
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  canManage?: boolean;
  busy?: boolean;
  onRefresh?: () => void;
  onDisconnect?: () => void;
}

/** Popover showing linked eBay account identity and quick actions. */
export function EbayAccountDetailPopover({
  account,
  open,
  onClose,
  anchorRef,
  canManage,
  busy,
  onRefresh,
  onDisconnect,
}: EbayAccountDetailPopoverProps) {
  const roleLabel = account.role === 'buyer' ? 'Purchasing account' : 'Selling account';

  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} placement="bottom-start" className="w-72" role="dialog" aria-label={`eBay account ${account.label}`}>
      <div className="space-y-3 p-1">
        <div>
          <p className="text-role-micro uppercase tracking-widest text-text-faint">{roleLabel}</p>
          <p className="mt-1 text-role-body font-semibold text-text-default">{account.label}</p>
          {account.ebayUserId && (
            <p className="mt-0.5 text-role-caption text-text-soft">
              eBay user: <span className="font-medium text-text-default">{account.ebayUserId}</span>
            </p>
          )}
          {account.detail && (
            <p className="mt-1 text-role-caption text-text-muted">{account.detail}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border-hairline pt-2">
          <Link
            href="/settings/integrations/ebay"
            className="text-role-caption font-semibold text-blue-600 hover:underline"
            onClick={onClose}
          >
            Manage connection →
          </Link>
        </div>
        {canManage && (
          <div className="flex items-center justify-end gap-1 border-t border-border-hairline pt-2">
            {onRefresh && (
              <IconButton
                icon={<RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />}
                onClick={onRefresh}
                disabled={busy}
                ariaLabel="Refresh token"
                tone="accent"
              />
            )}
            {onDisconnect && account.id != null && (
              <IconButton
                icon={<Trash2 className="h-4 w-4" />}
                onClick={onDisconnect}
                disabled={busy}
                ariaLabel="Disconnect account"
                className="hover:text-red-600"
              />
            )}
          </div>
        )}
      </div>
    </Popover>
  );
}

/** Clickable account name chip that opens the detail popover. */
export function EbayAccountNameChip({
  account,
  canManage,
  busy,
  onRefresh,
  onDisconnect,
}: {
  account: AccountSummary;
  canManage?: boolean;
  busy?: boolean;
  onRefresh?: () => void;
  onDisconnect?: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="min-w-0 flex-1 truncate text-left text-role-caption font-medium text-text-default underline decoration-dotted decoration-text-faint underline-offset-2 hover:text-blue-600"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {account.label}
        {account.ebayUserId ? <span className="text-text-faint"> · {account.ebayUserId}</span> : null}
      </button>
      <EbayAccountDetailPopover
        account={account}
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        canManage={canManage}
        busy={busy}
        onRefresh={onRefresh}
        onDisconnect={onDisconnect ? () => { onDisconnect(); setOpen(false); } : undefined}
      />
    </>
  );
}
