import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { ExceptionsDesk } from '@/components/exceptions/ExceptionsDesk';
import { getCurrentUser } from '@/lib/auth/current-user';
import { exceptionLanding } from '@/lib/exceptions/permissions';
import {
  EXCEPTIONS_PATH,
  EXCEPTION_DOMAIN_PARAM,
  EXCEPTION_KIND_PARAM,
  EXCEPTION_RECORD_PARAM,
  parseExceptionDomain,
  parseExceptionKind,
  parseExceptionRowKey,
} from '@/lib/exceptions/types';

export const metadata: Metadata = {
  title: 'Exceptions',
};

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/exceptions` — the global Exceptions hub, ONE category at a time (owner
 * 2026-09-29: never a blanket list of every exception — each kind gets its own
 * table and resolver). `?domain=` + `?kind=` name the category, `?q=` narrows
 * it, `?record=` opens one. A URL without a visible kind lands on one: the
 * open record's kind, else the first kind the caller may see in the requested
 * domain, else in any (`exceptionLanding`). The sidebar's mode card switches
 * domains, its views the kinds. Phone twin: `/m/exceptions`.
 */
export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const one = (key: string) => {
    const value = sp[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const rawKind = one(EXCEPTION_KIND_PARAM);
  const rawDomain = one(EXCEPTION_DOMAIN_PARAM);
  const recordKind = parseExceptionRowKey(one(EXCEPTION_RECORD_PARAM) ?? '')?.kind ?? null;
  const requested = { domain: parseExceptionDomain(rawDomain), kind: parseExceptionKind(rawKind) ?? recordKind };
  const user = await getCurrentUser();
  const landing = user ? exceptionLanding((permission) => user.permissions.has(permission), requested) : null;
  if (landing && (landing.kind !== rawKind || landing.domain !== rawDomain)) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, entry);
    }
    params.set(EXCEPTION_DOMAIN_PARAM, landing.domain);
    params.set(EXCEPTION_KIND_PARAM, landing.kind);
    redirect(`${EXCEPTIONS_PATH}?${params}`);
  }
  return (
    <>
      <SurfaceParamHygiene />
      <DeskPageLayout bare className="h-full">
        <Suspense fallback={null}>
          <ExceptionsDesk basePath={EXCEPTIONS_PATH} />
        </Suspense>
      </DeskPageLayout>
    </>
  );
}
