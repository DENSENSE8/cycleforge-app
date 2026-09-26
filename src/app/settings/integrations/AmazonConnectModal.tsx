'use client';

/** Amazon SP-API connect sheet. */
import { useState } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/design-system/primitives/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { FILTER_DROPDOWN_SELECT_CLASS } from '@/design-system/components/FilterDropdownSelect';
import { ChevronDown, ExternalLink } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



const REGIONS: Array<{ value: 'NA' | 'EU' | 'FE'; label: string }> = [
  { value: 'NA', label: 'North America (US/CA/MX/BR)' },
  { value: 'EU', label: 'Europe (UK/DE/FR/…/IN)' },
  { value: 'FE', label: 'Far East (JP/AU/SG)' },
];

export function AmazonConnectModal({ onClose }: { onClose: () => void }) {
  const [region, setRegion] = useState<'NA' | 'EU' | 'FE'>('NA');
  const [refreshToken, setRefreshToken] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startOauth = () => {
    window.location.href = `/api/amazon/oauth/start?region=${region}`;
  };

  const connectPaste = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/amazon/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken.trim(), sellerId: sellerId.trim() || undefined, region }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || data?.detail || `HTTP ${res.status}`);
        return;
      }
      toast.success(`Amazon connected (${(data.marketplaces || []).length} marketplace(s)).`);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'connection failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent hideClose className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Amazon</DialogTitle>
          <DialogDescription>
            Choose the seller region, then authorize. Multi-tenant OAuth requires a published Selling-Partner app;
            until then, paste a self-authorized refresh token.
          </DialogDescription>
        </DialogHeader>

        <label className="block">
          <span className="text-role-caption font-semibold uppercase tracking-wide text-text-soft">Region</span>
          <div className="relative mt-1">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as 'NA' | 'EU' | 'FE')}
              className={FILTER_DROPDOWN_SELECT_CLASS}
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
          </div>
        </label>

        <div>
          <Button variant="primary" size="md" icon={<ExternalLink />} onClick={startOauth} className="w-full">
            Authorize with Amazon (OAuth)
          </Button>
        </div>

        <div className="flex items-center gap-3 text-role-caption font-medium uppercase tracking-wide text-text-faint">
          <span className="h-px flex-1 bg-surface-strong" /> or paste a refresh token <span className="h-px flex-1 bg-surface-strong" />
        </div>

        <div className="space-y-2">
          <input
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            placeholder="LWA refresh token (Atzr|…)"
            className={cn("block w-full rounded-xl border border-border-soft bg-surface-card px-3 py-2 font-mono text-role-caption text-text-default", focusRing('field', 'neutral'))}
            spellCheck={false}
          />
          <input
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            placeholder="Seller ID (optional)"
            className={cn("block w-full rounded-xl border border-border-soft bg-surface-card px-3 py-2 text-role-caption text-text-default", focusRing('field', 'neutral'))}
          />
        </div>

        {error && <div className="rounded-md bg-red-50 px-2 py-1 text-role-caption font-medium text-red-700">{error}</div>}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={busy} disabled={!refreshToken.trim()} onClick={connectPaste}>
            Verify &amp; Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
