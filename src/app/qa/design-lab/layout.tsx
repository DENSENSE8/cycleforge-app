import { notFound } from 'next/navigation';
import { getInitialAuthUser } from '@/lib/auth/server-session';
import { resolveDesignLabAccess } from '@/lib/design-lab/access';

/**
 * QA-only gate for the Design Lab tree.
 *
 * 404 — not 403 and not a redirect — for every other tenant: a surface that
 * does not exist for you should not advertise that it exists for someone else.
 * The same `resolveDesignLabAccess` decides whether the reskin stylesheet and
 * the HUD ship at all (src/app/layout.tsx), so the two can never disagree.
 */
export default async function DesignLabLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getInitialAuthUser();
  if (!(await resolveDesignLabAccess(user?.organizationId))) notFound();
  return <>{children}</>;
}
