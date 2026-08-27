import { Suspense } from 'react';
import { UnitsWorkspaceView } from '@/components/inventory/UnitsWorkspaceView';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function InventoryUnitsPage() {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <Suspense
                fallback={
                    <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
                        <LoadingSpinner size="lg" className="text-blue-600" />
                    </div>
                }
            >
                <UnitsWorkspaceView />
            </Suspense>
        </div>
    );
}
