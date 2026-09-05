'use client';

/**
 * Desk L2: search every item-number → picker/packer rule.
 * Opened from the assign toast Edit CTA — table stays mounted underneath.
 */

import { useEffect, useMemo, useState } from 'react';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { SearchField } from '@/design-system/primitives/SearchField';
import { DROPDOWN_ITEM_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { ListingStaffRuleRow } from '@/lib/automations/listing-staff-rule-row';
import { OPEN_LISTING_STAFF_RULES_EVENT } from '@/utils/events';

export function ListingStaffRulesOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ListingStaffRuleRow[]>([]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/automations/listing-assign?view=rules');
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          items?: ListingStaffRuleRow[];
        } | null;
        if (cancelled) return;
        if (!res.ok || !body?.success) {
          setError(body?.error || `Could not load rules (${res.status})`);
          setItems([]);
          return;
        }
        setItems(Array.isArray(body.items) ? body.items : []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load rules');
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) => {
      const hay = [row.itemNumber, row.techName, row.packerName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <DeskStageOverlay
      open={open}
      onClose={onClose}
      fill="inset"
      title="Listing → staff rules"
      subtitle="Repeating picker and packer by item number"
      testId="listing-staff-rules-overlay"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search rules…"
          tone="gray"
          size="compact"
          autoFocus
          debounceMs={0}
        />
        {loading ? (
          <p className="text-role-caption text-text-muted">Loading rules…</p>
        ) : null}
        {error ? <p className="text-role-caption text-text-danger">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <p className="text-role-caption text-text-muted">
            {items.length === 0 ? 'No listing rules yet' : 'No matches'}
          </p>
        ) : null}
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {filtered.map((row) => (
            <li
              key={row.id}
              className={cn(
                'flex items-baseline justify-between gap-3 px-2.5 py-2',
                DROPDOWN_ITEM_CORNER,
                'bg-surface-sunken',
              )}
            >
              <span className="min-w-0 truncate font-mono text-role-caption tabular-nums text-text-default">
                {row.itemNumber}
              </span>
              <span className="shrink-0 text-role-micro text-text-muted">
                {[row.techName, row.packerName].filter(Boolean).join(' · ') || 'Unassigned'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DeskStageOverlay>
  );
}

/** One listener per desk body — toast Edit opens this overlay. */
export function ListingStaffRulesHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_LISTING_STAFF_RULES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LISTING_STAFF_RULES_EVENT, onOpen);
  }, []);
  return <ListingStaffRulesOverlay open={open} onClose={() => setOpen(false)} />;
}
