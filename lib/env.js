'use strict';

// Modules
const fs = require('fs');
const path = require('path');
const shell = require('shelljs');

/**
 * Searches known directories and the current PATH for an executable.
 * @param {string} file Executable filename.
 * @param {string[]} paths Directories to inspect before PATH lookup.
 * @returns {string|false} Absolute executable path or false.
 */
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
    } catch {
      // Ignore - mockfs does not respect throwIfNoEntry
    }
  }

  const possiblePath = shell.which(file);
  return (possiblePath !== null) ? normalize(possiblePath.toString()) : false;
};

/**
 * Gets the directory that contains the docker executable.
 * @param {boolean} [fresh] Whether to bypass the cached executable path.
 * @returns {string|false} Directory path or false.
 */
exports.getDockerBinPath = (fresh = false) => {
  const dirname = (process.platform === 'win32') ? path.win32.dirname : path.posix.dirname;
  const fullPath = exports.getDockerExecutable(fresh);
  return fullPath ? dirname(fullPath) : false;
};

/**
 * Gets the directory that contains the docker compose executable.
 * @param {boolean} [fresh] Whether to bypass the cached executable path.
 * @returns {string|false} Directory path or false.
 */
exports.getDockerComposeBinPath = (fresh = false) => {
  const dirname = (process.platform === 'win32') ? path.win32.dirname : path.posix.dirname;
  const fullPath = exports.getComposeExecutable(fresh);
  return fullPath ? dirname(fullPath) : false;
};

/** @type {string|false|undefined} */
let cachedComposeExecutable;

/**
 * Locates the docker compose executable for the current platform.
 * @param {boolean} [fresh] Whether to bypass the cached executable path.
 * @returns {string|false} Absolute executable path or false.
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

/** @type {string|false|undefined} */
let cachedDockerExecutable;

/**
 * Locates the docker executable for the current platform.
 * @param {boolean} [fresh] Whether to bypass the cached executable path.
 * @returns {string|false} Absolute executable path or false.
 */
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

