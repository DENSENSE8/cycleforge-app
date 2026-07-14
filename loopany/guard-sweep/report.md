---
type: alert
title: Guard sweep failures (2026-07-13)
date: 2026-07-13
---

# Guard sweep — 2026-07-13

1 of 4 checks failed.

## ds-guards (exit 1)
```
TAP version 13
# Subtest: raw neutral utility classes do not grow (ratchet → theme-registry tokens)
ok 1 - raw neutral utility classes do not grow (ratchet → theme-registry tokens)
  ---
  duration_ms: 276.174083
  type: 'test'
  ...
# Subtest: arbitrary-hex utility classes do not grow (ratchet → semantic tokens)
ok 2 - arbitrary-hex utility classes do not grow (ratchet → semantic tokens)
  ---
  duration_ms: 233.64975
  type: 'test'
  ...
# Subtest: native-element title= count does not grow (ratchet → HoverTooltip)
not ok 3 - native-element title= count does not grow (ratchet → HoverTooltip)
  ---
  duration_ms: 81.22375
  type: 'test'
  location: '/Users/icecube/repos/cycleforge-app/src/components/ui/native-title.guard.test.ts:2:1894'
  failureType: 'testCodeFailure'
  error: 'Native `title=` count grew to 48 (baseline 46). Use <HoverTooltip label="…"> from @/components/ui/HoverTooltip instead of a native title attribute. If an OS-level title is genuinely wanted, add a `ds-allow-title` comment on/above the line. Do not raise the baseline — LOWER it.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    TestContext.<anonymous> (/Users/icecube/repos/cycleforge-app/src/components/ui/native-title.guard.test.ts:70:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
# Subtest: HoverTooltip remains the single house tooltip primitive
ok 4 - HoverTooltip remains the single house tooltip primitive
  ---
  duration_ms: 0.117792
  type: 'test'
  ...
# Subtest: raw <button> count outside the design system does not grow (ratchet)
not ok 5 - raw <button> count outside the design system does not grow (ratchet)
  ---
  duration_ms: 231.64475
  type: 'test'
  location: '/Users/icecube/repos/cycleforge-app/src/components/ui/raw-button.guard.test.ts:2:1587'
  failureType: 'testCodeFailure'
  error: 'Hand-rolled <button> count grew to 51 (baseline 36). Use <Button>/<IconButton> from @/design-system/primitives. If a raw <button> is genuinely required, add a `ds-raw-button` comment on/above the line. Do not raise the baseline — LOWER it as you migrate.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    TestContext.<anonymous> (/Users/icecube/repos/cycleforge-app/src/components/ui/raw-button.guard.test.ts:97:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
# Subtest: the deprecated DS PrimaryButton alias stays deleted (use <Button>)
ok 6 - the deprecated DS PrimaryButton alias stays deleted (use <Button>)
  ---
  duration_ms: 107.994708
  type: 'test'
  ...
# Subtest: the deleted SidebarSearchBar component stays deleted
ok 7 - the deleted SidebarSearchBar component stays deleted
  ---
  duration_ms: 0.340416
  type: 'test'
  ...
# Subtest: no file imports a SidebarSearchBar symbol
ok 8 - no file imports a SidebarSearchBar symbol
  ---
  duration_ms: 194.336916
  type: 'test'
  ...
# Subtest: SidebarShell exposes no `search` prop (header owns search)
ok 9 - SidebarShell exposes no `search` prop (header owns search)
  ---
  duration_ms: 0.13775
  type: 'test'
  ...
# Subtest: the 40px sidebar search band token stays deleted
ok 10 - the 40px sidebar search band token stays deleted
  ---
  duration_ms: 114.582292
  type: 'test'
  ...
# Subtest: no raw text-[Npx] — use CF Type roles or the Tailwind scale
ok 11 - no raw text-[Npx] — use CF Type roles or the Tailwind scale
  ---
  duration_ms: 252.539625
  type: 'test'
  ...
# Subtest: the retired legacy px tokens never reappear
ok 12 - the retired legacy px tokens never reappear
  ---
  duration_ms: 
```
