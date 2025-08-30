# Test Fixtures

This directory contains test fixtures for the package-lock-merge-driver project.

## repo-1.bundle

This is a Git bundle containing a complete test repository with:

- **Main branch**: Dependencies = `base-lib` + `main-lib`
- **Feature branch**: Dependencies = `base-lib` + `feature-lib`
- **Fake dependencies**: Located in `deps/` directory (no external downloads)
- **Git merge driver**: Pre-configured to use package-lock-merge-driver

## Setup

To extract the test repository:

```bash
cd test
node setup-fixture.js
```

This will create `test/fixture/repo-1/` with a complete Git repository.

## Testing the Merge Driver

```bash
cd test/fixture/repo-1
git merge feature
```

Expected behavior:

- ✅ `package-lock.json`: Automatically resolved by merge driver
- ❌ `package.json`: Manual conflict (not handled by merge driver)

## Cleanup

To remove the test repository:

```bash
cd test
node cleanup-fixture.js
```

## Why a Bundle?

Git repositories can't contain other `.git` directories. A Git bundle is a single file that contains the complete repository history and can be committed to the main repository. It's extracted on-demand for testing.

## Bundle Creation

If you need to recreate the bundle after modifying the test repository:

```bash
cd test/fixture/repo-1
git bundle create ../repo-1.bundle --all
```
