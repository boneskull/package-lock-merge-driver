import { strict as assert } from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  BUNDLE_PATH,
  cleanupFixture,
  DIST_PATH,
  execGit,
  execGitWithIO,
  installMergeDriver,
  REPO_PATH,
  setupFixture,
} from './harness.js';

describe('package-lock-merge-driver', () => {
  before(async () => {
    // Set up paths

    // Set up the test fixture
    await cleanupFixture(REPO_PATH);
    await setupFixture(BUNDLE_PATH, REPO_PATH);
    await installMergeDriver(REPO_PATH, DIST_PATH);
  });

  after(async () => {
    await cleanupFixture(REPO_PATH);
  });

  it('should successfully resolve package-lock.json conflicts during git merge', async () => {
    // Verify the fixture repository exists
    await assert.doesNotReject(
      fs.access(REPO_PATH, fs.constants.F_OK | fs.constants.X_OK),
      'Test fixture repo-1 should exist. Run `npm run test:fixture:setup` first.',
    );

    // Verify it's a git repository
    await assert.doesNotReject(
      fs.access(
        path.join(REPO_PATH, '.git'),
        fs.constants.F_OK | fs.constants.X_OK,
      ),
      'Test fixture should be a git repository',
    );

    const currentBranch = (
      await execGit(['branch', '--show-current'])
    ).stdout.trim();

    assert.strictEqual(
      currentBranch,
      'main',
      'Should be on main branch for merge test',
    );

    // Verify package-lock.json exists before merge
    const packageLockPath = path.join(REPO_PATH, 'package-lock.json');
    await assert.doesNotReject(
      fs.access(packageLockPath, fs.constants.R_OK | fs.constants.F_OK),
      'package-lock.json should exist before merge',
    );

    // Get the initial package-lock.json content for comparison
    const initialPackageLock = await fs.readFile(packageLockPath, 'utf8');
    // We don't use this but verify it's valid JSON

    assert.doesNotThrow(() => JSON.parse(initialPackageLock));

    // Verify the merge driver is configured
    const mergeDriverConfig = (
      await execGit(
        ['config', '--get', 'merge.package-lock-merge-driver.driver'],
        { cwd: REPO_PATH },
      )
    ).stdout.trim();

    assert.ok(
      mergeDriverConfig.includes(`dist/cli.js`) &&
        mergeDriverConfig.includes('merge'),
      'Merge driver should be configured to use the local CLI build',
    );

    // Verify git attributes are set up
    const gitAttributesPath = path.join(
      REPO_PATH,
      '.git',
      'info',
      'attributes',
    );
    await assert.doesNotReject(
      fs.access(gitAttributesPath, fs.constants.R_OK | fs.constants.F_OK),
      'Git attributes file should exist after driver installation',
    );

    const attributesContent = await fs.readFile(gitAttributesPath, 'utf8');
    assert.ok(
      attributesContent.includes(
        'package-lock.json merge=package-lock-merge-driver',
      ),
      'Git attributes should specify merge driver for package-lock.json',
    );

    // Perform the merge that should trigger the merge driver
    // This should cause a conflict in package-lock.json that gets auto-resolved
    // but package.json will still have conflicts (which is expected)
    try {
      await execGitWithIO(['merge', 'feature'], {
        cwd: REPO_PATH,
      });
    } catch {
      // The merge will fail because package.json has conflicts,
      // but package-lock.json should be resolved by our merge driver
      // This is expected behavior
    }

    // Verify the merge was successful (no conflict markers)
    const finalPackageLock = await fs.readFile(packageLockPath, 'utf8');

    // Should not contain Git conflict markers
    assert.ok(
      !finalPackageLock.includes('<<<<<<<'),
      'Final package-lock.json should not contain Git conflict markers',
    );
    assert.ok(
      !finalPackageLock.includes('======='),
      'Final package-lock.json should not contain Git conflict markers',
    );
    assert.ok(
      !finalPackageLock.includes('>>>>>>>'),
      'Final package-lock.json should not contain Git conflict markers',
    );

    // Should be valid JSON (npm should have produced a valid lockfile)
    assert.doesNotThrow(() => {
      JSON.parse(finalPackageLock);
    }, 'Final package-lock.json should be valid JSON after npm resolution');

    // Verify git status shows package.json still has conflicts (expected)
    // but package-lock.json should be resolved
    const gitStatus = (
      await execGitWithIO(['status', '--porcelain'], {
        cwd: REPO_PATH,
      })
    ).stdout.trim();

    // Should have package.json as unmerged (UU) but package-lock.json as modified (M)
    assert.ok(
      /UU\s+package.json/.test(gitStatus),
      'package.json should still have unresolved conflicts',
    );
    assert.ok(
      /M\s+package-lock.json/.test(gitStatus),
      'package-lock.json should be resolved and modified',
    );

    // Note: We don't run `npm ls` here because the working directory is still
    // in a conflicted state due to package.json conflicts, which is expected.
    // The important thing is that package-lock.json was successfully resolved
    // by our merge driver.
  });
});
