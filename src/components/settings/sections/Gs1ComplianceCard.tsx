'use client';

/** Settings → Organization → **Product identity (GS1)**. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Panel } from '@/design-system/primitives';
import { FILTER_DROPDOWN_SELECT_CLASS } from '@/design-system/components/FilterDropdownSelect';
import {
  resolveGs1Requirement,
  type Gs1SourceStatus,
} from '@/lib/interop/gs1-keys';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



interface SettingsResponse {
  gs1: { companyPrefix: string; gln: string; cbvUriForm: 'urn' | 'webUri' };
  compliance: {
    hasNewInventory: boolean | null;
    sellsOnAmazon: boolean | null;
    gs1Status: Gs1SourceStatus | null;
    answeredAt: string | null;
  };
}

interface Draft {
  hasNewInventory: boolean | null;
  sellsOnAmazon: boolean | null;
  gs1Status: Gs1SourceStatus | null;
  companyPrefix: string;
  gln: string;
}

const FIELD_CLS =
  'w-full rounded-xl border border-border-default bg-surface-card px-3 py-2 text-sm text-text-default ' +
  cn('placeholder:text-text-faint', focusRing('field', 'accent'));

const GS1_STATUS_OPTIONS: ReadonlyArray<{ key: Gs1SourceStatus; label: string }> = [
  { key: 'prefix', label: 'We hold a GS1 Company Prefix' },
  { key: 'per-item', label: 'We buy individual GTINs per product' },
  { key: 'exempt', label: "We're the brand owner / otherwise exempt" },
  { key: 'none', label: "We don't have one yet" },
];

/** A three-state answer: */
function YesNo({
  value,
  onChange,
  label,
  hint,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text-default">{label}</span>
        <span className="mt-0.5 block text-xs text-text-soft">{hint}</span>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          variant={value === true ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onChange(true)}
          aria-pressed={value === true}
        >
          Yes
        </Button>
        <Button
          variant={value === false ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onChange(false)}
          aria-pressed={value === false}
        >
          No
        </Button>
      </div>
    </div>
  );
}

