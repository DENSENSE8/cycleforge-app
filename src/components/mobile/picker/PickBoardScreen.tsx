'use client';

/**
 * Pick board — `/m/pick/unassigned`. Every order with open picks, one row
 * each: what to pick (photo + product title), where (the bin face), for whom
 * (order + channel, ship-by, open units). Two scopes:
 *
 *   Unassigned  — no owner: nobody was passed it and nobody owns its SKU.
 *   All         — every open pick, with its owner (and why) and who holds it.
 *
 * Take assigns the order to the viewer (the canonical TEST assignee the
 * directed feed reads) and opens `/m/pick`; Pass to… assigns another picker.
 */

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
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { Button } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import {
  locationFace,
  type PickBoardRow,
  type PickBoardScope,
  type PickOwnerVia,
} from '@/lib/picking/directed-pick';
import { cn } from '@/utils/_cn';

const PICK_HREF = '/m/pick';

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
  const res = await fetch(`/api/picking/board?scope=${scope}`, { signal, cache: 'no-store' });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error || `Could not load the pick board (${res.status})`);
  return body.rows as PickBoardRow[];
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
      { orderId: row.orderId, testerId: user.staffId, testerName: user.name },
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
      { orderId: passRow.orderId, testerId: staff.id, testerName: staff.name },
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
                  className={cn(
                    'flex gap-3 border-b border-border-soft px-mode-page py-3',
                    row.rush && 'border-l-4 border-l-border-danger',
                  )}
                >
                  <ItemRecordThumb imageUrl={row.imageUrl} plainEmpty className="size-16 self-start" iconClassName="h-6 w-6" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-role-body font-semibold text-text-default">{row.title}</p>
                    <p
                      className={cn(
                        'mt-0.5 font-mono text-role-data font-semibold tabular-nums',
                        row.location ? 'text-text-default' : 'text-text-muted',
                      )}
                    >
                      {row.location ? locationFace(row.location) : 'No bin'}
                    </p>
                    <p className="mt-0.5 truncate text-role-data text-text-muted">
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
                      <p className="mt-1 truncate text-role-caption text-text-muted">
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
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        size="md"
                        icon={<ChevronsRight />}
                        loading={takingId === row.orderId}
                        disabled={takingId != null}
                        onClick={() => take(row)}
                      >
                        Take
                      </Button>
                      <Button
                        variant="secondary"
                        size="md"
                        icon={<User />}
                        disabled={takingId != null}
                        onClick={() => setPassRow(row)}
                      >
                        Pass to…
                      </Button>
                    </div>
                  </div>
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
