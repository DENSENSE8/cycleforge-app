'use client';

/**
 * The ONE tracking-paste surface on Incoming — one input, two questions.
 *
 * An operator pastes a list of tracking numbers and asks either *"show me
 * these rows"* (**Filter**, the primary) or *"are these received upstream?"*
 * (**Check receipts**, the secondary, previously its own rail). Same paste,
 * same parser, same panel real estate: two boxes would mean pasting the same
 * forty numbers twice and remembering which one answers which question — and
 * two places to fix every paste bug.
 *
 * It PUSHES rather than floats, so the filtered table and this report are on
 * screen together. That adjacency is the whole point: the residuals below name
 * the rows the table cannot show, and reading them side by side is the job.
 *
 * ## The residuals are the feature
 *
 * `?tracking_in=` deliberately relaxes the Incoming lane, so a vendor-received
 * carton comes back instead of vanishing. What the table still cannot show is a
 * tracking this org has never seen, and what it cannot EXPLAIN is one that left
 * the lane for a physical reason. Both are reported here, by key, from a single
 * resolve that is independent of the table's pagination.
 *
 * ## One bucket at a time, at full height (2026-08-03)
 *
 * The residuals used to render as stacked sections, each clipped to its own
 * `max-h-48 overflow-y-auto` box. Two defects, one cause. A 53-tracking paste
 * put **nine** hidden rows behind a ~2.5-row porthole, so the answer to *"where
 * did the rest go"* was itself the thing you had to go hunting for; and each of
 * those boxes was a **nested viewport inside the shell's own scroll port**,
 * which `ui-design-system.md` → *Scroll ownership* bans outright — a component
 * mounted into an existing scroll host is CONTENT, never a viewport.
 *
 * Both are fixed by the same move: the buckets become **leaves** on
 * {@link DeskInspectorIndexShell} — Unbox index→leaf grammar — so exactly one
 * renders at a time, at whatever height it needs, inside the ONE port this
 * shell owns. Back returns to the topic index.
 *
 * ## Why this dropped `SidebarIntakeFormShell`
 *
 * That shell leads with a 32px circled `X` and a wrapping hero title, which is
 * right for a create/import form and wrong here: this panel has no form, and it
 * now has a switcher that wants the top-left corner. It wears the house
 * push-column chrome instead: the band leads with the panel's eyebrow and ends
 * with the reserved cell the host's singleton `X` paints into. Its entry in
 * `INTAKE_SHELL_WITH_REGISTRAR_ALLOWLIST` was removed in the same change; that
 * allowlist is shrink-only.
 *
 * **It used to mount its own close, stacked under the host's.** The band paid
 * `pl-1.5` for a `PaneHeaderCloseButton` sitting at exactly the coordinates
 * `RightRailHostCloseAnchor` already occupied — two dismiss controls, one
 * pixel apart, on a non-modal column. The host owns the close; an occupant
 * reserves the cell and renders nothing into it.
 *
 * Composed, never forked: `RightRailHost` for the slot AND the dismiss,
 * `DeskInspectorIndexShell` for result topics, `OmnichannelComposerDock` for
 * the paste dock, `parseTrackingKeys` for the split. Never mounts station
 * Displays push stack on RightRailHost.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Copy,
  History,
  Maximize2,
  PackageCheck,
  Search,
  X,
} from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { PoChip, TrackingChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button, IconButton, OmnichannelComposerDock } from '@/design-system/primitives';
import type { SectionTab } from '@/design-system/components';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { yieldStationRightEdgeForDeskOccupant } from '@/components/receiving/workspace/line-edit/unbox-right-edge';
import { STATION_DESK_OCCUPANT_CLOSE_EVENT } from '@/utils/events';
import {
  INCOMING_REMOVAL_REASON_FACE,
  type IncomingRemovalReason,
} from '@/lib/receiving/incoming-removal-reason';
import {
  CHECK_ZOHO_RECEIVED_MAX_INPUTS,
  parseTrackingKeys,
  serializeTrackingIn,
  TRACKING_IN_PARAM,
} from '@/lib/receiving/tracking-paste';
import { formatDateTimePST } from '@/utils/date';
import { toast } from '@/lib/toast';
import { resolveCheckRowCarrierTracking } from '@/lib/receiving/check-zoho-received-carrier';
import type {
  CheckZohoReceivedRow,
  CheckZohoReceivedStats,
  CheckZohoReceivedVerdict,
} from '@/lib/receiving/check-zoho-received';
import type { CheckZohoReceivedWatchState } from '@/lib/receiving/watch-state';
import type { TrackingRemovalStatusResult } from '@/lib/receiving/tracking-removal-status';

/** Which question the operator asked last. The results region shows that one. */
type PasteAction = 'filter' | 'check';

