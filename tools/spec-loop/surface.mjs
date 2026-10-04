/**
 * Which surface a file paints — read from the Boundary gate's own law (.dependency-cruiser.cjs,
 * ARCHITECTURE.md "Component split (binding)"), so the loop and the gate can never disagree.
 *
 *   mobile    src/components/mobile/** + src/app/m/**
 *   primitive src/design-system/** + the platform-primitive dirs the mobile rule allows
 *   desktop   every other src/components/** and src/app/** (and src/features/**)
 *   logic     everything else (src/lib, hooks, contexts, …)
 */
import { createRequire } from 'node:module';
import path from 'node:path';

export function loadSurfaceLaw(repo) {
  const require = createRequire(path.join(repo, 'package.json'));
  const config = require(path.join(repo, '.dependency-cruiser.cjs'));
  const mobileRule = config.forbidden.find((r) => r.name === 'mobile-no-desktop-surface-components');
  if (!mobileRule) throw new Error('surface: .dependency-cruiser.cjs has no mobile-no-desktop-surface-components rule');
  const mobile = new RegExp(mobileRule.from.path);
  const primitive = [/^src\/design-system\//, ...mobileRule.to.pathNot.filter((p) => !p.includes('components/mobile')).map((p) => new RegExp(p))];
  return function surfaceOf(file) {
    if (primitive.some((re) => re.test(file))) return 'primitive';
    if (mobile.test(file)) return 'mobile';
    if (/^src\/(components|app|features)\//.test(file)) return 'desktop';
    return 'logic';
  };
}
