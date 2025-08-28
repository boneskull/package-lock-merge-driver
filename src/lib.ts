import Debug from 'debug';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'path';
import trash from 'trash';
import { promisify } from 'util';

const debug = Debug('package-lock-merge-driver');

const exec = promisify(childProcess.exec);

/**
 * Type guard to check if a value is an error-like object
 *
 * @param value - The value to check
 * @returns True if the value has error-like properties including a message
 */
const isError = (value: unknown): value is Error & Record<string, any> => {
  return value != null && typeof value === 'object' && 'message' in value;
};

/**
 * Type guard to check if a value is a Node.js ErrnoException
 *
 * @param value - The value to check
 * @returns True if the value is an error with a code property
 */
const isErrnoException = (value: unknown): value is NodeJS.ErrnoException => {
  return isError(value) && 'code' in value && typeof value.code === 'string';
};

/**
 * Check if npm is version 7.0.0 or greater
 *
 * @returns Promise<boolean> - true if npm >= 7.0.0, false otherwise
 */
export const isNpmV7OrGreater = async (): Promise<boolean> => {
  try {
    const result = await exec('npm --version');
    const version = result.stdout.trim();
    debug('npm version: %s', version);

    // Parse the version string (e.g., "10.8.2" -> [10, 8, 2])
    const versionParts = version.split('.').map((part) => parseInt(part, 10));
    const majorVersion = versionParts[0];

    // Check if we have a valid major version and it's >= 7
    return (
      typeof majorVersion === 'number' &&
      !isNaN(majorVersion) &&
      majorVersion >= 7
    );
  } catch (error) {
    debug('Failed to get npm version: %s', error);
    return false;
  }
};

/**
 * Extract workspaces array from a potentially conflicted package.json file
 *
 * @param filepath - Path to the package.json file
 * @returns Array of workspace glob patterns, or empty array if not found
 */
