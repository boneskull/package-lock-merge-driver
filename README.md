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
- Requires Node.js v20.0.0+
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

## Automatic Setup (Recommended)

To start using it right away:

```sh
npx package-lock-merge-driver install
```

The next time _any_ `package-lock.json` has a conflict, a merge driver will attempt to automatically fix it. Unless it fails, you don't need to do anything else. You _will_ still need to resolve conflicts in `package.json` files yourself, though!

> [!TIP]
>
> Once you've tried it a couple times and felt its powerful magic, it's recommended to install `package-lock-merge-driver` globally to avoid some `npx`-related overhead:
>
> ```sh
> npm install -g package-lock-merge-driver
> ```
>
> BONUS! If you install globally and are on a POSIX OS, you _should_ be able to run `man package-lock-merge-driver` to see the _man page_! Which is just this `README.md`; sorry.

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

## Uninstallation

This only applies if you used the method detailed in [Automatic Setup](#automatic-setup-recommended). If you didn't, then figure it out yourself.

To remove an installed merge driver, use `package-lock-merge-driver uninstall`:

```sh
npx package-lock-merge-driver uninstall [--global] [--name=package-lock-merge-driver]
```

This will remove the driver from whatever Git configuration it put it in originally, and then remove it from the `gitattributes` file it used. If it created the `gitattributes` file and it is empty after removing the entry, `package-lock-merge-driver` will delete the file because it's a sweetheart.

## Advanced Automated Setup

The `install` command does the actual configuration ("installation") of the merge driver. It supports a couple of config options:

- `--command` - This is the command used for the actual merge operation. You probably don't want to fiddle with this.

- `--name` - String to use as the internal driver name in your configuration. I don't know why this option is even here, but it is.

- `--local` - Install the driver in the local repository only. By default, the driver is installed globally.

For example, to install the driver locally in the current working directory using a custom name:

```sh
npx package-lock-merge-driver install --local --name=butts
```

### Verbose Logging

Run any command with `--verbose` to get more output. For example:

```sh
npx package-lock-merge-driver install --verbose
```

## Manual Setup

This is tedious.

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
# this is the most important part!
git config --global merge.package-lock-merge-driver.driver \
    "npx package-lock-merge-driver merge %A %O %B %P"
```

Add the relevant attributes to `~/.gitattributes` (creating if necessary):

```gitattributes
package-lock.json merge=package-lock-merge-driver
```

The RHS of the `merge` attribute above _must_ match `<name>` in `merge.<name>.driver`.

## How it Works

1. Barely.
2. _Trash_ (read: _move to the OS' trash/recycle bin/shitcan_) `node_modules` and _any other_ `node_modules` folders found in workspaces, then re-run `npm install`.
3. Validate result by running `npm ls`.

> [!NOTE]
>
> Workspaces (monorepo) support is best-effort, since `package.json` may be in conflict when we try to parse it. This will typically only affect the resulting lockfile if the actual [`workspaces` field](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#workspaces) is in conflict.

### And Why It Works That Way

- `npm install --package-lock-only` will not avail you as of npm v7.0.0. So that's out.
- Running a full `npm install` every time is slow enough without a `rm -rf node_modules packages/*/node_modules` first (though I could make this configurable, I suppose), we just move them away. Your OS will take care of it. Trust me.
  This has the advantage of mitigating churn in `package-lock.json` due to how `npm` modifies `package-lock.json` when a `node_modules` is present. If you ever see random extra fields being added and removed to `package-lock.json`, you know what I mean. I'm pretty sure this is just a bug in `npm`.
- `npm ci` is not possible, of course, because it only works if the lockfile is valid _and_ synced with all `package.json` manifests.
- Just accepting "their" `package-lock.json` doesn't help, as it will _always_ require a manual `npm install` thereafter.

## A Final Plea

If you know of some way to sort out the conflicts _without_ a full `npm install`, [please file an issue](https://github.com/boneskull/package-lock-merge-driver/issues/new). Please. 🥹

## Authors

- Current maintainer: [Christopher Hiller](https://github.com/boneskull)
- Original author: Kat Marchán

## License

- Copyright © 2025 Christopher Hiller
- Copyright © 2017 Microsoft Corporation (a.k.a. npm, Inc. a.k.a. GitHub)

This work is released under the terms of the ISC license. See `LICENSE.md` for details.
