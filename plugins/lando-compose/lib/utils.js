'use strict';

// Modules
const _ = require('lodash');
const path = require('path');

/*
 * Helper method to get the host part of a volume
 */
exports.getHostPath = mount => _.dropRight(mount.split(':')).join(':');

/*
 * Helper method to normalize a path so that Lando overrides can be used as though
 * the docker-compose files were in the app root.
 */
exports.normalizePath = (local, base = '.', excludes = []) => {
  // Return local if it starts with $ or ~
  if (_.startsWith(local, '$') || _.startsWith(local, '~')) return local;
  // Return local if it is one of the excludes
  if (_.includes(excludes, local)) return local;
  // Return local if local is an absolute path
  if (path.isAbsolute(local)) return local;
  // Otherwise this is a relaive path so return local resolved by base
  return path.resolve(path.join(base, local));
};

/*
 * Helper to normalize overrides
 */
exports.normalizeOverrides = (overrides, base = '.', volumes = {}) => {
  // Normalize any build paths
  if (_.has(overrides, 'build')) {
    if (_.isObject(overrides.build) && _.has(overrides, 'build.context')) {
      overrides.build.context = exports.normalizePath(overrides.build.context, base);
    } else {
      overrides.build = exports.normalizePath(overrides.build, base);
    }
  }
  // Normalize any volumes
  if (_.has(overrides, 'volumes')) {
    overrides.volumes = _.map(overrides.volumes, volume => {
      if (!_.includes(volume, ':')) {
        return volume;
      } else {
        const local = exports.getHostPath(volume);
        const remote = _.last(volume.split(':'));
        // @TODO: I don't think below does anything?
        const excludes = _.keys(volumes).concat(_.keys(volumes));
        const host = exports.normalizePath(local, base, excludes);
        return [host, remote].join(':');
      }
    });
  }

  if (overrides.env_file) {
    if (Array.isArray(overrides.env_file)) {
      overrides.env_file = overrides.env_file.map(entry => {
        if (typeof entry === 'string') {
          return exports.normalizePath(entry, base);
        }

        if (typeof entry === 'object' && typeof entry.path === 'string') {
          return {
            ...entry,
            path: exports.normalizePath(entry.path, base),
          };
        }

        return entry;
      });
    } else {
      overrides.env_file = exports.normalizePath(overrides.env_file, base);
    }
  }

  return overrides;
};
