'use client';

import React from 'react';
import { Package, AlertTriangle, Play } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { EmptyState } from '@/design-system/primitives/EmptyState';

export type EmptyStateType = 'ready' | 'no-work' | 'observer';

interface ContextualEmptyStateProps {
  state: EmptyStateType;
  onAction?: () => void;
  className?: string;
}

export function ContextualEmptyState({
  state,
  onAction,
  className = '',
}: ContextualEmptyStateProps) {
  switch (state) {
    case 'ready':
      return (
        <EmptyState
          className={className}
          icon={<Play className="h-8 w-8 text-emerald-600" />}
          title="Ready"
          description="Scan an order to pack or start a new test."
        />
      );

    case 'no-work':
      return (
        <EmptyState
          className={className}
          icon={<Package className="h-8 w-8 text-yellow-600" />}
          title="No work assigned"
          description="Nothing assigned to you right now. View queue, Home, or claim unassigned tasks."
          action={
            onAction ? (
              <Button variant="secondary" onClick={onAction}>
                View Home
              </Button>
            ) : undefined
          }
        />
      );

    case 'observer':
      return (
        <EmptyState
          className={className}
          icon={<AlertTriangle className="h-8 w-8 text-red-600" />}
          title="Not your station"
          description="You're not assigned to this station. Switch stations or open Home."
          action={
            onAction ? (
              <Button variant="primary" onClick={onAction}>
                Go to Home
              </Button>
            ) : undefined
          }
        />
      );

    default:
      return null;
  }
}
