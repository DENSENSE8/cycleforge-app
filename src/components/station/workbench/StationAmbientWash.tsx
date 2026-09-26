/** Ambient wash — the Unbox-family depth backdrop (soft tonal blobs behind the glass cards). */
export function StationAmbientWash() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-visible">
      <div className="absolute -top-24 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-blue-400/[0.08] blur-3xl" />
      <div className="absolute right-[-7rem] top-1/3 h-80 w-80 rounded-full bg-violet-400/[0.06] blur-3xl" />
      <div className="absolute bottom-[-5rem] left-[-5rem] h-80 w-80 rounded-full bg-emerald-400/[0.06] blur-3xl" />
    </div>
  );
}
