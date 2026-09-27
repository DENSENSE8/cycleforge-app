import { TechSurfacePage } from '@/components/tech/TechSurfacePage';

/** /tech — legacy alias for the Quality Control bench (`/test`). */
export default function TechPage() {
  return <TechSurfacePage fallbackPath="/tech" />;
}
