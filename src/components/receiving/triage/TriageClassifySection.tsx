'use client';

/**
 * Classify controls — Urgency / Platform / Type
 * (+ ticket link only where the host has nowhere better).
 *
 * **No repair-order link (removed 2026-08-19).** Classify grades what the
 * carton IS; attaching it to a store / repair order is a PAIRING act and lives
 * on the Link body's Store avenue — one identify host. A CTA here was a second
 * door onto that same search.
 *
 * **Unbox does NOT mount the ticket row here (moved 2026-08-19).** Classify
 * grades what the carton IS (urgency · platform · type); linking it to a ticket
 * is a PAIRING act, so on Unbox `Find ticket` lives on the Linkage (Pairing)
 * actions list beside Link · Return # · Store. `onFindTicket` stays for hosts
 * with no Linkage leaf of their own — Arrival, whose Displays column is Pairing
 * only. Do not re-thread it from Unbox: that is the second door this move
 * removed.
 *
 * Shared by Arrival (centre door-flow chrome host under items) + Unbox Classify
 * Displays. Flush plane (no WorkspaceCard glass island) — edge-to-edge host
 * (`px-0`); dimension rows are house flush comboboxes
 * ({@link SearchableSelectField} `appearance="flush"`) — same quick-search
 * grammar as receiving claim type / Add Inbound Platform · Type · Priority.
 *
 * **Link ticket** opens Ticket Displays → Link (seeded with carton tracking) or
 * Chat when already linked — found and unfound. Never mounts a second ticket
 * picker inside Classify.
 *
 * Mobile Arrival classify identify is out of scope (desktop Displays / centre
 * hosts only).
 */

import { useEffect, useMemo, useRef } from 'react';
import { ChevronRight, Ticket } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  platformClassifyOptions,
  typeClassifyOptions,
  urgencyClassifyOptions,
} from '../workspace/line-edit/classify-pill-options';
import { receivingPriorityRank, receivingPriorityTone } from '../workspace/line-edit/receiving-priority';
import { priorityOverrideTier } from '@/lib/receiving/priority-override';
import { usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import type { UnboxLineController } from '../workspace/line-edit/unbox-line-controller';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';





type ClassifyPicker = 'urgency' | 'platform' | 'type';

type ClassifyExpandDimension = ClassifyPicker;

/** Flush Displays / Arrival door-flow body — edge-to-edge; comboboxes own pad. */
const CLASSIFY_FLUSH_HOST_CLASS = cn('min-h-0', cornerClass('flush'));

const EXPAND_ARIA: Record<ClassifyPicker, string> = {
  urgency: 'Urgency',
  platform: 'Platform',
  type: 'Type',
};

const RANK_TO_TIER: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3 };

