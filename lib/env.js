'use strict';

// Modules
const fs = require('fs');
const os = require('os');
const path = require('path');
const shell = require('shelljs');

const findFileInPath = (file, paths) => {
  const join = (process.platform === 'win32') ? path.win32.join : path.posix.join;
  const normalize = (process.platform === 'win32') ? path.win32.normalize : path.posix.normalize;
  for (const dir of paths) {
    const fullname = join(dir, file);
    try {
      const stat = fs.statSync(fullname, {throwIfNoEntry: false});
      if (stat?.isFile()) {
        return normalize(fullname);
      }
    } catch (err) {
      // Ignore - mockfs does not respect throwIfNoEntry
    }
  }

  const possiblePath = shell.which(file);
  return (possiblePath !== null) ? normalize(possiblePath.toString()) : false;
};

/*
 * Helper to get location of docker bin directory
 */
exports.getDockerBinPath = (fresh = false) => {
  const dirname = (process.platform === 'win32') ? path.win32.dirname : path.posix.dirname;
  const fullPath = exports.getDockerExecutable(fresh);
  return fullPath ? dirname(fullPath) : false;
};

/*
 * Helper to get location of docker bin directory
 */
exports.getDockerComposeBinPath = (fresh = false) => {
  const dirname = (process.platform === 'win32') ? path.win32.dirname : path.posix.dirname;
  const fullPath = exports.getComposeExecutable(fresh);
  return fullPath ? dirname(fullPath) : false;
};

let cachedComposeExecutable;

/*
 * Get docker compose binary path
 */
exports.getComposeExecutable = (fresh = false) => {
  if (cachedComposeExecutable && !fresh) {
    return cachedComposeExecutable;
  }

  const possiblePaths = [];
  let binary;
  switch (process.platform) {
    case 'darwin':
      possiblePaths.push('/Applications/Docker.app/Contents/Resources/bin');
      possiblePaths.push('/opt/homebrew/bin');
      // fallthrough
    case 'linux':
      binary = 'docker-compose';
      possiblePaths.push('/usr/local/bin', '/usr/bin');
      break;
    case 'win32': {
      binary = 'docker-compose.exe';
      const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles;
      possiblePaths.push(
          programFiles + '\\Docker\\Docker\\resources\\bin',
          process.env.SystemRoot + '\\System32',
      );

      if (process.env.ChocolateyInstall) {
        possiblePaths.push(process.env.ChocolateyInstall + '\\bin');
      }
    }
  }

  cachedComposeExecutable = findFileInPath(binary, possiblePaths);
  return cachedComposeExecutable;
};

let cachedDockerExecutable;

exports.getDockerExecutable = (fresh = false) => {
  if (cachedDockerExecutable && !fresh) {
    return cachedDockerExecutable;
  }

  const possiblePaths = [];
  let binary;
  switch (process.platform) {
    case 'darwin':
      possiblePaths.push('/Applications/Docker.app/Contents/Resources/bin');
      possiblePaths.push('/opt/homebrew/bin');
      // fallthrough
    case 'linux':
      binary = 'docker';
      possiblePaths.push('/usr/local/bin', '/usr/bin');
      break;
    case 'win32': {
      binary = 'docker.exe';
      const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles;
      const programData = process.env.ProgramData;
      if (programData) {
        possiblePaths.push(programData + '\\DockerDesktop\\version-bin');
      }

      possiblePaths.push(
          programFiles + '\\Docker\\Docker\\resources\\bin',
          process.env.SystemRoot + '\\System32',
      );

      if (process.env.ChocolateyInstall) {
        possiblePaths.push(process.env.ChocolateyInstall + '\\bin');
      }
    }
  }

  cachedDockerExecutable = findFileInPath(binary, possiblePaths);
  return cachedDockerExecutable;
};

/*
 * Get oclif home dir based on platform
 */
const getOClifHome = () => {
  switch (process.platform) {
    case 'darwin':
    case 'linux':
      return process.env.HOME || os.homedir() || os.tmpdir();
    case 'win32':
      return process.env.HOME ||
        (process.env.HOMEDRIVE && process.env.HOMEPATH && path.join(process.env.HOMEDRIVE, process.env.HOMEPATH)) ||
        process.env.USERPROFILE ||
        os.homedir() ||
        os.tmpdir();
  }
};

/*
 * Get oclif base dir based on platform
 */
const getOClifBase= product => {
  const base = process.env['XDG_CACHE_HOME'] ||
    (process.platform === 'win32' && process.env.LOCALAPPDATA) ||
    path.join(getOClifHome(), '.cache');
  return path.join(base, product);
};

const macosCacheDir = product => {
  return process.platform === 'darwin' ? path.join(getOClifHome(), 'Library', 'Caches', product) : undefined;
};

/*
 * This should only be needed for linux
 */
exports.getOclifCacheDir = product => {
  return process.env[`${product.toUpperCase()}_CACHE_DIR`] ||
    macosCacheDir(product) ||
    getOClifBase(product);
};
