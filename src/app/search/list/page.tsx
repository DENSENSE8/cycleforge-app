import { redirect } from 'next/navigation';
import { recordsHref } from '@/lib/nav/route-tree';
import { parseRefInParam } from '@/lib/receiving/reconcile';

/**
 * `/search/list` — the old full-screen pasted list (route tree node
 * `pasted-list`, compat). Records replaced it (2026-10-06): the held list
 * opens there with its numbers (`?refs=`) and its way back (`?back=`).
 */
export default async function PastedListRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { refs, back } = await searchParams;
  redirect(
    recordsHref({
      refs: parseRefInParam(Array.isArray(refs) ? refs[0] : refs).refs,
      back: Array.isArray(back) ? back[0] : back,
    }),
  );
}
