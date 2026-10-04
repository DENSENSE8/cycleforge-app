'use client';

/** The ONE tracking-paste surface on Incoming — one input, two questions. */

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
import { STATION_DESK_OCCUPANT_CLOSE_EVENT } from '@/utils/events';
import { setDetailInspectorCollapsed } from '@/design-system/shells/detail-stack';
import { openPanel } from '@/lib/right-rail/panel-store';
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
import type { CheckZohoReceivedRow, CheckZohoReceivedStats } from '@/lib/receiving/check-zoho-received';
import type { CheckZohoReceivedWatchState } from '@/lib/receiving/watch-state';
import type { TrackingRemovalStatusResult } from '@/lib/receiving/tracking-removal-status';

/** Which question the operator asked last. The results region shows that one. */
type PasteAction = 'filter' | 'check';

/** Bucket ids are unique ACROSS both actions on purpose. */
type ResultTabId = 'off-list' | 'not-found' | 'received' | 'not-received' | 'unclear';

type CheckResult = {
  received_in_zoho: CheckZohoReceivedRow[];
  not_received_in_zoho: CheckZohoReceivedRow[];
  undetermined: CheckZohoReceivedRow[];
  stats: CheckZohoReceivedStats;
};

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

/** Physical receipt only — a dock scan or an unbox here. The ERP's status never decides it. */
function physicallyReceived(row: CheckZohoReceivedRow): boolean {
  return Boolean(row.local?.scanned || row.local?.unboxed);
}

const CHIP_CLASS =
  'inset-chip rounded text-role-micro ring-1 ring-inset';

/** A residual / check row's identity: */
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
    if (r.reason !== 'matched') bits.push(reasonLabel(r.reason));
    if (r.local) bits.push(WATCH_LABEL[r.local.watch]);
    return bits.join('\t');
  });
}

/** One display's body: */
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
  const carrierTracking = resolveCheckRowCarrierTracking(row);
  // Reason only — never the ERP's PO status, never "ref …" (reference_number is the tracking chip).
  const meta = row.reason === 'matched' ? null : reasonLabel(row.reason);

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
      {meta ? <p className="mt-1 text-role-micro text-text-muted">{meta}</p> : null}
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {row.local ? (
            <span
              className={`${CHIP_CLASS} bg-surface-canvas text-text-muted ring-border-soft`}
            >
              {WATCH_LABEL[row.local.watch]}
            </span>
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

/** One "found, but the lane hides it" row, stating its exit. */
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

/** The panel's ONE RightRailHost occupant (Check receipts / tracking filter). */
const BULK_TRACKING_RAIL_ID = 'detail:incoming-bulk-tracking';

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
  /**
   * The BAND title is the current segment — one short noun, never the sentence.
   * `panelTitle` stays the accessible region name, which is where a full phrase
   * belongs; the band's flex-1 cell is a label, not a narration.
   */
  const bandTitle = checkOnly || action === 'check' ? 'Receipts' : 'Tracking';
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
    setDetailInspectorCollapsed(false);
    openPanel({ id: BULK_TRACKING_RAIL_ID });
  }, [open, initialAction, checkOnly]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => dockRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, initialAction, checkOnly]);

  // A peer desk occupant can take the shared inspector slot.
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
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
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
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
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
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
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

      const owed = [...checkResult.received_in_zoho, ...checkResult.not_received_in_zoho];
      return [
        section(
          'received',
          'Received',
          PackageCheck,
          'Scanned at the dock or unboxed here.',
          'None of these are scanned or unboxed yet.',
          [...owed, ...checkResult.undetermined].filter(physicallyReceived),
        ),
        section(
          'not-received',
          'Not received',
          Clock,
          'Not scanned or unboxed here yet. Each row says where it is.',
          'Every one is scanned or unboxed.',
          owed.filter((row) => !physicallyReceived(row)),
        ),
        section(
          'unclear',
          'Unclear',
          AlertTriangle,
          'No matching PO, an ambiguous match, a failed lookup, or past the live-lookup cap. These are unknown — not open.',
          'Every tracking gave a clear answer.',
          checkResult.undetermined.filter((row) => !physicallyReceived(row)),
        ),
      ];
    }

    return [];
  }, [action, filterResult, checkResult, focusTracking]);

  /** Paste feedback — errors, the help line, truncation, the active filter chip and the resolve summary. */
  const feedback = (
    <>
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
          /* "tracking numbers" is load-bearing: */
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
          </div>
        ) : null}

    </>
  );

  const hasFeedback =
    Boolean(error) ||
    leaves.length === 0 ||
    selection.truncated > 0 ||
    Boolean(!checkOnly && activeFilter) ||
    Boolean(!checkOnly && action === 'filter' && filterStats) ||
    Boolean(action === 'check' && checkResult);

  if (!open) return null;

  const panelBody = (
    <div className="flex h-full min-h-0 flex-col bg-surface-card">
        {/* ONE band, and it is the TOP row of the card. */}
        {leaves.length > 0 ? (
          <DeskInspectorIndexShell
            stance="index"
            title={bandTitle}
            leaves={leaves}
            activeId={activeTab}
            onActiveIdChange={setActiveTab}
            ariaLabel={
              action === 'check' ? 'Unreceived order check results' : 'Tracking results'
            }
            testId="incoming-bulk-tracking-inspector-index"
            backLabel="Back to topics"
            className="min-h-0 flex-1"
          />
        ) : (
          // Nothing pasted yet (or the paste failed): one body, no topics above
          // it, so no Back is owed and the stance says so.
          <DeskInspectorIndexShell
            stance="standalone"
            title={bandTitle}
            ariaLabel={panelTitle}
            testId="incoming-bulk-tracking-inspector-index"
            className="min-h-0 flex-1"
            body={<div className="space-y-3 px-4 pb-2 pt-3">{feedback}</div>}
          />
        )}

        {leaves.length > 0 && hasFeedback ? (
          <div className="shrink-0 space-y-3 border-t border-border-soft px-4 py-2">
            {feedback}
          </div>
        ) : null}

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
  );

  return (
    <>
      <DetailStackRailRegistrar
        id={BULK_TRACKING_RAIL_ID}
        onClose={onClose}
        modal={false}
        edgeCollapse={false}
        resumeOnDismiss={false}
        ariaLabel={panelTitle}
      >
        {panelBody}
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
