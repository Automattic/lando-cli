'use strict';

// Modules
const _ = require('lodash');
const fs = require('fs');
const os = require('os');
const path = require('path');
const shell = require('shelljs');

/*
 * Helper to get an executable
 */
const getDockerBin = (bin, base) => {
  // Do platform appropriate things to get started
  const join = (process.platform === 'win32') ? path.win32.join : path.posix.join;
  let binPath = (process.platform === 'win32') ? join(base, `${bin}.exe`) : join(base, bin);

  // Use PATH compose executable on posix if ours does not exist
  if (!fs.existsSync(binPath) || fs.statSync(binPath).isDirectory()) {
    binPath = _.toString(shell.which(bin));
  }

  // If the binpath still does not exist then we should set to false and handle downstream
  if (!fs.existsSync(binPath)) return false;
  // Otherwise return a normalized binpath
  switch (process.platform) {
    case 'darwin': return path.posix.normalize(binPath);
    case 'linux': return path.posix.normalize(binPath);
    case 'win32': return path.win32.normalize(binPath);
  }
};

/*
 * Helper to get location of docker bin directory
 */
exports.getDockerBinPath = () => {
  switch (process.platform) {
    case 'darwin':
    case 'linux':
      return '/usr/bin';
    case 'win32':
      const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles;
      const programData = process.env.ProgramData;
      const possiblePaths = [
        programData + '\\DockerDesktop\\version-bin',
        programFiles + '\\Docker\\Docker\\resources\\bin',
        process.env.SystemRoot + '\\System32',
      ];

      if (process.env.ChocolateyInstall) {
        possiblePaths.push(process.env.ChocolateyInstall + '\\bin');
      }

      for (const dir of possiblePaths) {
        if (fs.existsSync(path.win32.join(dir, 'docker.exe'))) {
          return dir;
        }
      }
  }

  return false;
};

/*
 * Helper to get location of docker bin directory
 */
exports.getDockerComposeBinPath = () => {
  switch (process.platform) {
    case 'darwin':
    case 'linux':
      return exports.getDockerBinPath();
    case 'win32':
      const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles;
      const possiblePaths = [
        programFiles + '\\Docker\\Docker\\resources\\bin',
        process.env.SystemRoot + '\\System32',
      ];

      if (process.env.ChocolateyInstall) {
        possiblePaths.push(process.env.ChocolateyInstall + '\\bin');
      }

      for (const dir of possiblePaths) {
        if (fs.existsSync(path.win32.join(dir, 'docker-compose.exe'))) {
          return dir;
        }
      }
  }
};

/*
 * Get docker compose binary path
 */
exports.getComposeExecutable = () => {
  switch (process.platform) {
    case 'darwin':
    case 'linux':
    case 'win32':
      return getDockerBin('docker-compose', exports.getDockerComposeBinPath());
  }
};

/*
 * This should only be needed for linux
 */
exports.getDockerExecutable = () => {
  const base = exports.getDockerBinPath();
  return getDockerBin('docker', base);
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
      return process.env.HOME
        || (process.env.HOMEDRIVE && process.env.HOMEPATH && path.join(process.env.HOMEDRIVE, process.env.HOMEPATH))
        || process.env.USERPROFILE
        || windowsHome()
        || os.homedir()
        || os.tmpdir();
  }
};

/*
 * Get oclif base dir based on platform
 */
const getOClifBase= product => {
  const base = process.env['XDG_CACHE_HOME']
    || (process.platform === 'win32' && process.env.LOCALAPPDATA)
    || path.join(getOClifHome(), '.cache');
  return path.join(base, product);
};

const macosCacheDir = product => {
  return process.platform === 'darwin' ? path.join(getOClifHome(), 'Library', 'Caches', product) : undefined;
};

/*
 * This should only be needed for linux
 */
exports.getOclifCacheDir = product => {
  return process.env[`${product.toUpperCase()}_CACHE_DIR`]
    || macosCacheDir(product)
    || getOClifBase(product);
};
