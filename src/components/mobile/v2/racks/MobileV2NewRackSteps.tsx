'use client';

/**
 * The four step bodies of New rack (`MobileV2NewRackFlow`): Place (scan a room
 * or floor label, manual pick below), Shelves (count stepper + optional
 * per-shelf urgency), Review (the server's dry-run codes as cards), Print
 * (progress and result). Text wraps, never truncates.
 */

import { useState } from 'react';
import { Minus, Plus } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { IconButton, ProgressBar } from '@/design-system/primitives';
import type { RackCreateState } from '@/lib/locations/rack-create-model';
import { RACK_MAX_SHELVES, type PlannedRack, type RackDetail } from '@/lib/locations/rack-types';
import { locationLabelPrintSummary, type PrintLocationRowsResult } from '@/lib/print/printLocationRows';
import type { ArrivalTier } from '@/lib/receiving/arrival-tier';
import { ARRIVAL_TIER_CHOICES } from '@/lib/receiving/arrival-shelves-client';
import { rackPlacementText } from '@/lib/locations/rack-display';
import { plural, shelfTierStatus } from './rack-presentation';
import { RackPlacementChoices, type RackPlacementChoice } from './RackPlacementChoices';

function Line({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'alert' | 'ink' }) {
  if (tone === 'alert') return <p role="alert" className="break-words px-mode-page py-3 text-role-caption font-semibold text-text-danger">{children}</p>;
  return <p className={tone === 'ink' ? 'break-words px-mode-page py-3 text-mode-body text-mode-ink' : 'break-words px-mode-page py-3 text-role-caption text-text-muted'}>{children}</p>;
}

export function NewRackPlaceStep({
  state,
  choices,
  loading,
  error,
  scanError,
  onScan,
  onChoose,
}: {
  state: RackCreateState;
  choices: readonly RackPlacementChoice[];
  loading: boolean;
  error: string | null;
  scanError: string | null;
  onScan: (value: string) => void;
  onChoose: (choice: RackPlacementChoice) => void;
}) {
  return (
    <>
      <div className="px-mode-page pt-3">
        <MobileV2ScanInput onDecode={onScan} placeholder="Scan a room or floor label" />
      </div>
      {scanError ? <Line tone="alert">{scanError}</Line> : null}
      {state.placement ? (
        <MobileRecordCardList label="The rack stands in">
          <MobileRecordCard
            identity={state.placement.kind === 'ROOM' ? 'Room' : 'Floor spot'}
            title={state.placement.name}
            status={state.placement.code}
            tone="ok"
            testId="new-rack-placement"
          />
        </MobileRecordCardList>
      ) : null}
      <RackPlacementChoices
        choices={choices}
        loading={loading}
        error={error}
        currentId={state.placement?.id ?? null}
        label="Or choose it"
        onChoose={onChoose}
      />
    </>
  );
}

export function NewRackShelvesStep({
  state,
  onCount,
  onTier,
}: {
  state: RackCreateState;
  onCount: (count: number) => void;
  onTier: (shelf: number, tier: ArrivalTier | null) => void;
}) {
  const [tiering, setTiering] = useState<number | null>(null);
  const shelves = Array.from({ length: state.shelves }, (_, index) => index + 1);
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-mode-rule px-mode-page py-3">
        <span className="break-words text-mode-body text-mode-ink">Shelves on this rack</span>
        <span className="flex items-center gap-3">
          <IconButton
            icon={<Minus />}
            ariaLabel="One shelf fewer"
            size="touch"
            radius="pill"
            onClick={() => onCount(state.shelves - 1)}
            disabled={state.shelves <= 1}
            data-testid="new-rack-shelves-minus"
          />
          <span className="min-w-8 text-center text-role-title font-semibold tabular-nums text-mode-ink" data-testid="new-rack-shelf-count">
            {state.shelves}
          </span>
          <IconButton
            icon={<Plus />}
            ariaLabel="One shelf more"
            size="touch"
            radius="pill"
            onClick={() => onCount(state.shelves + 1)}
            disabled={state.shelves >= RACK_MAX_SHELVES}
            data-testid="new-rack-shelves-plus"
          />
        </span>
      </div>
      <MobileRecordCardList label="Arrival urgency (optional)">
        {shelves.map((shelf) => {
          const tier = state.tiers[shelf] ?? null;
          const face = shelfTierStatus(tier);
          return (
            <MobileRecordCard
              key={shelf}
              identity={`Shelf ${shelf}`}
              title={tier == null ? 'Not an arrival shelf' : 'Arrival shelf'}
              status={face.status}
              tone={face.tone}
              onOpen={() => setTiering(shelf)}
              testId="new-rack-shelf"
            />
          );
        })}
      </MobileRecordCardList>
      <MobileV2ActionSheet
        open={tiering != null}
        onClose={() => setTiering(null)}
        eyebrow="New rack"
        title={`Shelf ${tiering ?? ''} arrival urgency`}
        verbs={[]}
        onVerb={() => undefined}
        dockLabel="Arrival urgency"
        testId="new-rack-tier-sheet"
      >
        <MobileRecordCardList>
          {ARRIVAL_TIER_CHOICES.map((choice) => (
            <MobileRecordCard
              key={choice.value || 'none'}
              identity={choice.label}
              title={choice.tier == null ? 'Cartons are not placed here at arrival' : `Cartons of ${choice.label} urgency go here at arrival`}
              selected={tiering != null && (state.tiers[tiering] ?? null) === choice.tier}
              onOpen={() => {
                if (tiering != null) onTier(tiering, choice.tier);
                setTiering(null);
              }}
              testId="new-rack-tier-choice"
            />
          ))}
        </MobileRecordCardList>
      </MobileV2ActionSheet>
    </>
  );
}

