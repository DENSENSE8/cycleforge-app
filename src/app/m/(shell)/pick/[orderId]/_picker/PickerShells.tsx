// ─── Helper shells ───────────────────────────────────────────────────────────

import { Button } from '@/design-system/primitives';
import { Loader2 } from '@/components/Icons';

export function LoadingShell({ label }: { label: string }) {
  return (
    <div className="grid min-h-full place-items-center bg-surface-card px-6 py-10 text-center">
      <div>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-text-muted" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-text-muted">{label}</p>
      </div>
    </div>
  );
}

export function ErrorShell({ error, onBack }: { error: string; onBack: () => void }) {
  return (
    <div className="grid min-h-full place-items-center bg-surface-card px-6 py-10 text-center">
      <div>
        <p className="text-base font-semibold text-text-danger">Could not load picker</p>
        <p className="mt-2 text-sm text-text-muted">{error}</p>
        <Button variant="brand" size="lg" radius="flush" className="mt-5" onClick={onBack}>
          Back to queue
        </Button>
      </div>
    </div>
  );
}

export function EmptyShell({ onBack }: { onBack: () => void }) {
  return (
    <div className="grid min-h-full place-items-center bg-surface-card px-6 py-10 text-center">
      <div>
        <p className="text-base font-semibold text-text-muted">Nothing to pick</p>
        <p className="mt-2 text-sm text-text-soft">All allocations for this order are already picked or shipped.</p>
        <Button variant="brand" size="lg" radius="flush" className="mt-5" onClick={onBack}>
          Back to queue
        </Button>
      </div>
    </div>
  );
}

export function CompleteCard({
  onBack,
  onStartPacking,
  tote,
}: {
  onBack: () => void;
  onStartPacking: () => void;
  tote?: string | null;
}) {
  return (
    <div className="grid place-items-center border border-border-success bg-surface-success px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center bg-fill-success text-text-inverse">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="mt-3 text-base font-semibold text-text-success">Pick complete</p>
      <p className="mt-1 text-sm text-text-soft">
        {tote ? (
          <>
            Tote <span className="font-mono tabular-nums">{tote}</span> is staged for the pack
            station — scan it there to open this order.
          </>
        ) : (
          'Cart is ready to hand off to the pack station.'
        )}
      </p>
      <Button
        type="button"
        variant="success"
        radius="flush"
        onClick={onStartPacking}
        className="mt-5 px-5 py-2.5 text-sm font-semibold"
      >
        Start packing
      </Button>
      <Button
        type="button"
        variant="secondary"
        radius="flush"
        onClick={onBack}
        className="mt-2 px-5 py-2.5 text-sm font-semibold"
      >
        Back to queue
      </Button>
    </div>
  );
}
