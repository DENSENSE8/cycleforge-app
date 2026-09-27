'use client';

/** Pick board — `/m/pick/unassigned`. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChevronsRight, User } from '@/components/Icons';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { ItemCardShipBy } from '@/components/mobile/redesign/ItemCardRow';
import { MobileToShipPickerSheet } from '@/components/mobile/redesign/MobileToShipPickerSheet';
import { orderChannel } from '@/components/mobile/orders/OrderInfoCard';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import { DetailDock } from '@/design-system/components/DetailDock';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { Button } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { v1Request } from '@/lib/api/v1-client';
import { pickBoardSchema } from '@/lib/picking/picking-v1-contract';
import {
  locationFace,
  type PickBoardRow,
  type PickBoardScope,
  type PickOwnerVia,
} from '@/lib/picking/directed-pick';
import { cn } from '@/utils/_cn';

const PICK_HREF = '/m/pick';

type BoardVerb = 'take' | 'pass';

const SCOPES: { id: PickBoardScope; label: string; empty: string }[] = [
  { id: 'unassigned', label: 'Unassigned', empty: 'Every open pick has an owner.' },
  { id: 'all', label: 'All', empty: 'Nothing left to pick.' },
];

const OWNER_VIA_LABEL: Record<PickOwnerVia, string> = {
  assigned: 'assigned',
  sku: 'SKU owner',
  backup: 'backup',
};

async function fetchPickBoard(scope: PickBoardScope, signal: AbortSignal): Promise<PickBoardRow[]> {
  const board = await v1Request(`/api/v1/picking/board?scope=${scope}`, pickBoardSchema, {
    signal,
    fallbackMessage: 'Could not load the pick board',
  });
  return board.rows;
}

export function PickBoardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { mutate: assignOrder } = useOrderAssignment();
  const [scope, setScope] = useState<PickBoardScope>('unassigned');
  const [passRow, setPassRow] = useState<PickBoardRow | null>(null);
  const [takingId, setTakingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const board = useQuery({
    queryKey: ['picking', 'board', scope] as const,
    queryFn: ({ signal }) => fetchPickBoard(scope, signal),
    staleTime: 10_000,
  });

  const take = (row: PickBoardRow) => {
    if (!user) return;
    setActionError(null);
    setTakingId(row.orderId);
    assignOrder(
      { orderId: row.orderId, pickerId: user.staffId, pickerName: user.name },
      {
        onSuccess: () => router.push(PICK_HREF),
        onError: (err) => {
          setTakingId(null);
          setActionError(err.message);
        },
      },
    );
  };

  const pass = (staff: { id: number; name: string }) => {
    if (!passRow) return;
    setActionError(null);
    assignOrder(
      { orderId: passRow.orderId, pickerId: staff.id, pickerName: staff.name },
      {
        onSuccess: () => {
          setPassRow(null);
          void board.refetch();
        },
        onError: (err) => setActionError(err.message),
      },
    );
  };

  const rows = board.data ?? [];
  const active = SCOPES.find((s) => s.id === scope) ?? SCOPES[0];

  return (
    <div className={cn('flex h-full min-h-full flex-col', appMobilePageGroundClass)}>
      <MobileDetailTopBar title="Unassigned picks" backHref={PICK_HREF} />

      <div
        role="tablist"
        aria-label="Pick board scope"
        className="flex min-h-11 min-w-0 shrink-0 items-stretch border-b border-mode-rule bg-mode-bar"
      >
        {SCOPES.map((option) => {
          const selected = option.id === scope;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setScope(option.id)}
              className={cn(DESK_BAR_SEGMENT_CLASS, 'border-r border-mode-edge', deskBarSegmentTone(selected))}
            >
              <span>{option.label}</span>
              {selected && board.data ? <span className="tabular-nums">{board.data.length}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {actionError ? (
          <Alert variant="destructive" role="alert" className="mx-mode-page mt-3">
            <AlertDescription className="text-role-data opacity-100">{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {board.isPending ? (
          <p className="py-10 text-center text-role-body text-text-muted" aria-live="polite">
            Loading picks…
          </p>
        ) : board.isError ? (
          <Alert variant="destructive" className="mx-mode-page mt-3">
            <AlertTitle className="text-role-title">Couldn&apos;t load the pick board</AlertTitle>
            <AlertDescription className="text-role-body">{board.error.message}</AlertDescription>
            <Button variant="primary" size="lg" radius="flush" className="col-start-2 mt-3 w-full" onClick={() => void board.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : rows.length === 0 ? (
          <p className="px-mode-page py-10 text-center text-role-body text-text-muted">{active.empty}</p>
        ) : (
          <ul aria-label={`${active.label} picks`}>
            {rows.map((row) => {
              const channel = orderChannel(row.accountSource);
              return (
                <li
                  key={row.orderId}
                  className={cn('border-b border-mode-rule', row.rush && 'border-l-4 border-l-border-danger')}
                >
                  <div className="flex gap-3 px-mode-page py-3">
                    <ItemRecordThumb imageUrl={row.imageUrl} plainEmpty className="size-16 self-start" iconClassName="h-6 w-6" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-role-body font-semibold text-text-default">{row.title}</p>
                      <p
                        className={cn(
                          'mt-0.5 break-words font-mono text-role-data font-semibold tabular-nums',
                          row.location ? 'text-text-default' : 'text-text-muted',
                        )}
                      >
                        {row.location ? locationFace(row.location) : 'No bin'}
                        {row.location?.room ? (
                          <span className="font-sans font-normal text-text-muted"> · {row.location.room}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 break-words text-role-data text-text-muted">
                        {channel ? <>{channel} · </> : null}
                        <span className="font-mono text-text-default">{row.orderLabel}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <ItemCardShipBy deadlineAt={row.deadlineAt} />
                        <span className="text-role-caption tabular-nums text-text-muted">
                          {row.openUnits} {row.openUnits === 1 ? 'unit' : 'units'} to pick
                        </span>
                      </div>
                      {scope === 'all' ? (
                        <p className="mt-1 break-words text-role-caption text-text-muted">
                          {row.owner ? (
                            <>
                              <span className="font-semibold text-text-default">
                                {row.owner.name ?? `Staff #${row.owner.staffId}`}
                              </span>{' '}
                              · {OWNER_VIA_LABEL[row.owner.via]}
                            </>
                          ) : (
                            'Unassigned'
                          )}
                          {row.heldBy ? <> · held by {row.heldBy.name ?? `Staff #${row.heldBy.staffId}`}</> : null}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <DetailDock<BoardVerb>
                    label={`Actions for ${row.orderLabel}`}
                    placement="inline"
                    verbs={[
                      {
                        id: 'take',
                        label: 'Take',
                        icon: <ChevronsRight />,
                        loading: takingId === row.orderId,
                        disabled: takingId != null,
                      },
                      { id: 'pass', label: 'Pass to picker', icon: <User />, disabled: takingId != null },
                    ]}
                    onVerb={(id) => (id === 'take' ? take(row) : setPassRow(row))}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <MobileToShipPickerSheet
        currentPickerId={passRow?.owner?.staffId ?? null}
        open={passRow != null}
        onClose={() => setPassRow(null)}
        onPass={pass}
      />
    </div>
  );
}
