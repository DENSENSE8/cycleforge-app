'use client';

/**
 * Units display — full per-unit explosion for the Unbox right-edge Displays push.
 *
 * Replaces the read-only carton rollup as the Units tab body: the **active**
 * line expands into serials with an inline line-scoped item camera on the
 * active unit row, and sibling lines stay as selectable summaries so the
 * operator can jump lines without leaving the panel.
 *
 * Photos remain LINE-scoped (`unbox_item` + `receivingLineId`) — shared across
 * units on that line until a future per-unit photo entity exists. The camera
 * sits after the condition tag on every unit row (not a standalone ITEM PHOTOS
 * section). A line-level serial entry field sits above the unit rows to add
 * the next serial.
 *
 * Flush plane: zero host gutters, hairline rows, square controls — the Displays
 * column IS the card.
 */

import { useMemo, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requestConfirm } from '@/design-system/components/confirm';
import { SerialChipWithMenu, type SavedSerial } from '@/components/receiving/workspace/SerialCard';
import { BoxMembershipHint } from '@/components/receiving/SerialPreviewStrip';
import { ActiveLineConditionSerial } from '@/components/receiving/workspace/line-edit/ActiveLineConditionSerial';
import { ReceivingPhotoButton } from '@/components/receiving/workspace/line-edit/ReceivingPhotoButton';
import { useSerialLookup, type SerialMatchedOrder } from '@/components/receiving/workspace/SerialMatchResult';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import { receivingWorkspaceLineTitle } from '@/lib/receiving/po-group-title';
import type { ActiveRowSerial } from '@/components/receiving/workspace/PoLinesAccordion';

interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
}

function useCartonSiblingLines(receivingId: number | null) {
  const enabled = typeof receivingId === 'number' && receivingId > 0;

  const { data, isPending } = useQuery<ApiResponse>({
    queryKey: receivingSiblingsQueryKey(receivingId ?? 0),
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
      );
      if (!res.ok) throw new Error('Failed to fetch carton siblings');
      return res.json();
    },
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const lines = data?.receiving_lines ?? [];

  return { enabled, lines, isPending };
}

/** Narrow controller surface the Units explosion needs from `useUnboxLineController`. */
interface UnitsExplosionController {
  cond: string;
  setCond: (next: string) => void;
  patch: (patch: Partial<ReceivingLineRow>) => void | Promise<void>;
  serialSubmitting: boolean;
  headerSerialEdit: ActiveRowSerial | null;
  setHeaderSerialEdit: (next: ActiveRowSerial | null) => void;
  enqueueSerial: (raw?: string, conditionGrade?: string | null) => void | Promise<void>;
  deleteSerialUnit: (serialUnitId: number, lineId?: number) => void | Promise<void>;
  replaceSerialUnit: (
    original: { id: number; serial_number: string; condition_grade?: string | null },
    nextSerial: string,
  ) => void | Promise<void>;
  setUnitGrade: (serialUnitId: number, grade: string) => void | Promise<void>;
  setUnitLabelCondition: (next: string | null) => void;
  serialAbsent: boolean;
  serialAbsentReason: string | null;
  requireSerialConfirmation: boolean;
  commitSerialAbsent: (next: { absent: boolean; reason: string | null }) => void;
  serialRef?: RefObject<HTMLInputElement | null>;
  handleFileReturnClaim?: (matchedOrder: SerialMatchedOrder | null) => void;
  handleOpenReturnHistory?: () => void;
  serialLookup?: ReturnType<typeof useSerialLookup>;
}