/**
 * Bucket ids are unique ACROSS both actions on purpose. The strip re-keys when
 * the operator switches question, and `resolveActiveTabId` falls back to the
 * first tab whenever the held id is absent — so a filter bucket can never
 * silently "match" a check bucket and open the wrong display.
 */
type ResultTabId = 'off-list' | 'not-found' | 'received' | 'not-received' | 'unclear';

type CheckResult = {
  received_in_zoho: CheckZohoReceivedRow[];
  not_received_in_zoho: CheckZohoReceivedRow[];
  undetermined: CheckZohoReceivedRow[];
  stats: CheckZohoReceivedStats;
};

/**
 * The panel's chrome band — `DeskRailChromeRow`'s shape for a rail that has no
 * cursor and no contextual icons: eyebrow at the leading gutter, flex spacer,
 * then the reserved cell the host's singleton `X` paints over.
 *
 * `pl-4` is the body's own content gutter (`px-4`), so the eyebrow's ink lands
 * on the line the heading, the icon strip and every card border beneath it
 * share. `pr-2` matches `DESK_RAIL_CHROME_ROW_CLASS` so the reserved 28px cell
 * sits under the host anchor's `right-2`.
 */
const TOP_BAND_CLASS = 'flex h-9 shrink-0 items-center gap-1.5 pl-4 pr-2';

function reasonLabel(reason: CheckZohoReceivedRow['reason']): string {
  switch (reason) {
    case 'matched':
      return 'matched';
    case 'no_match':
      return 'no PO match';
    case 'ambiguous':
      return 'ambiguous';
    case 'error':
      return 'lookup failed';
    case 'zoho_cap':
      return 'not looked up';
    default:
      return reason;
  }
}

/** Operator wording for the warehouse half — capability nouns, never table names. */
const WATCH_LABEL: Record<CheckZohoReceivedWatchState, string> = {
  delivered_unscanned: 'Delivered · not scanned',
  delivered_not_unboxed: 'Delivered · not unboxed',
  in_flight: 'In transit',
  done: 'Unboxed here',
  unknown: 'No local record',
};

/**
 * The reconciliation verdicts worth a chip. `open` and `settled` are the two
 * normal outcomes and say nothing an operator must act on, so they stay quiet —
 * a chip on every row is a chip on no row.
 */
const VERDICT_CHIP: Partial<
  Record<CheckZohoReceivedVerdict, { label: string; className: string; title: string }>
> = {
  erp_ahead: {
    label: 'No warehouse record',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
    title:
      'The vendor side considers this PO received, but nothing here has been unboxed against it. No continuous feed reports this state — a Zoho-received PO is filtered out of Incoming and out of Delivered · not unboxed.',
  },
  warehouse_ahead: {
    label: 'Zoho behind',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    title:
      'The warehouse has already received this, but the vendor side has not caught up. Push to the purchasing source or re-sync.',
  },
};

const CHIP_CLASS =
  'inset-chip rounded text-role-micro uppercase tracking-widest ring-1 ring-inset';

/**
 * A residual / check row's identity: **PO title + full PO# on top, carrier
 * tracking under it** (when known).
 *
 * Zoho's `reference_number` IS the inbound tracking — never a third "ref …"
 * line. When the paste key was a PO/order number, that key must not also wear
 * a TrackingChip (that was the double order-number bug).
 *
 * Filter residuals still key by tracking and use the compact chip stack.
 * Check rows pass `vendorName` + full PO display so the PO reads as a title.
 */
