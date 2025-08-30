# Copilot Instructions for package-lock-merge-driver

## Project Overview

This is a Git merge driver for `package-lock.json` files that resolves conflicts automatically during Git operations like rebase/merge. It's a CLI tool that registers itself with Git configuration and handles npm workspace scenarios.

## Architecture

### Core Components

- **`src/cli.ts`**: CLI interface using yargs with three commands: `install`, `uninstall`, `merge`
- **`src/lib.ts`**: Core logic with async functions for Git config manipulation and merge resolution
- **ESM-only project**: Uses `"type": "module"` with `.js` imports for TypeScript files

### Key Algorithms

#### Merge Strategy (in `merge()` function)

1. Use `git merge-file -p` to create initial merged lockfile
2. Try quick resolution: `npm install --package-lock-only && npm ls`
3. If that fails, trash all `node_modules` directories (including workspace dirs), then full `npm install && npm ls`
4. Return boolean success/failure

#### Git Configuration Pattern

- Uses `git config --show-origin --list --includes` to read config with file origins
- Handles both global (`~/.config/git/attributes`) and local (`.git/info/attributes`) installations
- Tracks installation source in `merge."driverName".created` config key

## Development Patterns

### Error Handling

- **Use type guards**: `isError()` for general errors, `isErrnoException()` for Node.js filesystem errors
- **ENOENT handling**: Consistently ignore file-not-found errors when reading optional files
- **Pattern**: `if (isErrnoException(err) && err.code !== 'ENOENT') { throw err; }`

### Debug Logging

- All shell commands are logged via `debug('Executing command: %s', command)`
- Use the `debug` module with namespace `package-lock-merge-driver`
- Enable via `DEBUG=package-lock-merge-driver`

### File Path Handling

- Always use absolute paths for cross-platform compatibility
- Handle tilde expansion: `filepath.replace(/^\s*~\//, \`\${home}/\`)`
- Use `path.join()` for construction, `path.resolve()` for workspace roots

## Critical Commands & Workflows

### Build & Test

```bash
npm run build          # tsup compilation to dist/
npm run dev           # watch mode development
npm test              # Node.js built-in test runner with tsx
npm run lint:fix      # ESLint with TypeScript-ESLint rules
```

### Local Development

- Set `DEBUG=package-lock-merge-driver` to see internal operations
- Test installation: `node dist/cli.js install --local`
- Test merge: Create conflicted lockfile and run merge command directly

## Git Configuration Integration

The tool modifies two Git configurations:

1. **Merge driver config**: `merge."driverName".driver` and `merge."driverName".name`
2. **Attributes file**: Adds `package-lock.json merge=driverName` line

**Key insight**: The `--includes` flag in git config commands traverses included config files, essential for complex Git setups.

## Dependencies & Constraints

### Bundled Dependencies

- `yargs`, `debug`, `slug`, `trash` are bundled via `bundleDependencies`
- Ensures tool works via `npx` without additional installs

### TypeScript Configuration

- Strict settings enabled (`noUncheckedIndexedAccess`, `strict`)
- ESM modules (`"module": "nodenext"`)
- Experimental declaration generation in tsup

### Testing

- Minimal test coverage (placeholder tests)
- Uses Node.js built-in test runner with tsx for TypeScript support

## Common Gotchas

- Git config commands must use proper escaping for driver names with quotes
- Workspace detection relies on `package.json` workspaces array, not npm workspace commands
- The `trash` module moves files to OS trash/recycle bin, not permanent deletion
- Function overloads in `findGitAttributes()` handle both config objects and boolean flags
