import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Updates a Git bundle with the contents of a working tree
 *
 * @param {string} bundlePath - Path to the bundle file
 * @param {string} workingTreePath - Path to the working tree directory
 */
function updateBundle(bundlePath, workingTreePath) {
  // Resolve paths to absolute paths
  const absoluteBundlePath = resolve(bundlePath);
  const absoluteWorkingTreePath = resolve(workingTreePath);

  // Check if working tree exists and is a Git repository
  if (!existsSync(absoluteWorkingTreePath)) {
    throw new Error(
      `Working tree directory does not exist: ${absoluteWorkingTreePath}`,
    );
  }

  if (!existsSync(`${absoluteWorkingTreePath}/.git`)) {
    throw new Error(
      `Directory is not a Git repository: ${absoluteWorkingTreePath}`,
    );
  }

  console.log(`Updating bundle: ${absoluteBundlePath}`);
  console.log(`From working tree: ${absoluteWorkingTreePath}`);

  try {
    // Create bundle with all branches and tags from the working tree
    execSync(`git bundle create "${absoluteBundlePath}" --all`, {
      cwd: absoluteWorkingTreePath,
      stdio: 'inherit',
    });

    console.log('Bundle updated successfully!');
  } catch (error) {
    throw new Error(`Failed to update bundle: ${error.message}`);
  }
}

// CLI interface
const args = process.argv.slice(2);

if (args.length !== 2) {
  console.error(
    'Usage: node update-bundle.js <bundle-path> <working-tree-path>',
  );
  console.error('');
  console.error('Examples:');
  console.error(
    '  node update-bundle.js test/fixture/repo-1.bundle test/fixture/repo-1',
  );
  console.error('  node update-bundle.js my-repo.bundle /path/to/my-repo');
  process.exit(1);
}

const [bundlePath, workingTreePath] = args;

try {
  updateBundle(bundlePath, workingTreePath);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
