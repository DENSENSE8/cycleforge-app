/**
 * Smoke fixture — one planted literal per axis ds_critique must name.
 * Generic "use var(--token)" is a fail; each problem cites its ds_tokens axis.
 */
export function BadTokenLiterals() {
  return (
    <div
      className="text-[13px] z-[99] rounded-[8px]"
      style={{ color: '#1a1a1d' }}
    >
      drift
    </div>
  )
}
