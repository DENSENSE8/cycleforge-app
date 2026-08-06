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
 * Both are fixed by the same move: the buckets become **displays** on a
 * {@link SectionTabsSlider} `density="icon"` strip — the Unbox Displays
 * grammar — so exactly one renders at a time, at whatever height it needs,
 * inside the ONE port this shell owns. Panels stay mounted behind `hidden`, so
 * switching keeps each bucket's scroll position.
 *
 * ## Why this dropped `SidebarIntakeFormShell`
 *
 * That shell leads with a 32px circled `X` and a wrapping hero title, which is
 * right for a create/import form and wrong here: this panel has no form, and it
 * now has a switcher that wants the top-left corner. It wears the house
 * push-column chrome instead — `PaneHeaderCloseButton` (`→|`, the panel parks
 * back against the edge it came from) at the band's top-left, the icon strip
 * beneath it. Its entry in `INTAKE_SHELL_WITH_REGISTRAR_ALLOWLIST` was removed
 * in the same change; that allowlist is shrink-only.
 *
 * Composed, never forked: `RightRailHost` for the slot, `SectionTabsSlider` for
 * the display switcher, `PaneHeaderCloseButton` for the dismiss,
 * `OmnichannelComposerDock` for the paste dock, `parseTrackingKeys` for the
 * split.
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
  PackageCheck,
  Search,
} from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { PoChip, TrackingChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PaneHeaderCloseButton } from '@/components/ui/pane-header';
import { SectionTabsSlider, type SectionTab } from '@/design-system/components';
import { Button, IconButton, OmnichannelComposerDock } from '@/design-system/primitives';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
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
 * The band that carries the panel's own dismiss, at its top-LEFT.
 *
 * `pl-1.5` is the optical gutter, not a guess. `PaneHeaderCloseButton` is a
 * 32px box around a 16px glyph, so the box insets its mark 8px, and the lucide
 * arrow draws ~1.3px inside its own viewBox at that size — ~9.3px of inset
 * before the band's padding. The body's content gutter is `px-4` (16px), so the
 * band pays the difference (6px) and the MARK lands on the gutter that the
 * heading, the icon strip and every card border beneath it share.
 *
 * A hit box may bleed past the content edge; the mark the operator reads may
 * not sit off it — `ui-design-system.md` → *A leading glyph aligns to a text
 * gutter OPTICALLY*.
 */
const TOP_BAND_CLASS = 'flex h-9 shrink-0 items-center gap-1.5 pl-1.5 pr-3';

/**
 * The icon strip's half of the same gutter. Its cells are 14px glyphs in 26px
 * boxes (`compact`), so a box parked on the `px-4` edge draws its mark ~7px
 * inside it — `-ml-2` pulls the ROW back so the first glyph's ink sits on the
 * gutter. Identical to the Unbox Displays strip, for the identical reason.
 */
const STRIP_HEADER_CLASS = '-ml-2';

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
 * A residual row's identity: **PO on top, tracking under it**, both as typed
 * `CopyChip`s.
 *
 * Two rulings, one block. The identifiers were raw `font-mono` text, so an
 * operator could read a tracking number but not copy one without selecting it
 * by hand — `source-of-truth.md` → *Typed identifiers use the semantic CopyChip
 * family*, and this surface exists precisely to be pasted out of.
 *
 * The PO leads because it is what the operator navigates by. The row is KEYED
 * by a tracking number, but a tracking number is a carrier's handle on a box;
 * the PO is the handle on the pick list, the carton label and the vendor email,
 * and it is what the reason chip beneath now names ("PO cancelled"). Same
 * reasoning that freezes `order` into the leading identity pane on every
 * order-anchored grid.
 *
 * **Both chips wear one face: `dense`, last-8, mono.** They are the same KIND
 * of thing — an identifier this row is keyed by — so a size or truncation
 * difference between them reads as a hierarchy that is not there. The first
 * cut shipped a full-length, non-dense PO stacked on a dense last-8 tracking,
 * and the PO visibly out-ranked the number the row is actually keyed by.
 * Last-8 is the display SoT for every typed id chip (`copy-chip-format.ts`);
 * both chips now take it from the primitive rather than the call site.
 *
 * A row with no PO renders the tracking alone rather than a placeholder:
 * honest absence, never an invented face.
 */