const getWorkspaces = async (filepath: string): Promise<string[]> => {
  try {
    const content = await fs.readFile(filepath, 'utf8');
    debug('Checking workspaces in %s', filepath);

    // Look for workspaces property in the file content
    // Handle both "workspaces": ["glob1", "glob2"] and "workspaces":["glob1","glob2"]
    // This regex looks for the workspaces property and captures the array content
    const workspacesMatch = content.match(
      /"workspaces"\s*:\s*\[\s*([^\]]*)\s*\]/,
    );

    if (workspacesMatch && workspacesMatch[1]) {
      const arrayContent = workspacesMatch[1];
      debug('Found workspaces array content: %s', arrayContent);

      // Extract quoted strings from the array content
      // This handles both single and double quotes, with optional whitespace
      const workspaceMatches = arrayContent.match(/["']([^"']+)["']/g);

      if (workspaceMatches) {
        const workspaces = workspaceMatches.map(
          (match) => match.replace(/^["']|["']$/g, ''), // Remove surrounding quotes
        );
        debug('Extracted workspaces: %o', workspaces);
        return workspaces;
      }
    }

    debug('No workspaces found in %s', filepath);
    return [];
  } catch (error) {
    debug('Failed to read package.json %s: %s', filepath, error);
    return [];
  }
};

const updateGitAttributes = async (filepath: string, driverName: string) => {
  let attrContents = '';
  try {
    const RE = new RegExp(`package-lock\\.json\\smerge\\s*=\\s*${driverName}$`);
    attrContents = (await fs.readFile(filepath, 'utf8'))
      .split(/\r?\n/)
      .filter((line) => !line.match(RE))
      .join('\n');
  } catch (err) {
    if (isErrnoException(err) && err.code !== 'ENOENT') {
      throw err;
    }
    debug('gitattributes file at %s does not exist; creating…', filepath);
  }
  if (attrContents && !attrContents.match(/[\n\r]$/g)) {
    attrContents = '\n';
  }
  attrContents += `package-lock.json merge=${driverName}\n`;
  await fs.writeFile(filepath, attrContents);
  debug('Wrote git attributes to file %s', filepath);
};

const getAttributesFilepathFromConfig = (
  gitConfig: GitConfigWithSource,
): undefined | { gitAttributesFilepath: string; source: string } => {
  const coreAttributes = gitConfig['core.attributesfile'];
  if (coreAttributes && coreAttributes.value) {
    const retval = {
      gitAttributesFilepath: coreAttributes.value,
      source: coreAttributes.filepath,
    };
    debug(
      'Using core.attributesfile %s from config at %s',
      retval.gitAttributesFilepath,
      retval.source,
    );
    return retval;
  }
};

/**
 * Do not call this if we haven't already determined it doesn't exist.
 *
 * @param filepath
 * @param local
 */
const setAttributesFilepath = async (
  filepath: string,
  driverName: string,
  local = false,
): Promise<{ gitAttributesFilepath: string; source: string }> => {
  debug(
    'Persisting core.attributesfile to %s in %s Git config',
    filepath,
    local ? 'local' : 'global',
  );
  await exec(
    `git config set ${local ? '--local' : '--global'} core.attributesfile "${filepath}"`,
  );
  const gitConfig = await getGitConfigWithOrigins(local);
  const { gitAttributesFilepath, source } =
    getAttributesFilepathFromConfig(gitConfig) ?? {};
  if (!gitAttributesFilepath || gitAttributesFilepath !== filepath || !source) {
    throw new Error(
      `Failed to set core.attributesfile to ${filepath} in ${
        local ? 'local' : 'global'
      } Git config`,
    );
  }
  await exec(
    `git config set ${local ? '--local' : '--global'} merge."${driverName}".created "${source}"`,
  );

  return { gitAttributesFilepath, source };
};

async function findGitAttributes(
  driverName: string,
  gitConfig?: GitConfigWithSource,
): Promise<{ gitAttributesFilepath: string; source: string }>;
async function findGitAttributes(
  driverName: string,
  local?: boolean,
): Promise<{ gitAttributesFilepath: string; source: string }>;

async function findGitAttributes(
  driverName: string,
  gitConfigOrLocal?: boolean | GitConfigWithSource,
) {
  const home = os.homedir();
  let local = false;
  let gitConfig: GitConfigWithSource | undefined;
  if (gitConfigOrLocal && typeof gitConfigOrLocal !== 'boolean') {
    gitConfig = gitConfigOrLocal;
  } else {
    local = !!gitConfigOrLocal;
  }

  let gitAttributesFilepath: string | undefined;
  let source: string | undefined;

  if (gitConfig) {
    ({ gitAttributesFilepath, source } =
      getAttributesFilepathFromConfig(gitConfig) ?? {});
    debug(
      'Using core.attributesfile from provided Git config: %s',
      gitAttributesFilepath,
    );
  }

  if (!gitAttributesFilepath) {
    if (local) {
      // read from local Git config
      {
        const localGitConfig = await getGitConfigWithOrigins(true);
        ({ gitAttributesFilepath, source } =
          getAttributesFilepathFromConfig(localGitConfig) ?? {});
        debug(
          'Using core.attributesfile from local Git config: %s',
          gitAttributesFilepath,
        );
      }
      if (!gitAttributesFilepath) {
        // use local fallback
        {
          debug(
            'Using fallback local attributes file; executing command: git rev-parse --git-dir',
          );
          const gitDir = (
            await exec(`git rev-parse --git-dir`, {
              encoding: 'utf8',
            })
          ).stdout.trim();
          gitAttributesFilepath = path.join(gitDir, 'info', 'attributes');
          debug(
            'Using default local git attributes file: %s',
            gitAttributesFilepath,
          );
          ({ source } = await setAttributesFilepath(
            gitAttributesFilepath,
            driverName,
            true,
          ));
        }
      }
    } else {
      // try global Git config
      {
        const globalGitConfig = await getGitConfigWithOrigins();
        ({ gitAttributesFilepath, source } =
          getAttributesFilepathFromConfig(globalGitConfig) ?? {});
        debug(
          'Using core.attributesfile from global Git config: %s',
          gitAttributesFilepath,
        );
      }
      if (!gitAttributesFilepath) {
        // try global fallbacks
        {
          debug(
            'No core.attributesfile found in global config; using fallbacks',
          );
          if (process.env.XDG_CONFIG_HOME) {
            gitAttributesFilepath = path.join(
              process.env.XDG_CONFIG_HOME,
              'git',
              'attributes',
            );
          } else {
            gitAttributesFilepath = path.join(
              home,
              '.config',
              'git',
              'attributes',
            );
          }
          debug('Using git attributes filepath: %s', gitAttributesFilepath);
          ({ source } = await setAttributesFilepath(
            gitAttributesFilepath,
            driverName,
          ));
        }
      }
    }
  }
  return {
    gitAttributesFilepath: gitAttributesFilepath.replace(/^\s*~\//, `${home}/`),
    source,
  };
}

export const install = async (
  driverName: string,
  {
    command: command,
    local = false,
  }: { command?: string; local?: boolean } = {},
): Promise<{ gitAttributesFilepath: string; source?: string }> => {
  const driverCommand =
    command || 'npx package-lock-merge-driver merge %A %O %B %P';
  const { gitAttributesFilepath, source: gitConfigFilepath } =
    await findGitAttributes(driverName, local);
  const opts = local ? '--local' : '--global';
  const gitAttributesDir = path.dirname(gitAttributesFilepath);
  await Promise.all([
    Promise.resolve()
      .then(() => {
        debug(
          'Executing command: git config set %s merge."%s".name "automatically merge npm lockfiles"',
          opts,
          driverName,
        );
        return exec(
          `git config set ${opts} merge."${driverName}".name "automatically merge npm lockfiles"`,
        );
      })
      .then(() =>
        // probably not a great idea to set Git config in parallel
        exec(
          `git config set ${opts} merge."${driverName}".driver "${driverCommand}"`,
        ),
      ),
    fs.mkdir(gitAttributesDir, { recursive: true }).then(() => {
      debug('Created directory: %s', gitAttributesDir);
    }),
    updateGitAttributes(gitAttributesFilepath, driverName).then(() => {
      debug('Updated git attributes file: %s', gitAttributesFilepath);
    }),
  ]);
  return { gitAttributesFilepath, source: gitConfigFilepath };
};

/**
 * Attempt merge and quick resolution of conflicts in `package-lock.json`
 *
 * @param ours
 * @param base
 * @param theirs
 * @param filepath
 * @returns `true` if successful, `false` if not
 */
export const merge = async (
  ours: string,
  base: string,
  theirs: string,
  filepath: string,
): Promise<boolean> => {
  const workspaceRoot = path.resolve(path.dirname(filepath));
  debug('Executing command: git merge-file -p %s %s %s', ours, base, theirs);
  const ret = childProcess.spawnSync(
    'git',
    ['merge-file', '-p', ours, base, theirs],
    {
      stdio: [0, 'pipe', 2],
    },
  );

  const [, workspaces] = await Promise.all([
    fs.writeFile(filepath, ret.stdout).then(() => {
      debug('Wrote merged contents to %s', filepath);
    }),
    getWorkspaces(path.join(workspaceRoot, 'package.json')),
  ]);

  let workspaceNodeModulesDirs: string[] = [];
  if (workspaces.length > 0) {
    workspaceNodeModulesDirs = workspaces.map((glob: string) =>
      path.join(workspaceRoot, glob, 'node_modules'),
    );
  }

  // Perform full resolution - trash all node_modules and reinstall
  const workspaceRootNodeModules = path.join(workspaceRoot, 'node_modules');
  await Promise.all([
    trash(workspaceRootNodeModules)
      .then(() => console.error(`Moved to trash: ${workspaceRootNodeModules}`))
      .catch(() => {
        debug(
          'Failed to trash %s in workspace root; dubious…',
          workspaceRootNodeModules,
        );
      })
      .catch(() => {
        debug(
          'Failed to trash %s; continuing despite trepidation…',
          workspaceRootNodeModules,
        );
      }),
    ...workspaceNodeModulesDirs.map((dir) =>
      trash(dir).then(() => console.error(`Moved to trash: ${dir}`)),
    ),
  ]);

  const fullInstallCommand = `npm install && npm ls`;
  try {
    debug('Executing command: %s', fullInstallCommand);
    await exec(fullInstallCommand, { cwd: workspaceRoot });
    return true;
  } catch {
    return false;
  }
};

const findInstalled = async (
  driverName: string,
  local = false,
): Promise<{
  driverSource?: string;
  gitAttributesFilepath?: string;
  gitConfig: GitConfigWithSource;
}> => {
  let driverSource: string | undefined;
  let gitAttributesFilepath: string | undefined;
  const gitConfig = await getGitConfigWithOrigins(local);
  if (gitConfig[`merge.${driverName}.driver`]?.filepath) {
    driverSource = gitConfig[`merge.${driverName}.driver`]!.filepath;
    if (gitConfig[`merge.${driverName}.created`]?.value) {
      gitAttributesFilepath = gitConfig[`merge.${driverName}.created`]!.value;
      return { driverSource, gitAttributesFilepath, gitConfig };
    }
    return { driverSource, gitConfig };
  }
  return { gitConfig };
};

export const uninstall = async (
  driverName: string,
  local = false,
): Promise<boolean> => {
  let didUninstall = false;
  let gitAttributesFilepath: string | undefined;
  const result = await findInstalled(driverName, local);

  const { driverSource, gitConfig } =
    result ?? ({} as { driverSource?: string; gitConfig: GitConfigWithSource });
  gitAttributesFilepath = result?.gitAttributesFilepath;
  if (!driverSource) {
    console.error(
      `No merge driver named ${driverName} found in ${local ? 'local' : 'global'} Git config; nothing to do`,
    );
    return didUninstall;
  }
  try {
    await exec(
      `git config --file=${driverSource} --remove-section merge."${driverName}"`,
    );
    didUninstall = true;
  } catch (err) {
    if (
      isError(err) &&
      typeof err.message === 'string' &&
      !err.message.match(/no such section/gi)
    ) {
      throw err;
    }
    debug('Removed merge driver from Git config in %s', driverSource);
  }
  let gitAttributes: string[] | undefined;
  /**
   * We will delete the attributes file if a) it is empty after removing our
   * entry, _and_ b) we created it. If `gitAttributesFilepath` is not set, then
   * we did not create it.
   */
  let shouldDeleteAttrs = !!gitAttributesFilepath;
  if (!gitAttributesFilepath) {
    ({ gitAttributesFilepath } = await findGitAttributes(
      driverName,
      gitConfig,
    ));
  }
  try {
    gitAttributes = (await fs.readFile(gitAttributesFilepath, 'utf8')).split(
      '\n',
    );
  } catch (err) {
    if (isErrnoException(err) && err.code !== 'ENOENT') {
      throw err;
    }
    debug('%s does not exist; nothing to uninstall', gitAttributesFilepath);
  }
  if (gitAttributes) {
    const newAttrs = gitAttributes.reduce((acc, attr) => {
      const match = attr.match(/\smerge=(.*)$/i);
      if (!match || (match[1] && match[1].trim() !== driverName)) {
        return acc + attr + '\n';
      }
      return acc;
    }, '');
    if (newAttrs.trim()) {
      shouldDeleteAttrs = false;
    }
    if (shouldDeleteAttrs) {
      try {
        await fs.unlink(gitAttributesFilepath);
        didUninstall = true;
        console.error(
          'Deleted empty git attributes file:',
          gitAttributesFilepath,
        );
      } catch (err) {
        if (isErrnoException(err) && err.code !== 'ENOENT') {
          throw err;
        }
        debug('%s does not exist; nothing to delete', gitAttributesFilepath);
      }
    } else {
      debug('Writing attrs to %s:\n%s', gitAttributesFilepath, newAttrs);
      await fs.writeFile(gitAttributesFilepath, newAttrs);
      didUninstall = true;
    }
  }
  return didUninstall;
};

const getGitConfigWithOrigins = async (
  local = false,
): Promise<GitConfigWithSource> => {
  try {
    debug(
      `Executing command: git config --show-origin --list --includes${
        local ? ' --local' : ' --global'
      }`,
    );
    const result = await exec(
      'git config --show-origin --list --includes' +
        (local ? ' --local' : ' --global'),
    );
    const configs = result.stdout
      .split(/\r?\n/)
      .reduce<GitConfigWithSource>((acc, line) => {
        const match = line.match(/^file:(.+?)\s+(.+?)=(.+)$/);
        if (match && match[1] && match[2] && match[3] !== undefined) {
          acc[match[2]] = {
            filepath: match[1],
            value: match[3],
          };
        }
        return acc;
      }, {});

    debug(
      `Successfully read git ${local ? 'local' : 'global'} Git config with source origins`,
    );
    return configs;
  } catch (error) {
    throw new Error(`Failed to get Git config with origins: ${error}`);
  }
};

type GitConfigWithSource = Record<string, { filepath: string; value: string }>;

export const findLockfile = async (
  startPath = process.cwd(),
): Promise<string> => {
  let currentDir = path.resolve(startPath);

  while (true) {
    const lockfilePath = path.join(currentDir, 'package-lock.json');

    try {
      await fs.access(lockfilePath);
      debug('Found package-lock.json at: %s', lockfilePath);
      return lockfilePath;
    } catch {
      // File doesn't exist, continue searching up the tree
    }

    const parentDir = path.resolve(currentDir, '..');

    // Check if we've reached the filesystem root
    if (parentDir === currentDir) {
      throw new Error(
        `No package-lock.json found from ${startPath} up to filesystem root`,
      );
    }

    currentDir = parentDir;
    debug('Searching for package-lock.json in: %s', currentDir);
  }
};
