import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, '..', 'test', 'fixture');
const bundlePath = join(fixtureDir, 'repo-1.bundle');
const repoPath = join(fixtureDir, 'repo-1');

console.log('Setting up test fixture...');

// Remove existing repo if it exists
if (existsSync(repoPath)) {
  console.log('Removing existing repo-1...');
  rmSync(repoPath, { force: true, recursive: true });
}

// Clone from bundle
console.log('Extracting repository from bundle...');
execSync(`git clone "${bundlePath}" "${repoPath}"`, {
  stdio: 'inherit',
});

console.log('Test fixture ready at:', repoPath);
console.log('');
console.log('To test the merge driver:');
console.log(`  cd "${repoPath}"`);
console.log('  git merge feature');
