import { SessionSurface } from '@/components/session/SessionSurface';
import { PRODUCT_NAME } from '@/lib/branding/constants';

export const metadata = { title: `Session · ${PRODUCT_NAME}` };

/**
 * /session — the AI-first surface. Agent chat left, read-only data view
 * right. Coexists with the desks until each domain flips (plan: AI-first
 * refactor); the desks' verbs land here as agent tools, not as page chrome.
 */
export default function SessionPage() {
  return (
    <div className="h-full w-full overflow-hidden bg-surface-card">
      <SessionSurface />
    </div>
  );
}
