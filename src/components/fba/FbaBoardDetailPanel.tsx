'use client';

/**
 * FBA board detail panel — slide-over for one FNSKU's plan entries + scan
 * activity. Thin composition shell: data + fetch live in {@link useFbaBoardDetail};
 * the plan-entry card + armed delete control are presentational components
 * under `./board-detail/`.
 *
 * **Chrome is ONE band** ({@link DeskInspectorIndexShell}, `stance="standalone"`).
 * There is no index above this panel — the board grid is the list, and a row
 * click lands here directly — so it declares `standalone` and is owed no Back
 * cell. Everything else rides the single band: the read-only expected / actual
 * metric, then the contextual verbs, then the host's own `⤢` / `✕` in the
 * reserved trailing cell the shell paints for them.
 *
 * **The panel paints NO close.** `RightRailHost` owns the singleton `✕` and
 * fires `closeRightPanel()`, which runs the lifecycle half AND this occupant's
 * `onClose`. This file used to stack a `DeskRailChromeRow` over a
 * `PaneHeaderLabel` identity line over an FNSKU + totals row — three rows of
 * chrome where the contract allows one — and the identity pair (eyebrow
 * "FBA Item" over the product title) was a second header line. Identity moved
 * into the body, where a long title can wrap without deforming the band.
 */

import { Check, ClipboardList, Loader2 } from '@/components/Icons';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { FnskuChip } from '@/components/ui/CopyChip';
import { PaneHeaderActionBar, PaneHeaderLabel } from '@/components/ui/pane-header';
import { FnskuCatalogInfoPanel } from './FnskuCatalogInfoPanel';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { scanActionLabel, formatCreatedAt, type FbaBoardDetailPanelProps } from './board-detail/board-detail-shared';
import { useFbaBoardDetail } from './board-detail/useFbaBoardDetail';
import { PlanEntryCard } from './board-detail/PlanEntryCard';
import { FbaDeleteControl } from './board-detail/FbaDeleteControl';

