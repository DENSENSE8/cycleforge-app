import Image from 'next/image';

/** Two-letter mark for a record with no photo. */
export function recordInitials(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join('') || '—').toUpperCase();
}

/** The record photo, or the title's initials when no image is known. */
export function RecordPhoto({ src, fallback }: { src: string | null; fallback: string }) {
  if (src) {
    return <Image src={src} alt="" fill unoptimized sizes="96px" className="object-cover" />;
  }
  return (
    <span
      aria-hidden
      className="flex h-full w-full items-center justify-center font-mono text-role-body font-black text-mode-muted"
    >
      {recordInitials(fallback)}
    </span>
  );
}
