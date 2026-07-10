#!/usr/bin/env node
/**
 * Vercel ignoreCommand + GitHub Actions deploy gate.
 *
 * Exit 0 → skip build/deploy (no deploy-relevant changes).
 * Exit 1 → proceed with build/deploy.
 *
 * @see https://vercel.com/docs/project-configuration#ignorecommand
 */
import { execSync } from 'node:child_process';

const DEPLOY_PATHS = [
  'src/',
  'public/',
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'next.config.ts',
  'vercel.json',
  'tailwind.config.ts',
  'postcss.config.js',
  'postcss.config.mjs',
  'tsconfig.json',
  'scripts/prebuild-if-local.mjs',
  'scripts/generate-release-notes.mjs',
];

function hasDeployRelevantChanges() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const prevSha = process.env.VERCEL_GIT_PREVIOUS_SHA;

  // Vercel: compare against previous deployment commit when available.
  if (sha && prevSha) {
    try {
      const out = execSync(`git diff --name-only ${prevSha} ${sha}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (!out) return false;
      return out.split('\n').some((file) => matchesDeployPath(file));
    } catch {
      return true;
    }
  }

  // GitHub Actions / local CLI: compare HEAD to parent.
  try {
    const out = execSync('git diff --name-only HEAD^ HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!out) return false;
    return out.split('\n').some((file) => matchesDeployPath(file));
  } catch {
    // First commit or shallow clone — build to be safe.
    return true;
  }
}

function matchesDeployPath(file) {
  const normalized = file.replace(/\\/g, '/');
  return DEPLOY_PATHS.some((prefix) => {
    if (prefix.endsWith('/')) return normalized.startsWith(prefix);
    return normalized === prefix;
  });
}

if (hasDeployRelevantChanges()) {
  console.log('[vercel-should-build] deploy-relevant changes detected — proceeding');
  process.exit(1);
}

console.log('[vercel-should-build] no deploy-relevant changes — skipping build');
process.exit(0);
