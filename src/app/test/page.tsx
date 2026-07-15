import { TechSurfacePage } from '@/components/tech/TechSurfacePage';

/**
 * `/test` — the Testing operator surface as a first-class, semantic route
 * (Studio-driven operator surfaces refactor Phase 8). The URL names the
 * operator's job. Legacy `/tech` (incl. `?view=testing`; legacy
 * `?view=testing-history` rewrites to `?view=testing`) redirects here via the proxy.
 */
export default function TestPage() {
  return <TechSurfacePage fallbackPath="/test" />;
}
