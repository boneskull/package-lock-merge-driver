# 🔐 package-lock-merge-driver

> Git merge driver for `package-lock.json` v2+

This is a fork of the original (unmaintained) [`npm-merge-driver`](https://github.com/npm/npm-merge-driver) project.

## What is this?

This package provides a CLI to install (and uninstall) a [merge driver](https://git-scm.com/docs/gitattributes#_defining_a_custom_merge_driver) which attempts to automatically resolve merge conflicts in `package-lock.json` files.

## Do I need it?

Do you get merge conflicts in your `package-lock.json` files? Like _all the damn time?_ Then yeah.

## Differences from `npm-merge-driver`

> TL;DR: _This is a whole-ass package_.

- Supports for npm workspaces (monorepos)
- Sacrifices speed for reliability
- Validates the result via `npm ls` to check for broken dependencies (if this fails, automatic resolution fails)
- Default behavior is to **install merge drivers globally** (you can still install locally if you want)
- Requires Node.js v18.13.0+
- Requires `npm` v7.0.0+
- Removed `--no-legacy` flag because what is even that
- Supports Git [includes](https://git-scm.com/docs/git-config#_includes) when discovering and writing to Git configuration files
- Will cleanup empty `gitattributes` files it created
- Tested against an _actual Git repository_
- Unrecognizable compared to original; don't bother

In addition, the following items are _current_ differences, but they _might_ instead become _non-differences_ in a hypothetical future:

- **Use with Yarn or pnpm lockfiles is unsupported**
- No support for `npm-shrinkwrap.json`, but you probably don't care about that

> I suppose if (big _if_) I do end up supporting Yarn or pnpm then I might need to rename the package. I'll think of a better name.

### Motivation

I needed [npm-merge-driver](https://github.com/npm/npm-merge-driver) to work. But it doesn't, and there's no way forward to fix it. So against my better judgement, here we are.

## Automatic Setup (recommended)

To start using it right away:

```sh
npx package-lock-merge-driver install
```

The next time _any_ `package-lock.json` has a conflict, a merge driver will attempt to automatically fix it. Unless it fails, you don't need to do anything else. You _will_ still need to resolve conflicts in `package.json` files yourself, though!

### Example Scenario

After installation, you create a feature branch and make some dependency changes. Now you want to rebase onto `main`:

```sh
git rebase main
```

Eek, there's a conflict! But don't panic! You should see something like thiss:

```plain
🔐 package-lock-merge-driver v2.3.6

Moved to trash: /my-repo/node_modules
package-lock-merge-driver: Successfully resolved conflicts in package-lock.json
Auto-merging package-lock.json
```

Did conflicts in `package-lock.json` remain?

```sh
git status
```

```plain
M   package-lock.json
```

No. No conflicts in `package-lock.json` remain.

## How it Works

1. Barely.
2. _Trash_ (read: _move to the OS' trash/recycle bin/shitcan_) `node_modules` and _any other_ `node_modules` folders found in workspaces, then re-run `npm install`.
3. Validate result by running `npm ls`.

Here's the rationale:

- Running a full `npm install` every time is slow enough without a `rm -rf node_modules packages/*/node_modules` first (though I could make this configurable, I suppose), we just move them away. Your OS will take care of it. Trust me.
- This has the advantage of mitigating churn in `package-lock.json` due to how `npm` modifies `package-lock.json` when a `node_modules` is present. I'm pretty sure this is just a bug in `npm`.
- `npm ci` is not possible, of course, because it only works if the lockfile is valid _and_ synced with all `package.json` manifests.
- The original `npm-merge-driver` would retry the first step by attempting to use "their" `package-lock.json`, but this was folly, since it'd still _always_ require manual intervention.
- Workspaces are _not_ assumed to be in `packages/*`. Best effort here, since `package.json` may be in conflict when we try to parse it.

## Advanced Setup

The following section is only for advanced configuration of the driver if you
have specific needs.

For additional help (maybe), try `npx package-lock-merge-driver --help`.

### Installation Options

The `install` command supports a couple of config options:

- `--command` - This is the command used for the actual merge operation. You probably don't want to fiddle with this.

- `--name` - String to use as the internal driver name in your configuration. Also probably don't want to fiddle with this.

- `--local` - Install the driver in the local repository only. By default, the driver is installed globally.

### Merge Options

There are no options for the `merge` command; it just takes positional arguments given to it by Git.

#### Install as Dependency

To avoid regular `npx` installs, consider installing the driver:

```sh
npm install [-g|-D] package-lock-merge-driver
```

#### Manual Setup (advanced)

`package-lock-merge-driver`'s automated installation uses the following config:

1. A merge driver in the main Git configuration, including
   - `name` (description [really]),
   - `driver` (the actual command)
   - `gitAttributesPath` (path to the `gitattributes` file we will write to; this is only necessary for clean uninstallation and you can ignore it if installing manually)
2. A `gitattributes(5)` configuration referencing `package-lock.json` and the merge driver configured in 1.

If you **do not** want `package-lock-merge-driver` to install itself for you (I guess I wouldn't blame you), here's an example of a manual global installation:

Add the driver to `~/.gitconfig`:

```sh
git config --global merge.package-lock-merge-driver.name \
    "Automatically merge npm lockfiles"
git config --global merge.package-lock-merge-driver.driver \
    "npx package-lock-merge-driver merge %A %O %B %P"
```

Add the relevant attributes to `~/.gitattributes` (creating if necessary):

```gitattributes
package-lock.json merge=package-lock-merge-driver
```

> [!IMPORTANT]
>
> - In case you missed it above, lockfiles from any package manager other than `npm` are unsupported.
> - `npm-shrinkwrap.json` is unsupported.

## Uninstalling

This only applies if you used automatic installation. If you didn't, then figure it out yourself.

To remove an installed merge driver, use `package-lock-merge-driver uninstall`:

```sh
npx package-lock-merge-driver uninstall [--global] [--name=package-lock-merge-driver]
```

This will remove the driver from whatever Git configuration it put it in originally, and then remove it from the `gitattributes` file it used. If it created the `gitattributes` file and it is empty after removing the entry, `package-lock-merge-driver` will delete the file because it's a sweetheart.

## A Final Plea

If you know of some way to sort out the conflicts _without_ a full `npm install`, [please file an issue](https://github.com/boneskull/package-lock-merge-driver/issues/new). Please. 🥹

## Authors

- Current maintainer: [Christopher Hiller](https://github.com/boneskull)
- Original author: Kat Marchán

## License

- Copyright © 2025 Christopher Hiller
- Copyright © 2017 Microsoft Corporation (prev npm, Inc.)

This work is released under the terms of the ISC license. See `LICENSE.md` for details.