export function TriageClassifySection({
  row,
  c,
  expandDimension = null,
  expandRequestId = 0,
  listPlacement = 'bottom-stretch',
  onFindTicket,
}: {
  row: ReceivingLineRow;
  c: UnboxLineController;
  /**
   * Header bookmark handoff — open this dimension's combobox when the host
   * switches to Classify (or bumps {@link expandRequestId} while already here).
   */
  expandDimension?: ClassifyExpandDimension | null;
  /** Monotonic bump so a closed row can be re-opened from the header pill. */
  expandRequestId?: number;
  /**
   * Combobox list edge. Default opens down (Displays / Arrival centre).
   * Unbox unfound dock Band 1 sits on the floor — pass `top-stretch` so
   * Urgency · Platform · Type open upward into free canvas.
   */
  listPlacement?: 'bottom-stretch' | 'top-stretch';
  /**
   * Open Ticket Displays — Link existing when unlinked (search seeded with
   * carton tracking), Chat when linked. Required for the Link ticket row;
   * omit only when the host cannot open Ticket Displays.
   */
  onFindTicket?: () => void;
}) {
  const isUnmatched = row.receiving_source === 'unmatched';
  const platformCatalog = usePlatformCatalog();
  const typeCatalog = useReceivingTypeCatalog();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastExpandRef = useRef<{ dim: ClassifyPicker | null; id: number }>({
    dim: null,
    id: -1,
  });
  const receivingId = row.receiving_id ?? null;
  const hasTicket = c.providerTicketId != null;
  const ticketLabel =
    c.supportTicket?.label?.trim() ||
    (c.providerTicketId != null ? `#${c.providerTicketId}` : null);
  const showTicketLink = typeof onFindTicket === 'function' && receivingId != null && receivingId > 0;


  // Header classify pill → open the matching flush combobox (click its trigger).
  useEffect(() => {
    if (expandDimension == null) return;
    if (
      lastExpandRef.current.dim === expandDimension &&
      lastExpandRef.current.id === expandRequestId
    ) {
      return;
    }
    lastExpandRef.current = { dim: expandDimension, id: expandRequestId };
    const aria = EXPAND_ARIA[expandDimension];
    const t = window.setTimeout(() => {
      const btn = rootRef.current?.querySelector(
        `button[role="combobox"][aria-label="${aria}"]`,
      );
      if (btn instanceof HTMLElement) btn.click();
    }, 50);
    return () => window.clearTimeout(t);
  }, [expandDimension, expandRequestId]);

  const derivedRank = receivingPriorityRank(isUnmatched, c.sourcePlatform, false);
  const derivedTone = receivingPriorityTone(derivedRank);
  const overrideMeta = priorityOverrideTier(c.priorityTier);
  const urgencyValue = c.priorityTier != null ? String(c.priorityTier) : 'auto';
  const derivedTierEquivalent =
    c.priorityTier == null ? (RANK_TO_TIER[derivedRank] ?? null) : null;

  const urgencyOptions = urgencyClassifyOptions({
    derivedLabel: derivedTone.label,
    derivedTierEquivalent,
    autoActiveClass: 'border-border-default bg-surface-card text-text-muted',
  });

  const platformOptions = platformClassifyOptions({
    catalogOptions: platformCatalog.options,
    isUnmatched,
  });
  const typeOptions = typeClassifyOptions({ catalogOptions: typeCatalog.options });

  const urgencySelectOptions = useMemo(
    () =>
      urgencyOptions.map((o) => ({
        value: o.value,
        label:
          o.value === 'auto' && overrideMeta == null
            ? `Auto · ${derivedTone.label}`
            : o.label,
        meta: o.title,
        // Platform/org policy first; manual pins in a trailing group (Priority last).
        group: o.value === 'auto' ? 'Platform' : 'Manual override',
      })),
    [urgencyOptions, overrideMeta, derivedTone.label],
  );

  const platformSelectOptions = useMemo(
    () =>
      platformOptions.map((o) => ({
        value: o.value,
        label: o.label,
        meta: o.title,
        group: 'Platforms',
      })),
    [platformOptions],
  );

  const typeSelectOptions = useMemo(
    () =>
      typeOptions.map((o) => ({
        value: o.value,
        label: o.label,
        meta: o.title,
        group: 'Standard types',
      })),
    [typeOptions],
  );

  return (
    <div className={CLASSIFY_FLUSH_HOST_CLASS}>
      {/* One card plane — flush combobox cells (floating labels), same grammar
          as Add Inbound / claim type. Keyboard: Tab walks triggers; ArrowDown /
          Enter / typeahead open; Escape returns focus. */}
      <div
        ref={rootRef}
        data-testid="triage-classify-checklist"
        className="divide-y divide-border-hairline border-b border-border-hairline"
      >
        <SearchableSelectField
          appearance="flush"
          placement={listPlacement}
          label="Urgency"
          value={urgencyValue}
          onChange={(id) => {
            if (id == null) return;
            const next = String(id);
            void c.handlePrioritySelect(next === 'auto' ? null : Number(next));
          }}
          options={urgencySelectOptions}
          placeholder="Search or select…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No urgencies match"
          ariaLabel="Urgency"
        />
        <SearchableSelectField
          appearance="flush"
          placement={listPlacement}
          label="Platform"
          value={c.sourcePlatform}
          disabled={row.receiving_id == null}
          onChange={(id) => {
            if (id == null) return;
            const next = String(id);
            c.setSourcePlatform(next);
            void c.savePlatform(next, {
              isReturn: String(c.receivingType ?? '').trim().toUpperCase() === 'RETURN',
            });
          }}
          options={platformSelectOptions}
          placeholder="Search or select…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No platforms match"
          ariaLabel="Platform"
        />
        <SearchableSelectField
          appearance="flush"
          placement={listPlacement}
          label="Type"
          value={c.receivingType || null}
          onChange={(id) => {
            if (id == null) return;
            const next = String(id);
            c.setReceivingType(next);
            void c.saveType(next);
          }}
          options={typeSelectOptions}
          placeholder="Search or select…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No types match"
          ariaLabel="Type"
        />
      </div>

      {/* Link ticket — found + unfound. Jumps to Ticket Displays (Link / Chat);
          never mounts a second TicketPicker here. */}
      {showTicketLink ? (
        <div
          data-testid="triage-classify-link-ticket"
          className="border-t border-border-hairline"
        >
          <button
            type="button"
            onClick={onFindTicket}
            className={cn(
              'flex w-full items-center gap-2.5 inset-cozy text-left',
              focusRing('control', 'accent'),
            )}
          >
            <span
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center text-text-muted',
                cornerClass('flush'),
              )}
              aria-hidden
            >
              <Ticket className="h-3.5 w-3.5" />
            </span>
            {hasTicket && ticketLabel ? (
              <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
                {ticketLabel} · Linked
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                Link ticket
              </span>
            )}
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
          </button>
        </div>
      ) : null}

    </div>
  );
}
