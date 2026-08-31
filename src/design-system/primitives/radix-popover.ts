/**
 * shadcn/ui Popover (Radix) — re-export of {@link '@/components/ui/popover'}
 * so identity chrome imports it the same way as DropdownMenu / Switch
 * (`@/design-system/primitives/…`), without colliding with the DS
 * AnchoredLayer {@link Popover} in this folder's barrel.
 */
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from '@/components/ui/popover';
