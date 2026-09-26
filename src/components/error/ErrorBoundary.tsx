'use client';

/** Reusable React error boundary for *non-route* subtrees. */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Fallback UI. Either a static node, or a render function that receives the
   * error and a `reset` callback to attempt re-mounting the subtree.
   */
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Label used in the console error so failures are attributable in logs. */
  label?: string;
  /** Optional hook for wiring telemetry (PostHog/Sentry) later. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the true cause in logs instead of swallowing it behind a blank
    // subtree. Keep the label so a sidebar failure reads differently from a
    // right-pane failure in the console.
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info);
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      const { fallback } = this.props;
      return typeof fallback === 'function' ? fallback(error, this.reset) : fallback;
    }
    return this.props.children;
  }
}