export function FbaBoardDetailPanel({
  item,
  onClose,
  onNavigate: _onNavigate,
  onSaved,
  disableMoveUp: _disableMoveUp = false,
  disableMoveDown: _disableMoveDown = false,
}: FbaBoardDetailPanelProps) {
  const {
    entries, scanLogs, loading,
    setCatalogSnapshot, handleEntryChange, panelActions,
    totalExpected, totalActual, headerTitle,
  } = useFbaBoardDetail({ item, onSaved });

  return (
    // Non-modal + STABLE occupant id: the board walks up/down behind this
    // panel, and the host keys its crossfade on the occupant id — a per-FNSKU
    // id played exit→empty→enter on every step while the board sat dimmed
    // behind a scrim it needed to read.
    <DetailStackRailRegistrar
      id="detail:fba-plan"
      onClose={onClose}
      modal={false}
      ariaLabel={`FBA ${item.fnsku} details`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <DeskInspectorIndexShell
          stance="standalone"
          title="FBA"
          ariaLabel="FBA item"
          testId="fba-board-detail"
          headerRightSlot={
            <>
              {/* Read-only metric — planned vs scanned for this FNSKU. */}
              <span className="flex h-full items-center gap-3 px-1 text-role-caption">
                <span className="flex items-center gap-1 font-semibold text-text-muted">
                  <ClipboardList className="h-3 w-3 text-purple-500" />
                  <span className="tabular-nums">{totalExpected}</span>
                </span>
                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span className="tabular-nums">{totalActual}</span>
                </span>
              </span>
              {panelActions.length ? (
                <PaneHeaderActionBar
                  iconOnly
                  // `variant` DEFAULTS to 'card' — the deleted chrome pill. It is
                  // banned on a registrar file, and the ban only ever matched an
                  // explicit `variant="card"`, so omitting it passed the guard
                  // while rendering the thing the guard exists to stop.
                  variant="flat"
                  className="py-0"
                  actions={panelActions.map((a) => ({
                    key: a.key,
                    label: a.label,
                    icon: <span className={a.toneClassName}>{a.icon}</span>,
                    onClick: a.onAction,
                  }))}
                />
              ) : null}
            </>
          }
          body={
            <div className="px-6 py-4">
              {/* Identity — body, never a second header line. */}
              <div className="mb-3 flex items-start justify-between gap-3">
                <PaneHeaderLabel
                  eyebrow="FBA Item"
                  value={headerTitle}
                  valueTitle={headerTitle}
                />
                <FnskuChip value={item.fnsku} />
              </div>

              <FnskuCatalogInfoPanel
            fnsku={item.fnsku}
            productTitle={item.display_title}
            condition={item.condition}
            sku={item.sku}
            asin={item.asin}
            sourceKey={item.item_id}
            onCatalogMetaChange={setCatalogSnapshot}
            onCatalogSaved={onSaved}
          />

          <div className="h-px bg-surface-sunken" />

          {/* Static details */}
          <section className="py-4">
            <p className={`mb-2 ${sectionLabel}`}>Details</p>
            <dl className="space-y-1 text-role-caption">
              <div className="flex items-center justify-between gap-4">
                <dt className="font-semibold text-text-soft">Plans</dt>
                <dd className="font-semibold text-text-default">{entries.length}</dd>
              </div>
            </dl>
          </section>

          <div className="h-px bg-surface-sunken" />

          {/* Plan entries list */}
          <section className="py-4">
            <p className={`mb-3 ${sectionLabel}`}>
              Plan Entries ({entries.length})
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-text-faint" />
              </div>
            ) : entries.length === 0 ? (
              <p className="py-4 text-center text-role-caption font-semibold text-text-faint">
                No active plan entries
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <PlanEntryCard
                    key={entry.item_id}
                    entry={entry}
                    onQtySaved={handleEntryChange}
                    onDeleted={handleEntryChange}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Scan activity — who scanned this FNSKU and when */}
          <div className="h-px bg-surface-sunken" />
          <section className="py-4">
            <p className={`mb-3 ${sectionLabel}`}>Scan Activity ({scanLogs.length})</p>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
              </div>
            ) : scanLogs.length === 0 ? (
              <p className="py-2 text-center text-role-caption font-semibold text-text-faint">No scans yet</p>
            ) : (
              <div className="space-y-1.5">
                {scanLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-3 rounded-none border border-border-hairline bg-surface-canvas/60 px-2.5 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-role-eyebrow uppercase tracking-wider bg-purple-100 text-purple-700">
                        {scanActionLabel(log.source_stage, log.event_type)}
                      </span>
                      <span className="truncate text-role-caption font-semibold text-text-muted">
                        {log.staff_name || 'Unknown'}
                      </span>
                    </div>
                    <span className="shrink-0 text-role-micro font-semibold tabular-nums text-text-faint">
                      {formatCreatedAt(log.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* All tracking numbers across entries */}
          {entries.some((e) => e.tracking_numbers.length > 0) && (
            <>
              <div className="h-px bg-surface-sunken" />
              <section className="py-4">
                <p className={`mb-2 ${sectionLabel}`}>All Tracking</p>
                <div className="space-y-0.5">
                  {Array.from(
                    new Map(
                      entries
                        .flatMap((e) => e.tracking_numbers)
                        .map((t) => [t.tracking_number, t]),
                    ).values(),
                  ).map((t, i) => (
                    <p key={i} className="font-mono text-role-caption font-semibold text-text-muted">
                      {t.carrier && <span className="text-text-soft">{t.carrier} </span>}
                      {t.tracking_number}
                    </p>
                  ))}
                </div>
              </section>
            </>
          )}

          <div className="h-px bg-surface-sunken" />

          {/* Delete all entries for this FNSKU */}
          <section className="py-4">
            <FbaDeleteControl entries={entries} onDeleted={() => { onClose(); onSaved(); }} />
          </section>
            </div>
          }
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
