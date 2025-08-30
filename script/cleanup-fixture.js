import { existsSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoPath = join(__dirname, '..', 'test', 'fixture', 'repo-1');

if (existsSync(repoPath)) {
  console.log('Cleaning up test fixture...');
  rmSync(repoPath, { force: true, recursive: true });
  console.log('Test fixture cleaned up.');
} else {
  console.log('No test fixture to clean up.');
}