export function Gs1ComplianceCard() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [answeredAt, setAnsweredAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/admin/organization/settings', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok) {
        setErr("Couldn't load product-identity settings.");
        return;
      }
      const data = (await r.json()) as SettingsResponse;
      setDraft({
        hasNewInventory: data.compliance?.hasNewInventory ?? null,
        sellsOnAmazon: data.compliance?.sellsOnAmazon ?? null,
        gs1Status: data.compliance?.gs1Status ?? null,
        companyPrefix: data.gs1?.companyPrefix ?? '',
        gln: data.gs1?.gln ?? '',
      });
      setAnsweredAt(data.compliance?.answeredAt ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const r = await fetch('/api/admin/organization/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          compliance: {
            hasNewInventory: draft.hasNewInventory,
            sellsOnAmazon: draft.sellsOnAmazon,
            gs1Status: draft.gs1Status,
          },
          // `cbvUriForm` is deliberately absent — PATCH is merge-only over the
          // keys present, so omitting it preserves whatever is on file.
          gs1: { companyPrefix: draft.companyPrefix, gln: draft.gln },
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        // The route answers with the SoT's own refusal ("that is a GS1
        // documentation prefix…"), which is more useful than anything this
        // component could say — surface it verbatim.
        setErr(String((data as { error?: string }).error || "Couldn't save."));
        return;
      }
      setOk('Saved.');
      await load();
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  // Same function the API uses — the reveal and the nag cannot drift from the
  // server's verdict. Fed the draft so it reacts to unsaved edits.
  const requirement = useMemo(
    () =>
      resolveGs1Requirement(draft, {
        companyPrefix: draft?.companyPrefix ?? '',
        gln: draft?.gln ?? '',
      }),
    [draft],
  );

  if (loading) return <div className="text-sm text-text-soft">Loading…</div>;
  if (!draft) {
    return err ? (
      <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
    ) : null;
  }

  return (
    <Panel id="gs1" className="space-y-5 scroll-mt-6">
      <div>
        <h3 className="text-sm font-semibold text-text-default">Product identity (GS1)</h3>
        <p className="mt-1 text-xs text-text-soft">
          Two questions decide whether your printed labels can carry a GS1 barcode. Most resellers
          answer no to both and never need a key — used and refurbished goods don&rsquo;t require one.
        </p>
      </div>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {ok && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</div>}

      <div className="space-y-4">
        <YesNo
          label="We stock brand-new inventory"
          hint="Industry-standard-new product, not only used or refurbished."
          value={draft.hasNewInventory}
          onChange={(v) => setDraft({ ...draft, hasNewInventory: v })}
        />
        <YesNo
          label="We sell on Amazon"
          hint="Amazon requires a product identifier when you create a listing for a new item."
          value={draft.sellsOnAmazon}
          onChange={(v) => setDraft({ ...draft, sellsOnAmazon: v })}
        />
      </div>

      {requirement.required && (
        <div className="space-y-4 border-t border-border-hairline pt-4">
          <label className="block max-w-md">
            <span className="mb-1 block text-xs font-medium text-text-muted">
              How do you get product identifiers (GTINs)?
            </span>
            <select
              value={draft.gs1Status ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  gs1Status: (e.target.value || null) as Gs1SourceStatus | null,
                })
              }
              className={FILTER_DROPDOWN_SELECT_CLASS}
            >
              <option value="">Select…</option>
              {GS1_STATUS_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>

          {draft.gs1Status === 'prefix' && (
            <label className="block max-w-xs">
              <span className="mb-1 block text-xs font-medium text-text-muted">
                GS1 Company Prefix
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.companyPrefix}
                onChange={(e) => setDraft({ ...draft, companyPrefix: e.target.value })}
                className={`${FIELD_CLS} font-mono`}
                placeholder="6–12 digits"
              />
              <span className="mt-1 block text-xs text-text-soft">
                The digits GS1 licensed to your company. An example prefix from GS1&rsquo;s own
                documentation is rejected — those digits belong to someone else.
              </span>
            </label>
          )}

          {requirement.unmet && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You told us you{' '}
              {requirement.reasons.includes('new-inventory') && 'stock new inventory'}
              {requirement.reasons.length === 2 && ' and '}
              {requirement.reasons.includes('amazon') && 'sell on Amazon'}, so your listings will
              need a GTIN. Until a key is on file, labels keep printing your internal codes — they
              scan fine here, they just aren&rsquo;t GS1.{' '}
              <a
                href="https://www.gs1us.org/upcs-barcodes-prefixes"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
              >
                Get one from GS1 US →
              </a>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-border-hairline pt-4">
        <label className="block max-w-xs">
          <span className="mb-1 block text-xs font-medium text-text-muted">
            GLN (Global Location Number) — optional
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={draft.gln}
            onChange={(e) => setDraft({ ...draft, gln: e.target.value })}
            className={`${FIELD_CLS} font-mono`}
            placeholder="13 digits"
          />
        </label>
        <p className="max-w-lg text-xs text-text-soft">
          A GLN identifies a physical <em>place</em>, not a product. You only need one if an EDI or
          EPCIS trading partner asks for it — it is not what Amazon checks, so the questions above
          don&rsquo;t gate it. When set, warehouse bin and bay labels print as a GS1 DataMatrix
          carrying <span className="font-mono">(414)</span>.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border-hairline pt-4">
        <span className="text-xs text-text-faint">
          {answeredAt
            ? `Answered ${new Date(answeredAt).toLocaleDateString()}`
            : 'Not answered yet'}
        </span>
        <Button variant="brand" size="md" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save product identity'}
        </Button>
      </div>
    </Panel>
  );
}
