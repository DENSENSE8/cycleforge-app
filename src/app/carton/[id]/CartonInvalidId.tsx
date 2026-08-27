'use client';

import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';

export function CartonInvalidId({ id }: { id: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-canvas p-6">
      <EmptyState
        icon={<Search className="h-6 w-6 text-text-faint" />}
        title="Not a carton id"
        description={`“${id}” is not a number this surface can open. Check the link, or search for the carton.`}
      />
    </div>
  );
}
