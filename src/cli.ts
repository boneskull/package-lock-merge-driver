#!/usr/bin/env node

import Debug from 'debug';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import slug from 'slug';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  findLockfile,
  install,
  isNpmV7OrGreater,
  merge,
  uninstall,
} from './lib.js';

const SCRIPT_NAME = 'package-lock-merge-driver';

const DEFAULT_DRIVER_NAME = slug(SCRIPT_NAME, { lower: true });

const debug = Debug('package-lock-merge-driver');

const dirname =
  'dirname' in import.meta
    ? import.meta.dirname
    : path.dirname(url.fileURLToPath(import.meta.url));

export const main = async () => {
  const pkg = await fs
    .readFile(path.join(dirname, '..', 'package.json'), 'utf-8')
    .then((data) => {
      return JSON.parse(data) as { name: string; version: string };
    });
  return yargs(hideBin(process.argv))
    .scriptName(SCRIPT_NAME)
    .options({
      verbose: {
        alias: ['debug'],
        default: false,
        description: 'Enable verbose logging',
        global: true,
        type: 'boolean',
      },
    })
    .middleware((argv) => {
      if (argv.verbose) {
        Debug.enable(SCRIPT_NAME);
        debug('Verbose logging enabled');
      }
      console.error(`🔐 ${pkg.name} v${pkg.version}\n`);
    })
    .command(
      'install',
      'Set up the merge driver in the current git repository.',
      {
        command: {
          description:
            'Command to be used as the driver in the Git configuration',
          type: 'string',
        },
        local: {
          description: 'install to your user-level git configuration',
          type: 'boolean',
        },
        name: {
          coerce: slug,
          default: DEFAULT_DRIVER_NAME,
          description:
            'String to use as the merge driver name in your configuration; will be slugified',
          type: 'string',
        },
      },
      async ({ command, local, name }) => {
        const { gitAttributesFilepath, source } = await install(name, {
          command,
          local,
        });

        console.error(
          `${SCRIPT_NAME}:`,
          `Installed driver named "${name}" to Git config at ${source} and Git attributes file ${gitAttributesFilepath}.\n\nTo validate, run:\n  git config get --includes merge."${name}".name`,
        );
      },
    )
    .command(
      'uninstall',
      'Remove a previously configured driver',
      {
        global: {
          default: true,
          description: 'Uninstall from user Git configuration',
          type: 'boolean',
        },
        name: {
          coerce: slug,
          default: DEFAULT_DRIVER_NAME,
          description: 'Merge driver name to uninstall; will be slugified',
          type: 'string',
        },
      },
      async ({ global: globalFlag, name }) => {
        if (await uninstall(name, globalFlag)) {
          console.error(`${SCRIPT_NAME}: uninstalled ${name}`);
        } else {
          console.error(
            `${SCRIPT_NAME}: could not find installation; nothing to do.`,
          );
        }
      },
    )
    .command(
      'merge <ours> <base> <theirs> [filepath]',
      'Check for conflicts in package-lock.json and attempt resolution',
      (yargs) =>
        yargs
          .positional('ours', {
            demandOption: true,
            describe: 'current branch version (%A)',
            type: 'string',
          })
          .positional('base', {
            demandOption: true,
            describe: 'common ancestor version (%O)',
            type: 'string',
          })
          .positional('theirs', {
            demandOption: true,
            describe: 'other branch version (%B)',
            type: 'string',
          })
          .positional('filepath', {
            describe: 'path to the file (%P)',
            type: 'string',
          }),
      async ({ base, filepath, ours, theirs }) => {
        if (!ours || !base || !theirs) {
          throw new TypeError(
            `Not enough arguments for merge command; needed three (3). Got ours: ${ours}, base: ${base}, theirs: ${theirs}`,
          );
        }

        if (!(await isNpmV7OrGreater())) {
          console.error(`${SCRIPT_NAME}: npm v7.0.0+ is required`);
          process.exitCode = 1;
          return;
        }

        if (!filepath) {
          const cwd = process.cwd();
          try {
            filepath = await findLockfile(cwd);
          } catch (err) {
            debug(
              'Warning: could not find package-lock.json from %s; using relative path ./package-lock.json: %s',
              cwd,
              err,
            );
          }
          filepath ??= './package-lock.json';
        }

        const success = await merge(ours, base, theirs, filepath);
        if (success) {
          console.error(
            `${SCRIPT_NAME}: Successfully resolved conflicts in ${filepath}`,
          );
        } else {
          console.error(
            `${SCRIPT_NAME}: Failed to resolve conflicts in ${filepath}`,
          );
          process.exitCode = 1;
        }
      },
    )
    .version()
    .alias('version', 'v')
    .help()
    .alias('help', 'h')
    .epilogue(
      'For the full documentation, see package-lock-merge-driver(1) in manpages',
    )
    .demandCommand()
    .strict()
    .parse(hideBin(process.argv));
};

void main();
