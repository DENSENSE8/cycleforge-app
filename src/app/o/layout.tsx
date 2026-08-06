import type { ReactNode } from 'react';

/** Pass-through — `/o/[orderId]` only redirects to search feedback. */
export default function OrderWorkspaceLayout({ children }: { children: ReactNode }) {
  return children;
}
