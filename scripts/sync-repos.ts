/**
 * sync-repos.ts
 *
 * Shallow-clone (or pull) all 4 MyEvaluations source repos into .repos/ directory.
 * Uses GITHUB_TOKEN for HTTPS auth, falls back to SSH if no token is set.
 *
 * Usage: tsx scripts/sync-repos.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPOS_DIR = path.join(PROJECT_ROOT, '.repos');

interface RepoConfig {
  org: string;
  name: string;
  branch: string;
}

const REPOS: RepoConfig[] = [
  { org: 'myevaluations', name: 'myevals-dotnet-backend', branch: 'master' },
  { org: 'myevaluations', name: 'myevals-nodejs-backend', branch: 'main' },
  { org: 'myevaluations', name: 'myevals-react-frontend', branch: 'main' },
  { org: 'myevaluations', name: 'myevals-xamarin-app', branch: 'main' },
];

function getCloneUrl(repo: RepoConfig): string {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return `https://${token}@github.com/${repo.org}/${repo.name}.git`;
  }
  // Fall back to SSH
  console.log(`  No GITHUB_TOKEN set, using SSH for ${repo.name}`);
  return `git@github.com:${repo.org}/${repo.name}.git`;
}

function exec(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000, // 2 minute timeout per operation
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Command failed: ${cmd}\n${message}`);
  }
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function syncRepo(repo: RepoConfig): Promise<void> {
  const repoDir = path.join(REPOS_DIR, repo.name);
  const url = getCloneUrl(repo);

  if (await directoryExists(repoDir)) {
    // Repo already exists -- pull latest changes
    console.log(`  Pulling latest for ${repo.name} (branch: ${repo.branch})...`);
    try {
      exec(`git fetch origin ${repo.branch} --depth 1`, repoDir);
      exec(`git reset --hard origin/${repo.branch}`, repoDir);
      console.log(`  Updated ${repo.name} successfully.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  Warning: Failed to pull ${repo.name}: ${message}`);
      console.warn(`  Continuing with existing checkout.`);
    }
  } else {
    // Fresh clone
    console.log(`  Cloning ${repo.name} (branch: ${repo.branch})...`);
    try {
      exec(
        `git clone --depth 1 --branch ${repo.branch} ${url} ${repoDir}`
      );
      console.log(`  Cloned ${repo.name} successfully.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Error: Failed to clone ${repo.name}: ${message}`);
      console.error(`  Skipping this repo. Some generated docs may be incomplete.`);
    }
  }
}

async function main(): Promise<void> {
  console.log('=== MyEvals Docs: Sync Source Repos ===\n');
  console.log(`Repos directory: ${REPOS_DIR}`);

  // Ensure .repos directory exists
  await fs.mkdir(REPOS_DIR, { recursive: true });

  for (const repo of REPOS) {
    console.log(`\n[${repo.org}/${repo.name}]`);
    await syncRepo(repo);
  }

  console.log('\n=== Repo sync complete ===');

  // List what we have
  try {
    const entries = await fs.readdir(REPOS_DIR);
    const dirs = [];
    for (const entry of entries) {
      const stat = await fs.stat(path.join(REPOS_DIR, entry));
      if (stat.isDirectory()) {
        dirs.push(entry);
      }
    }
    console.log(`Available repos: ${dirs.join(', ') || '(none)'}`);
  } catch {
    console.log('Could not list repos directory.');
  }
}

main().catch((err) => {
  console.error('Fatal error during repo sync:', err);
  process.exit(1);
});