export function NewRackReviewStep({ planned, loading, error }: { planned: PlannedRack | null; loading: boolean; error: string | null }) {
  if (error) return <Line tone="alert">{error}</Line>;
  if (loading || !planned) return <Line>Planning the rack…</Line>;
  return (
    <>
      <MobileRecordCardList label="New rack">
        <MobileRecordCard
          identity={planned.name}
          title={rackPlacementText(planned)}
          detail={plural(planned.shelves.length, 'shelf', 'shelves')}
          status={planned.code}
          testId="new-rack-review-rack"
        />
      </MobileRecordCardList>
      <MobileRecordCardList label={`${plural(planned.shelves.length + 1, 'label')} will print`}>
        {planned.shelves.map((shelf) => {
          const face = shelfTierStatus(shelf.tier);
          return (
            <MobileRecordCard
              key={shelf.code}
              identity={`Shelf ${shelf.shelf}`}
              title={shelf.code}
              status={face.status}
              tone={face.tone}
              testId="new-rack-review-shelf"
            />
          );
        })}
      </MobileRecordCardList>
    </>
  );
}

export type NewRackRun =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'printing'; rack: RackDetail; done: number; total: number }
  | { kind: 'done'; rack: RackDetail; result: PrintLocationRowsResult }
  | { kind: 'print_failed'; rack: RackDetail; message: string }
  | { kind: 'create_failed'; message: string };

export function NewRackPrintStep({ run }: { run: NewRackRun }) {
  const rack = 'rack' in run ? run.rack : null;
  return (
    <div className="flex flex-col gap-3 py-2" data-testid="new-rack-print-body">
      {rack ? (
        <MobileRecordCardList>
          <MobileRecordCard
            identity={rack.name}
            title={rackPlacementText(rack)}
            detail={plural(rack.shelves.length, 'shelf', 'shelves')}
            status={run.kind === 'done' ? 'Created' : rack.code}
            tone="ok"
            testId="new-rack-created"
          />
        </MobileRecordCardList>
      ) : null}
      {run.kind === 'creating' ? <Line>Creating the rack…</Line> : null}
      {run.kind === 'printing' ? (
        <div className="px-mode-page">
          <ProgressBar
            current={run.done}
            goal={Math.max(run.total, 1)}
            label={run.done > 0 ? `Printed ${run.done} of ${run.total}` : `Sending ${plural(run.total, 'label')}…`}
            ariaLabel="Label print progress"
          />
        </div>
      ) : null}
      {run.kind === 'done' ? <Line tone="ink">{locationLabelPrintSummary(run.result)}</Line> : null}
      {run.kind === 'print_failed' ? <Line tone="alert">{`The rack was created, but the labels did not print: ${run.message}`}</Line> : null}
      {run.kind === 'create_failed' ? <Line tone="alert">{run.message}</Line> : null}
      {run.kind === 'idle' ? <Line>Create the rack, then its placard and shelf labels print on this device&apos;s label printer.</Line> : null}
    </div>
  );
}
