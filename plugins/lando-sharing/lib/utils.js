'use strict';

// Modules
const _ = require('lodash');
const path = require('path');
const toObject = require('./../../../lib/utils').toObject;

/**
 * Builds a deterministic named volume id for an excluded path.
 * @param {string} exclude Relative exclude path.
 * @returns {string} Named volume id.
 */
const getNamedVolumeName = exclude => 'exclude_' + path
    .normalize(exclude).replace(/\W/g, '').split(path.sep).join('_');

/**
 * Maps excluded paths to their generated named volume ids.
 * @param {string[]} [excludes] Excluded relative paths.
 * @returns {string[]} Named volume ids.
 */
const getNamedVolumeNames = (excludes = []) => _(excludes)
    .map(exclude => getNamedVolumeName(exclude))
    .value();

/**
 * Builds named volume definitions for excluded paths.
 * @param {string[]} [excludes] Excluded relative paths.
 * @returns {object} Named volume definitions.
 */
exports.getNamedVolumes = (excludes = []) => _(excludes)
    .thru(excludes => toObject(getNamedVolumeNames(excludes)))
    .value();

/**
 * Builds service volume mappings for excluded paths.
 * @param {string[]} [excludes] Excluded relative paths.
 * @param {string} [base] Base mount directory.
 * @returns {string[]} Service volume mappings.
 */
exports.getServiceVolumes = (excludes = [], base = '/tmp') => _(excludes)
    .map(exclude => ({mount: getNamedVolumeName(exclude), path: path.posix.join(base, exclude)}))
    .map(exclude => `${exclude.mount}:${exclude.path}`)
    .value();

/**
 * Builds bind mounts for directories that should be included directly.
 * @param {string[]} [excludes] Included directory names.
 * @param {string} [base] Host base directory.
 * @param {string} [mount] Docker mount mode.
 * @returns {string[]} Bind mount definitions.
 */
exports.getIncludeVolumes = (excludes = [], base = '/app', mount = 'cached') => _(excludes)
    .map(exclude => `${base}/${exclude}:/app/${exclude}:${mount}`)
    .value();

