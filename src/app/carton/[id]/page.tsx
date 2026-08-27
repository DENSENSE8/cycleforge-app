import { redirect } from 'next/navigation';
import { CartonInvalidId } from './CartonInvalidId';

/**
 * `/carton/[id]` — bookmark door for carton reads.
 *
 * Search hits and deep links land on `/search?sel=receiving:{id}` so carton
 * reads share the order station preview chrome. This route redirects there.
 */
export default async function CartonRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receivingId = Number(id);

  if (Number.isFinite(receivingId) && receivingId > 0) {
    redirect(`/search?sel=receiving:${receivingId}`);
  }

  return <CartonInvalidId id={id} />;
}