function RowIdentity({ poNumber, tracking }: { poNumber: string | null; tracking: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {poNumber ? <PoChip value={poNumber} dense /> : null}
      <TrackingChip value={tracking} dense />
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
    const bits = [r.tracking];
    if (r.po_number) bits.push(`PO ${r.po_number}`);
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
  // The PO left this line when it became a chip above — restating it here
  // would pay for the same fact twice on every row.
  const meta = [
    row.reference_number && row.reference_number !== row.tracking
      ? `ref ${row.reference_number}`
      : null,
    row.status ?? null,
    row.reason === 'matched' ? null : reasonLabel(row.reason),
  ].filter(Boolean);

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
      {meta.length > 0 ? (
        <p className="mt-1 text-role-micro text-text-muted">{meta.join(' · ')}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1">
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
        {row.synced_at ? (
          <HoverTooltip
            label="Answered from the cached PO mirror, not a live lookup."
            focusable={false}
          >
            <span className="text-role-micro text-text-faint">
              as of {formatDateTimePST(row.synced_at)}
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
}: {
  open: boolean;
  onClose: () => void;
  initialAction?: PasteAction;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dockRef = useRef<ComponentRef<typeof OmnichannelComposerDock>>(null);

  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState<PasteAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<PasteAction>(initialAction);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [filterResult, setFilterResult] = useState<TrackingRemovalStatusResult | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTabId>('off-list');

  const activeFilter = (searchParams.get(TRACKING_IN_PARAM) || '').trim();

  useEffect(() => {
    if (!open) return;
    setPaste('');
    setError(null);
    setCheckResult(null);
    setFilterResult(null);
    setBusy(null);
    setAction(initialAction);
    // The operator opened this to paste — put the caret where their hands are.
    const id = window.setTimeout(() => dockRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, initialAction]);

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

  /**
   * Send the same keys to the recently-removed lane.
   *
   * The residual report NAMES the rows that left, but they are not on the lane
   * behind it — measured on real data, a 42-tracking paste left 41 of them off
   * Incoming and 46 line rows waiting on the removed lane. Reporting the exit
   * without offering the door makes the operator retype the paste.
   */
  const showOnRemovedLane = useCallback(() => {
    writeParams((params) => {
      params.set('incview', 'removed');
      params.delete('state');
    });
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
  const tabs = useMemo<SectionTab[]>(() => {
    if (action === 'filter' && filterResult) {
      return [
        {
          id: 'off-list' satisfies ResultTabId,
          label: 'Off the list',
          icon: History,
          count: filterResult.hidden.length,
          content: (
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
                {/* The door to the rows just named. Carries the SAME keys, so
                    the operator never retypes the paste. */}
                <Button variant="secondary" size="sm" onClick={showOnRemovedLane}>
                  Show these on Recently removed
                </Button>
                <ul className="space-y-1.5">
                  {filterResult.hidden.map((row) => (
                    <HiddenRow key={row.key} row={row} onFocusTracking={focusTracking} />
                  ))}
                </ul>
              </div>
            </BucketBody>
          ),
        },
        {
          id: 'not-found' satisfies ResultTabId,
          label: 'Not found',
          icon: AlertCircle,
          count: filterResult.not_found.length,
          content: (
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
      ): SectionTab => ({
        id,
        label,
        icon,
        count: rows.length,
        content: (
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
  }, [action, filterResult, checkResult, focusTracking, showOnRemovedLane]);

  if (!open) return null;

  return (
    <DetailStackRailRegistrar
      id="detail:incoming-bulk-tracking"
      onClose={onClose}
      modal={false}
      ariaLabel="Tracking list"
    >
      <div className="flex h-full min-h-0 flex-col bg-surface-card">
        {/* The panel's own visible dismiss — a non-modal push column has no
            scrim to click off, so this is mandatory, and it belongs at the
            column's top-left where every push surface in the house puts it. */}
        <div className={TOP_BAND_CLASS}>
          <PaneHeaderCloseButton
            onClick={onClose}
            ariaLabel="Hide tracking list"
            title="Hide tracking list"
          />
          <p className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
            Tracking list
          </p>
        </div>

        {/* The ONE scroll port on this surface. Everything below is CONTENT. */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          {error ? (
            <p className="text-role-caption font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : tabs.length === 0 ? (
            <p className="text-role-caption text-text-faint">
              One per line (or comma-separated). <strong>Filter</strong> narrows the list to
              these rows — including ones the lane normally hides.{' '}
              <strong>Check receipts</strong> asks the purchasing source whether they are
              received. Max {CHECK_ZOHO_RECEIVED_MAX_INPUTS}.
            </p>
          ) : null}

          {selection.truncated > 0 ? (
            <p className="rounded-none bg-amber-50 px-2 py-1.5 text-role-caption text-amber-800 ring-1 ring-inset ring-amber-200">
              {selection.requested} pasted — only the first {selection.keys.length} will be used.
            </p>
          ) : null}

          {activeFilter ? (
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

          {action === 'filter' && filterStats ? (
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

          {tabs.length > 0 ? (
            <SectionTabsSlider
              tabs={tabs}
              value={activeTab}
              onChange={(id) => setActiveTab(id as ResultTabId)}
              ariaLabel="Tracking results"
              headerClassName={STRIP_HEADER_CLASS}
              // Quiet icon row: idle cells are icon-only (the label is both the
              // tooltip and the accessible name) and the selected cell expands
              // to icon + label. The switcher is chrome for a ~380px column —
              // it must not out-shout the list it selects.
              density="icon"
              compact
            />
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border-soft bg-surface-card p-4">
          <OmnichannelComposerDock
            ref={dockRef}
            value={paste}
            onChange={setPaste}
            // Enter commits the PRIMARY — the same control the trailing button
            // is, per the dock's contract. Shift+Enter newlines, which is what
            // a multi-line paste needs.
            onCommit={() => void runFilter()}
            placeholder="Paste tracking numbers, one per line…"
            ariaLabel="Tracking numbers"
            hideCommitButton
            disabled={busy != null}
            trailingAction={
              <div className="flex items-center gap-1.5">
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
              </div>
            }
          />
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