export function UnitsExplosionDisplay({
  receivingId,
  activeLineId,
  staffId,
  c,
}: {
  receivingId: number | null;
  activeLineId: number | null;
  staffId: string;
  c: UnitsExplosionController;
}) {
  const { enabled, lines, isPending } = useCartonSiblingLines(receivingId);
  const fallbackLookup = useSerialLookup();
  const serialLookup = c.serialLookup ?? fallbackLookup;

  const activeLine = useMemo(() => {
    if (activeLineId == null) return lines[0] ?? null;
    return lines.find((l) => l.id === activeLineId) ?? lines[0] ?? null;
  }, [lines, activeLineId]);

  const siblingLines = useMemo(
    () => (activeLine ? lines.filter((l) => l.id !== activeLine.id) : lines),
    [lines, activeLine],
  );

  if (!enabled) {
    return (
      <p className="border-y border-dashed border-border-hairline bg-surface-canvas px-3 py-5 text-center text-role-caption text-text-soft">
        Open a carton to explode its units.
      </p>
    );
  }

  if (isPending && lines.length === 0) {
    return <p className="px-3 text-role-caption text-text-soft">Loading units…</p>;
  }

  if (lines.length === 0) {
    return (
      <p className="border-y border-dashed border-border-hairline bg-surface-canvas px-3 py-5 text-center text-role-caption text-text-soft">
        No lines on this carton yet.
      </p>
    );
  }

  return (
    <div className="min-w-0" data-units-explosion>
      {activeLine ? (
        <ActiveLineExplosion
          line={activeLine}
          receivingId={receivingId!}
          staffId={staffId}
          c={c}
          serialLookup={serialLookup}
        />
      ) : null}

      {siblingLines.length > 0 ? (
        <div className="min-w-0">
          <p className="border-b border-border-hairline px-3 py-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
            Other lines on carton
          </p>
          <ul className="divide-y divide-border-hairline border-b border-border-hairline">
            {siblingLines.map((line) => (
              <li key={line.id}>
                <SiblingLineSummary
                  line={line}
                  onSelect={() => dispatchSelectLine(line)}
                  onEditSerial={(s) => {
                    if (s.id == null) return;
                    dispatchSelectLine(line);
                    c.setHeaderSerialEdit(s as ActiveRowSerial);
                  }}
                  onDeleteSerial={async (s) => {
                    if (s.id == null) return;
                    if (
                      !(await requestConfirm({
                        description: `Remove serial ${s.serial_number}?`,
                        tone: 'danger',
                        confirmLabel: 'Remove',
                      }))
                    ) {
                      return;
                    }
                    void c.deleteSerialUnit(s.id, line.id);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ActiveLineExplosion({
  line,
  receivingId,
  staffId,
  c,
  serialLookup,
}: {
  line: ReceivingLineRow;
  receivingId: number;
  staffId: string;
  c: UnitsExplosionController;
  serialLookup: ReturnType<typeof useSerialLookup>;
}) {
  const serials = (line.serials ?? []) as ActiveRowSerial[];
  const units = line.units ?? null;
  const qty = line.quantity_expected ?? null;
  const poRef = line.zoho_purchaseorder_number ?? null;
  const poRouteRef = line.zoho_purchaseorder_id ?? line.zoho_purchaseorder_number ?? null;

  // Line-scoped camera — after condition on every unit row (shared gallery until
  // per-unit photo entity exists).
  const itemCamera = (
    <ReceivingPhotoButton
      receivingId={receivingId}
      staffId={Number(staffId) || 0}
      poRef={poRef}
      photoStage="unbox_item"
      receivingLineId={line.id}
      poRouteRef={poRouteRef}
      galleryPlacement="below"
      appearance="flush"
    />
  );

  return (
    <section
      className="min-w-0"
      data-units-explosion-active
      data-line-id={line.id}
    >
      <header className="flex min-w-0 items-baseline justify-between gap-2 border-b border-border-hairline px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-role-caption font-semibold text-text-default">
            {receivingWorkspaceLineTitle(line)}
          </p>
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Active line · unit explosion
          </p>
        </div>
        <span className="shrink-0 font-mono text-role-caption tabular-nums text-text-muted">
          {serials.length}/{qty ?? '?'}
        </span>
      </header>

      <div className="min-w-0">
        <p className="border-b border-border-hairline px-3 py-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
          Units · serials
        </p>
        <ActiveLineConditionSerial
          serials={serials}
          lineId={line.id}
          receivingId={receivingId}
          quantityExpected={qty}
          // Preserve '' after clear — do not fall through to line default.
          cond={c.cond}
          serialSubmitting={c.serialSubmitting}
          editingSerial={c.headerSerialEdit}
          serialLookup={serialLookup}
          onFileReturnClaim={c.handleFileReturnClaim}
          onOpenReturnHistory={c.handleOpenReturnHistory}
          onSubmitSerial={(sn, grade) => c.enqueueSerial(sn, grade)}
          // Confirm is owned by ActiveLineConditionSerial.confirmDelete (org-gated
          // by receiving.confirmSerialRemoval) — same as the LinePoItemsSection /
          // UnmatchedAccordionSurface callers. A second requestConfirm here stacked
          // a duplicate "Remove" dialog: the click-Remove-twice bug.
          onDeleteSerialUnit={(id) => void c.deleteSerialUnit(id, line.id)}
          onReplaceSerialUnit={(original, next) => void c.replaceSerialUnit(original, next)}
          onSetUnitGrade={(id, grade) => void c.setUnitGrade(id, grade)}
          onActiveConditionChange={c.setUnitLabelCondition}
          onConditionChange={(next) => {
            c.setCond(next);
            const cleared = !String(next || '').trim();
            if (cleared) {
              // Line testing.condition_grade is NOT NULL — reopen retracts the
              // grading act (condition_graded_at) without inventing a null grade.
              void fetch(`/api/receiving/lines/${line.id}/condition`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reopen: true }),
              }).catch(() => {});
              return;
            }
            void c.patch({ condition_grade: next });
          }}
          onEditingSerialChange={c.setHeaderSerialEdit}
          serialAbsent={c.serialAbsent}
          serialAbsentReason={c.serialAbsentReason}
          requireSerialConfirmation={c.requireSerialConfirmation}
          onSerialAbsentChange={({ absent, reason }) => c.commitSerialAbsent({ absent, reason })}
          units={units}
          serialInputRef={c.serialRef}
          onEditFilledSerial={(serial) => {
            c.setHeaderSerialEdit(serial as ActiveRowSerial);
          }}
          flush
          forceUnitRows
          activeRowLeading={itemCamera}
        />
      </div>
    </section>
  );
}

function SiblingLineSummary({
  line,
  onSelect,
  onEditSerial,
  onDeleteSerial,
}: {
  line: ReceivingLineRow;
  onSelect: () => void;
  onEditSerial: (serial: SavedSerial) => void;
  onDeleteSerial: (serial: SavedSerial) => void;
}) {
  const serials = line.serials ?? [];
  return (
    <div className="min-w-0 px-3 py-3">
      {/* ds-raw-button: full-width sibling-line row select — not a DS Button face */}
      <button
        type="button"
        onClick={onSelect}
        className="ds-raw-button flex w-full min-w-0 items-baseline justify-between gap-2 text-left hover:text-text-default"
      >
        <span className="min-w-0 truncate text-role-caption font-semibold text-text-muted">
          {receivingWorkspaceLineTitle(line)}
        </span>
        <span className="shrink-0 font-mono text-role-micro tabular-nums text-text-soft">
          {line.quantity_received ?? serials.length}/{line.quantity_expected ?? '?'}
        </span>
      </button>
      {serials.length > 0 ? (
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          {serials.map((s) => (
            <SerialChipWithMenu
              key={s.id}
              serial={s}
              dense
              onEdit={onEditSerial}
              onDelete={onDeleteSerial}
            />
          ))}
          <BoxMembershipHint serials={serials} />
        </span>
      ) : (
        <p className="mt-1 text-role-micro text-text-faint">No serials — select to explode &amp; scan</p>
      )}
    </div>
  );
}