function RowIdentity({
  poNumber,
  tracking,
  vendorName,
  poAsTitle = false,
}: {
  poNumber: string | null;
  /** Carrier tracking — omit when unknown (honest absence). */
  tracking: string | null;
  vendorName?: string | null;
  /** Check rows: full PO# face + vendor title, not last-8-only stack. */
  poAsTitle?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {poNumber ? (
        poAsTitle ? (
          <div className="min-w-0">
            <PoChip value={poNumber} display={poNumber} dense />
            {vendorName ? (
              <p className="mt-0.5 truncate text-role-micro text-text-muted">{vendorName}</p>
            ) : null}
          </div>
        ) : (
          <PoChip value={poNumber} dense />
        )
      ) : null}
      {tracking ? <TrackingChip value={tracking} dense /> : null}
    </div>
  );
}

async function copyLines(label: string, lines: string[]) {
  if (lines.length === 0) {
    toast.success(`No ${label} to copy`);
    return;
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast.success(`Copied ${lines.length} ${label}`);
  } catch {
    toast.error('Copy failed');
  }
}

function checkCopyBlock(rows: CheckZohoReceivedRow[]): string[] {
  return rows.map((r) => {
    const carrier = resolveCheckRowCarrierTracking(r);
    const bits = [carrier ?? r.tracking];
    if (r.po_number) bits.push(`PO ${r.po_number}`);
    if (r.vendor_name) bits.push(r.vendor_name);
    if (r.status) bits.push(r.status);
    if (r.reason !== 'matched') bits.push(reasonLabel(r.reason));
    if (r.local) bits.push(WATCH_LABEL[r.local.watch]);
    return bits.join('\t');
  });
}

/**
 * One display's body: a teaching line + a copy action, then the rows at FULL
 * height. No `max-h-*` and no `overflow-*` — the shell owns the only port on
 * this surface, and a nested one here is what clipped nine rows to two and a
 * half.
 */
function BucketBody({
  hint,
  copyLabel,
  copyLines: lines,
  empty,
  isEmpty,
  children,
}: {
  hint: string;
  copyLabel: string;
  copyLines: string[];
  /** What "settled, and there is nothing in here" means for THIS bucket. */
  empty: string;
  isEmpty: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-role-micro text-text-faint">{hint}</p>
        <IconButton
          size="sm"
          ariaLabel={`Copy ${copyLabel}`}
          icon={<Copy className="h-3.5 w-3.5" />}
          onClick={() => void copyLines(copyLabel, lines)}
          disabled={isEmpty}
          className="-my-0.5 shrink-0"
        />
      </div>
      {isEmpty ? <p className="text-role-caption text-text-faint">{empty}</p> : children}
    </section>
  );
}

function CheckResultRow({
  row,
  onFocusTracking,
}: {
  row: CheckZohoReceivedRow;
  onFocusTracking: (tracking: string) => void;
}) {
  const verdict = VERDICT_CHIP[row.verdict];
  const carrierTracking = resolveCheckRowCarrierTracking(row);
  // Status / reason only — never "ref …" (reference_number is the tracking chip).
  const meta = [
    row.status ?? null,
    row.reason === 'matched' ? null : reasonLabel(row.reason),
  ].filter(Boolean);

  return (
    <li className="rounded-none bg-surface-card px-2 py-1.5 ring-1 ring-inset ring-border-soft">
      <div className="flex items-start justify-between gap-1.5">
        <RowIdentity
          poNumber={row.po_number}
          tracking={carrierTracking}
          vendorName={row.vendor_name}
          poAsTitle
        />
        {carrierTracking ? (
          <HoverTooltip label="Show only this tracking" focusable={false}>
            <IconButton
              size="xs"
              ariaLabel={`Show ${carrierTracking} in Incoming`}
              icon={<Search className="h-3 w-3" />}
              onClick={() => onFocusTracking(carrierTracking)}
            />
          </HoverTooltip>
        ) : null}
      </div>
      {meta.length > 0 ? (
        <p className="mt-1 text-role-micro text-text-muted">{meta.join(' · ')}</p>
      ) : null}
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {row.local ? (
            <span
              className={`${CHIP_CLASS} bg-surface-canvas text-text-muted ring-border-soft`}
            >
              {WATCH_LABEL[row.local.watch]}
            </span>
          ) : null}
          {verdict ? (
            <HoverTooltip label={verdict.title} focusable={false}>
              <span className={`${CHIP_CLASS} ${verdict.className}`}>{verdict.label}</span>
            </HoverTooltip>
          ) : null}
        </div>
        {row.synced_at ? (
          <HoverTooltip
            label="Answered from the cached PO mirror, not a live lookup."
            focusable={false}
          >
            <span className="shrink-0 text-right text-role-micro text-text-faint">
              {formatDateTimePST(row.synced_at)}
            </span>
          </HoverTooltip>
        ) : null}
      </div>
    </li>
  );
}

