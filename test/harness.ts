import Debug from 'debug';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import util from 'node:util';

const exec = util.promisify(childProcess.exec);

const dirname = import.meta.dirname;

const FIXTURE_PATH = path.join(dirname, 'fixture');
export const BUNDLE_PATH = path.join(FIXTURE_PATH, 'repo-1.bundle');
const GIT = 'git';
export const REPO_PATH = path.join(FIXTURE_PATH, 'repo-1');

export const DIST_PATH = path.join(dirname, '..', 'dist', 'cli.js');

const debug = Debug('package-lock-merge-driver:test');

/**
 * Clean up the test fixture by removing the extracted repository
 */
export const cleanupFixture = async (repoPath = REPO_PATH): Promise<void> => {
  try {
    await fs.access(repoPath, fs.constants.R_OK | fs.constants.X_OK);
    await fs.rm(repoPath, { force: true, recursive: true });
    debug('Removed test fixture at %s', repoPath);
  } catch (err) {
    debug(err);
  }
};

/**
 * Install the merge driver in the fixture repository
 *
 * @param repoPath - Path to the fixture repository
 * @param distPath - Path to the built CLI
 */
export const installMergeDriver = async (
  repoPath = REPO_PATH,
  distPath = DIST_PATH,
): Promise<void> => {
  await exec(
    `"${process.execPath}" "${distPath}" install --local --command "node ${DIST_PATH} merge %A %O %B %P"`,
    {
      cwd: repoPath,
    },
  );
};

export const execGitWithIO = async (
  args: string[] = [],
  options: childProcess.ExecOptionsWithStringEncoding = {},
) => {
  const command = `${GIT} ${args.join(' ')}`;
  debug('Executing command', command);
  const promise = exec(command, <childProcess.ExecOptionsWithStringEncoding>{
    cwd: REPO_PATH,
    ...options,
    encoding: 'utf8',
  });
  promise.child.stdout?.pipe(process.stdout);
  promise.child.stderr?.pipe(process.stderr);
  return await promise;
};

export const execGit = async (
  args: string[] = [],
  options: childProcess.ExecOptionsWithStringEncoding = {},
) => {
  const command = `${GIT} ${args.join(' ')}`;
  debug('Executing command', command);
  return exec(command, <childProcess.ExecOptionsWithStringEncoding>{
    cwd: REPO_PATH,
    ...options,
    encoding: 'utf8',
  });
};

/**
 * Reset the fixture repository to a clean state for testing
 *
 * @param repoPath - Path to the fixture repository
 */
export const resetFixtureRepo = async (repoPath = REPO_PATH): Promise<void> => {
  // Reset any potential conflicts from previous test runs
  try {
    await execGitWithIO(['merge', '--abort'], { cwd: repoPath });
  } catch {
    // Ignore errors - there might not be a merge in progress
  }
  try {
    await execGitWithIO(['reset', '--hard', 'HEAD'], { cwd: repoPath });
  } catch {
    // Ignore errors
  }

  // Switch to main branch (fixture might start on feature branch)
  try {
    await execGitWithIO(['checkout', 'main'], { cwd: repoPath });
  } catch {
    // If main doesn't exist, try to create it from origin/main
    try {
      await execGitWithIO(['checkout', '-b', 'main', 'origin/main'], {
        cwd: repoPath,
      });
    } catch {
      // If that fails too, we might already be on the right branch
      debug('Could not checkout main branch, staying on current branch');
    }
  }
};

/**
 * Set up the test fixture by extracting the repository from the bundle
 */
export const setupFixture = async (
  bundlePath = BUNDLE_PATH,
  repoPath = REPO_PATH,
  branch = 'main',
): Promise<void> => {
  await cleanupFixture();
  await execGitWithIO(['clone', bundlePath, repoPath], {
    cwd: FIXTURE_PATH,
  });
  await execGitWithIO(['checkout', branch], { cwd: repoPath });
};
