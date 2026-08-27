import type { Variants } from '@/design-system/motion';
import { motion } from '@/design-system/motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import { ChevronDown } from '@/components/Icons';

export function PkgGroupHeader({
  groupSize,
  isCollapsed,
  staggerItemVariants,
  onToggle,
}: {
  groupSize: number;
  isCollapsed: boolean;
  staggerItemVariants?: Variants;
  onToggle: () => void;
}) {
  // Like RailRow: carry only `variants` and ride the container's `show` timeline
  // for the whole mount — never swap to an explicit contract, which would flicker
  // the settled header. Non-stagger rails fall back to a plain opacity presence.
  const motionProps = staggerItemVariants
    ? { variants: staggerItemVariants }
    : { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12, ease: motionBezier.easeOut } };
  return (
    <motion.li
      role="presentation"
      {...motionProps}
      // Full-bleed like RailRow — selection / group chrome is edge-to-edge.
      className="relative"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? 'Expand package' : 'Collapse package'}
        className="ds-raw-button flex w-full items-center gap-1.5 rounded-t-md border-t border-x border-indigo-200/70 bg-indigo-50/80 pl-3 pr-1 py-1 text-left text-indigo-700 transition-colors hover:bg-indigo-100/80"
      >
        <motion.span animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.18, ease: motionBezier.easeOut }} className="inline-flex">
          <ChevronDown className="h-3 w-3" />
        </motion.span>
        <span className="text-role-micro uppercase tracking-widest">PKG · {groupSize}</span>
        <span className="ml-auto text-role-micro uppercase tracking-widest text-indigo-400">{groupSize} items</span>
      </button>
    </motion.li>
  );
}