/**
 * One "found, but the lane hides it" row, stating its exit.
 *
 * The reason's `blurb` renders VISIBLY under the chip. A chip has to be short
 * enough for a grid column, so on its own it cannot explain itself — and an
 * operator reading nine of these should not have to hover nine times to learn
 * why each box left. The fuller `tip` stays on the chip for the caveat about
 * the sync time.
 */
function HiddenRow({
  row,
  onFocusTracking,
}: {
  row: TrackingRemovalStatusResult['hidden'][number];
  onFocusTracking: (tracking: string) => void;
}) {
  const face = row.reason ? INCOMING_REMOVAL_REASON_FACE[row.reason as IncomingRemovalReason] : null;
  return (
    <li className="rounded-none bg-surface-card px-2 py-1.5 ring-1 ring-inset ring-border-soft">
      <div className="flex items-start justify-between gap-1.5">
        <RowIdentity poNumber={row.po_number} tracking={row.tracking} />
        <HoverTooltip label="Show only this tracking" focusable={false}>
          <IconButton
            size="xs"
            ariaLabel={`Show ${row.tracking} in Incoming`}
            icon={<Search className="h-3 w-3" />}
            onClick={() => onFocusTracking(row.tracking)}
          />
        </HoverTooltip>
      </div>
      {face ? (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <HoverTooltip label={face.tip} focusable={false}>
              <span className={`${CHIP_CLASS} ${face.className}`}>{face.label}</span>
            </HoverTooltip>
            {row.zoho_status_synced_at ? (
              <span className="text-role-micro text-text-faint">
                synced {formatDateTimePST(row.zoho_status_synced_at)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-role-micro text-text-muted">{face.blurb}</p>
        </>
      ) : null}
    </li>
  );
}

export function IncomingBulkTrackingPanel({
  open,
  onClose,
  /** Which action the entry point pre-armed. The chrome Check CTA opens on `check`. */
  initialAction = 'filter',
  /**
   * Unbox (and any check-only host): hide Filter / `?tracking_in=` chrome.
   * Check is the only question; the title is always "Checking unreceived orders".
   */
  checkOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  initialAction?: PasteAction;
  checkOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dockRef = useRef<ComponentRef<typeof OmnichannelComposerDock>>(null);

  const [paste, setPaste] = useState('');
  const [pasteExpanded, setPasteExpanded] = useState(false);
  const [busy, setBusy] = useState<PasteAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<PasteAction>(checkOnly ? 'check' : initialAction);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [filterResult, setFilterResult] = useState<TrackingRemovalStatusResult | null>(null);
  /** Leaf id, or desk inspector index id when Back is on the topic list. */
  const [activeTab, setActiveTab] = useState<string>('off-list');

  const activeFilter = checkOnly ? '' : (searchParams.get(TRACKING_IN_PARAM) || '').trim();
  const panelTitle =
    checkOnly || action === 'check' ? 'Checking unreceived orders' : 'Tracking list';
  const pasteExpandTitle = checkOnly ? 'Paste tracking or order numbers' : 'Paste tracking list';

  useEffect(() => {
    if (!open) return;
    setPaste('');
    setPasteExpanded(false);
    setError(null);
    setCheckResult(null);
    setFilterResult(null);
    setBusy(null);
    setAction(checkOnly ? 'check' : initialAction);
    // One right-edge wrapper: yield Station Displays (+ details / AI) before
    // this RightRailHost claim paints — never stack two push columns. Mounted
    // on Unbox/Arrival Band 1, this panel outlives the browse it opened from
    // (the workbench header stays mounted under a carton, `visibility: hidden`),
    // so without this it painted BESIDE the cockpit's Displays column.
    yieldStationRightEdgeForDeskOccupant((qs) => {
      const base = receivingSurfaceBasePath(pathname);
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    });
    // The operator opened this to paste — put the caret where their hands are.
    const id = window.setTimeout(() => dockRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, initialAction, checkOnly, pathname, router]);

  // The other half of the wrapper — Displays (or a peer desk occupant) opening
  // takes the edge back.
  useEffect(() => {
    if (!open) return;
    const onPeerOpen = () => onClose();
    window.addEventListener(STATION_DESK_OCCUPANT_CLOSE_EVENT, onPeerOpen);
    return () => window.removeEventListener(STATION_DESK_OCCUPANT_CLOSE_EVENT, onPeerOpen);
  }, [open, onClose]);

  /** The split, done once, client-side — same parser the server re-runs. */
  const selection = useMemo(() => parseTrackingKeys(paste), [paste]);
  const canSubmit = selection.keys.length > 0 && busy == null;

  const writeParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${receivingSurfaceBasePath(pathname)}?${qs}` : receivingSurfaceBasePath(pathname));
    },
    [router, pathname, searchParams],
  );

  const applyFilter = useCallback(
    (keys: string[]) => {
      writeParams((params) => {
        params.set(TRACKING_IN_PARAM, serializeTrackingIn(keys));
        // The delivery-state facet is suppressed server-side under this param,
        // so leaving it armed in the URL would show a hot filter chip that is
        // not actually narrowing anything.
        params.delete('state');
      });
    },
    [writeParams],
  );

  const clearFilter = useCallback(() => {
    writeParams((params) => params.delete(TRACKING_IN_PARAM));
  }, [writeParams]);

  /** Narrow to a single tracking — the per-row magnifier. */
  const focusTracking = useCallback(
    (tracking: string) => {
      const one = parseTrackingKeys(tracking);
      if (one.keys.length === 0) return;
      applyFilter(one.keys);
    },
    [applyFilter],
  );

  const runFilter = useCallback(async () => {
    if (!canSubmit) return;
    setBusy('filter');
    setAction('filter');
    setError(null);
    // Filter FIRST: the table narrows immediately, and the residual report
    // lands beside it a moment later. The report explains the result; it must
    // not gate it.
    applyFilter(selection.keys);
    try {
      const res = await fetch('/api/receiving-lines/incoming/tracking-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackings: paste }),
      });
      const data = (await res.json().catch(() => null)) as
        | (TrackingRemovalStatusResult & { success?: boolean; error?: string })
        | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Lookup failed (${res.status})`);
      }
      setFilterResult({ rows: data.rows, not_found: data.not_found, hidden: data.hidden, stats: data.stats });
      // Open on the bucket that actually has something to read. "Off the list"
      // leads because it is the answer to the question that brought the
      // operator here; a not-found key is the rarer, harder case.
      setActiveTab(data.hidden.length > 0 || data.not_found.length === 0 ? 'off-list' : 'not-found');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lookup failed';
      // The filter still applied — say what is missing, not that nothing worked.
      setError(`Filtered, but the residual report is unavailable: ${message}`);
    } finally {
      setBusy(null);
    }
  }, [canSubmit, applyFilter, selection.keys, paste]);

  const runCheck = useCallback(async () => {
    if (!canSubmit) return;
    setBusy('check');
    setAction('check');
    setError(null);
    try {
      const res = await fetch('/api/receiving-lines/incoming/check-zoho-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackings: paste }),
      });
      const data = (await res.json().catch(() => null)) as
        | (CheckResult & { success?: boolean; error?: string })
        | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Check failed (${res.status})`);
      }
      setCheckResult({
        received_in_zoho: data.received_in_zoho ?? [],
        not_received_in_zoho: data.not_received_in_zoho ?? [],
        undetermined: data.undetermined ?? [],
        stats: data.stats,
      });
      setActiveTab('received');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Check failed';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }, [canSubmit, paste]);

  const filterStats = filterResult?.stats;
  const matched = filterStats ? filterStats.applied - filterStats.not_found : 0;

  /**
   * The displays for whichever question was asked last. Built as data so the
   * strip, the counts and the bodies can never disagree about what exists.
   */
  const leaves = useMemo((): DeskInspectorLeaf[] => {
    if (action === 'filter' && filterResult) {
      return [
        {
          id: 'off-list' satisfies ResultTabId,
          label: 'Off the list',
          subtitle: `${filterResult.hidden.length} hidden`,
          icon: History,
          content: (
            <div className="min-h-0 flex-1 overflow-y-auto px-1">
              <BucketBody
                hint="These exist, but the default list hides them. Each row says why."
                copyLabel="hidden rows"
                // Columns in the order the row shows them, so a paste into a
                // sheet lines up with what the operator just read.
                copyLines={filterResult.hidden.map((r) =>
                  [
                    r.po_number ? `PO ${r.po_number}` : '',
                    r.tracking,
                    r.reason ? INCOMING_REMOVAL_REASON_FACE[r.reason].label : '',
                  ]
                    .filter(Boolean)
                    .join('\t'),
                )}
                empty="None of these had left the list."
                isEmpty={filterResult.hidden.length === 0}
              >
                <div className="space-y-2">
                  <ul className="space-y-1.5">
                    {filterResult.hidden.map((row) => (
                      <HiddenRow key={row.key} row={row} onFocusTracking={focusTracking} />
                    ))}
                  </ul>
                </div>
              </BucketBody>
            </div>
          ),
        },
        {
          id: 'not-found' satisfies ResultTabId,
          label: 'Not found',
          subtitle: `${filterResult.not_found.length} unknown`,
          icon: AlertCircle,
          content: (
            <div className="min-h-0 flex-1 overflow-y-auto px-1">
              <BucketBody
                hint="Nothing in this workspace carries these numbers at all."
                copyLabel="not found"
                copyLines={filterResult.not_found}
                empty="Every tracking resolved to an inbound shipment."
                isEmpty={filterResult.not_found.length === 0}
              >
                <ul className="space-y-1 rounded-none border border-border-soft bg-surface-canvas/60 p-2">
                  {filterResult.not_found.map((key) => (
                    <li key={key} className="break-all font-mono text-role-caption text-text-default">
                      {key}
                    </li>
                  ))}
                </ul>
              </BucketBody>
            </div>
          ),
        },
      ];
    }

    if (action === 'check' && checkResult) {
      const section = (
        id: ResultTabId,
        label: string,
        icon: SectionTab['icon'],
        hint: string,
        empty: string,
        rows: CheckZohoReceivedRow[],
      ): DeskInspectorLeaf => ({
        id,
        label,
        subtitle: `${rows.length}`,
        icon,
        content: (
          <div className="min-h-0 flex-1 overflow-y-auto px-1">
            <BucketBody
              hint={hint}
              copyLabel={label.toLowerCase()}
              copyLines={checkCopyBlock(rows)}
              empty={empty}
              isEmpty={rows.length === 0}
            >
              <ul className="space-y-1.5">
                {rows.map((row) => (
                  <CheckResultRow
                    key={`${row.tracking}:${row.po_number ?? ''}:${row.reason}`}
                    row={row}
                    onFocusTracking={focusTracking}
                  />
                ))}
              </ul>
            </BucketBody>
          </div>
        ),
      });

      return [
        section(
          'received',
          'Received',
          PackageCheck,
          'The purchasing source reports these POs received.',
          'None of these are received yet.',
          checkResult.received_in_zoho,
        ),
        section(
          'not-received',
          'Not received',
          Clock,
          'Still open on the purchasing source.',
          'None are still open.',
          checkResult.not_received_in_zoho,
        ),
        section(
          'unclear',
          'Unclear',
          AlertTriangle,
          'No matching PO, an ambiguous match, a failed lookup, or past the live-lookup cap. These are unknown — not open.',
          'Every tracking gave a clear answer.',
          checkResult.undetermined,
        ),
      ];
    }

    return [];
  }, [action, filterResult, checkResult, focusTracking]);

  if (!open) return null;

  return (
    <>
    <DetailStackRailRegistrar
      id="detail:incoming-bulk-tracking"
      onClose={onClose}
      modal={false}
      ariaLabel={panelTitle}
    >
      <div className="flex h-full min-h-0 flex-col bg-surface-card">
        {/* Chrome band. The dismiss is the HOST's singleton `X` at the
            top-right (`RightRailHostCloseAnchor`); this row reserves that cell
            so the eyebrow can never truncate underneath it, and mounts no
            close of its own. */}
        <div className={TOP_BAND_CLASS}>
          <p className="min-w-0 truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
            {panelTitle}
          </p>
          <div className="flex-1" />
          <span
            className="inline-block h-7 w-7 shrink-0"
            aria-hidden
            data-right-rail-host-close-slot
          />
        </div>

        {/* Stats / paste feedback above the topic shell; buckets own their scroll. */}
        <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 space-y-3 px-4 pb-2 pt-3">
          {error ? (
            <p className="text-role-caption font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : leaves.length === 0 ? (
            <p className="text-role-caption text-text-faint">
              {checkOnly ? (
                <>
                  Paste tracking or order numbers, one per line (or comma-separated). Asks the
                  purchasing source whether each is received. Max {CHECK_ZOHO_RECEIVED_MAX_INPUTS}.
                </>
              ) : (
                <>
                  One per line (or comma-separated). Tracking or order numbers work.{' '}
                  <strong>Filter</strong> narrows the list to these rows — including ones the lane
                  normally hides. <strong>Check receipts</strong> asks the purchasing source
                  whether they are received. Max {CHECK_ZOHO_RECEIVED_MAX_INPUTS}.
                </>
              )}
            </p>
          ) : null}

          {selection.truncated > 0 ? (
            <p className="rounded-none bg-amber-50 px-2 py-1.5 text-role-caption text-amber-800 ring-1 ring-inset ring-amber-200">
              {selection.requested} pasted — only the first {selection.keys.length} will be used.
            </p>
          ) : null}

          {!checkOnly && activeFilter ? (
            <div className="flex items-center justify-between gap-2 rounded-none bg-blue-50 px-2 py-1.5 ring-1 ring-inset ring-blue-200">
              <p className="text-role-caption text-blue-800">
                {(() => {
                  const n = activeFilter.split(',').filter(Boolean).length;
                  return `The list is filtered to ${n} tracking number${n === 1 ? '' : 's'}.`;
                })()}
              </p>
              <Button variant="ghost" size="sm" onClick={clearFilter}>
                Clear
              </Button>
            </div>
          ) : null}

          {!checkOnly && action === 'filter' && filterStats ? (
            /* "tracking numbers" is load-bearing: these counts are per KEY,
               while the table below counts LINES, and one PO can carry several.
               Measured on real data a 42-tracking paste resolved to 46 rows —
               without the unit the two numbers read as a bug. */
            <p className="text-role-micro text-text-muted">
              {matched} of {filterStats.applied} tracking numbers matched
              {filterStats.not_found > 0 ? ` · ${filterStats.not_found} not found` : ''}
              {filterStats.truncated > 0
                ? ` · showing the first ${filterStats.applied} of ${filterStats.requested}`
                : ''}
            </p>
          ) : null}

          {action === 'check' && checkResult ? (
            <div className="space-y-2">
              <p className="text-role-micro text-text-muted">
                {checkResult.stats.unique_count} unique · {checkResult.stats.mirror_hits} cached ·{' '}
                {checkResult.stats.zoho_lookups} live
                {checkResult.stats.errors > 0 ? ` · ${checkResult.stats.errors} failed` : ''}
              </p>
              {checkResult.stats.erp_ahead > 0 ? (
                <p className="rounded-none bg-rose-50 px-2 py-1.5 text-role-caption text-rose-700 ring-1 ring-inset ring-rose-200">
                  {checkResult.stats.erp_ahead} received upstream with no warehouse record — these
                  appear on no watch list today.
                </p>
              ) : null}
              {checkResult.stats.warehouse_ahead > 0 ? (
                <p className="rounded-none bg-amber-50 px-2 py-1.5 text-role-caption text-amber-800 ring-1 ring-inset ring-amber-200">
                  {checkResult.stats.warehouse_ahead} received here but not upstream.
                </p>
              ) : null}
            </div>
          ) : null}

        </div>

          {leaves.length > 0 ? (
            <DeskInspectorIndexShell
              leaves={leaves}
              activeId={activeTab}
              onActiveIdChange={setActiveTab}
              ariaLabel={
                action === 'check' ? 'Unreceived order check results' : 'Tracking results'
              }
              testId="incoming-bulk-tracking-inspector-index"
              backLabel="Back to topics"
              className="min-h-0 flex-1 px-3"
            />
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border-soft bg-surface-card px-3 py-2">
          <OmnichannelComposerDock
            ref={dockRef}
            value={paste}
            onChange={setPaste}
            // Enter commits the PRIMARY — the same control the trailing button
            // is, per the dock's contract. Shift+Enter newlines, which is what
            // a multi-line paste needs.
            onCommit={() => void (checkOnly ? runCheck() : runFilter())}
            placeholder="Paste tracking or order numbers…"
            ariaLabel="Tracking or order numbers"
            hideCommitButton
            // Stacked paste field: a bit taller than the old compact row, with
            // CSS drag-resize so long lists fit without leaving the sidebar.
            density="default"
            manualResize
            manualResizeMinPx={72}
            animateMount={false}
            disabled={busy != null}
            footerStart={
              <HoverTooltip label="Expand paste" asChild>
                <IconButton
                  size="sm"
                  tone="neutral"
                  ariaLabel="Expand paste"
                  icon={<Maximize2 className="h-3.5 w-3.5" />}
                  onClick={() => setPasteExpanded(true)}
                  disabled={busy != null}
                />
              </HoverTooltip>
            }
            trailingAction={
              <div className="flex items-center gap-1.5">
                {checkOnly ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void runCheck()}
                    disabled={!canSubmit}
                  >
                    {busy === 'check' ? 'Checking…' : 'Check'}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void runCheck()}
                      disabled={!canSubmit}
                    >
                      {busy === 'check' ? 'Checking…' : 'Check receipts'}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void runFilter()}
                      disabled={!canSubmit}
                    >
                      {busy === 'filter' ? 'Filtering…' : 'Filter'}
                    </Button>
                  </>
                )}
              </div>
            }
          />
        </div>
      </div>
    </DetailStackRailRegistrar>

      <RightPaneOverlay
        open={pasteExpanded}
        onClose={() => setPasteExpanded(false)}
        align="center"
        anchor="viewport"
        resizable
        storageKey="incoming-bulk-tracking-paste-expand"
        minWidth={420}
        minHeight={360}
        className="flex h-[min(72vh,36rem)] w-[min(92vw,40rem)] flex-col"
        aria-label={pasteExpandTitle}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-text-default">{pasteExpandTitle}</h2>
          <IconButton
            type="button"
            onClick={() => setPasteExpanded(false)}
            ariaLabel="Collapse paste"
            icon={<X className="h-4 w-4" />}
          />
        </div>
        <div className="min-h-0 flex-1 p-4">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            autoFocus
            rows={12}
            disabled={busy != null}
            placeholder="Paste tracking or order numbers…"
            aria-label={pasteExpandTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (!canSubmit) return;
                setPasteExpanded(false);
                void (checkOnly ? runCheck() : runFilter());
              }
            }}
            className={cn(
              'block h-full min-h-[14rem] w-full resize-none rounded-none border border-border-soft bg-surface-card px-3.5 py-2.5 text-role-caption leading-relaxed text-text-default outline-none placeholder:text-text-faint',
              focusRing('field', 'accent'),
            )}
          />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-hairline px-4 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setPasteExpanded(false)}>
            Done
          </Button>
          {checkOnly ? (
            <Button
              variant="primary"
              size="sm"
              disabled={!canSubmit}
              onClick={() => {
                setPasteExpanded(false);
                void runCheck();
              }}
            >
              {busy === 'check' ? 'Checking…' : 'Check'}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canSubmit}
                onClick={() => {
                  setPasteExpanded(false);
                  void runCheck();
                }}
              >
                {busy === 'check' ? 'Checking…' : 'Check receipts'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!canSubmit}
                onClick={() => {
                  setPasteExpanded(false);
                  void runFilter();
                }}
              >
                {busy === 'filter' ? 'Filtering…' : 'Filter'}
              </Button>
            </>
          )}
        </div>
      </RightPaneOverlay>
    </>
  );
}
