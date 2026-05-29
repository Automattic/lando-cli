'use strict';

// Modules
const _ = require('lodash');
const path = require('path');

// Default DB cli commands
const mysqlCli = {
  service: ':host',
  description: 'Drops into a MySQL shell on a database service',
  cmd: 'mysql -uroot',
  options: {
    host: {
      description: 'The database service to use',
      default: 'database',
      alias: ['h'],
    },
  },
};
const postgresCli = {
  service: ':host',
  description: 'Drops into a psql shell on a database service',
  cmd: 'psql -Upostgres',
  user: 'root',
  options: {
    host: {
      description: 'The database service to use',
      default: 'database',
      alias: ['h'],
    },
  },
};

/**
 * Builds the release URL for a Drush phar.
 * @param {string} version Drush version.
 * @returns {string} Download URL.
 */
const getDrushUrl = version => `https://github.com/drush-ops/drush/releases/download/${version}/drush.phar`;

/**
 * Returns default database tooling for a recipe's database service.
 * @param {string} database Database type, optionally including a version.
 * @returns {object|undefined} Tooling config keyed by command name.
 */
exports.getDbTooling = database => {
  // Make sure we strip out any version number
  database = database.split(':')[0];
  // Choose wisely
  if (_.includes(['mysql', 'mariadb'], database)) {
    return {mysql: mysqlCli};
  } else if (database === 'postgres') {
    return {psql: postgresCli};
  } else if (database === 'mongo') {
    return {mongo: {
      service: 'database',
      description: 'Drop into the mongo shell',
    }};
  }
};

/**
 * Builds the Drush phar installation command.
 * @param {string} version Drush version.
 * @param {string|string[]} status Verification command or commands.
 * @returns {string} Installation command chain.
 */
exports.getDrush = (version, status) => exports.getPhar(
    getDrushUrl(version),
    '/tmp/drush.phar',
    '/usr/local/bin/drush',
    status,
);

/**
 * Builds a command chain that downloads, installs, and verifies a phar binary.
 * @param {string} url Download URL.
 * @param {string} src Temporary download path.
 * @param {string} dest Final install path.
 * @param {string|string[]} [check] Verification command or commands.
 * @returns {string} Installation command chain.
 */
exports.getPhar = (url, src, dest, check = 'true') => {
  // Arrayify the check if needed
  if (_.isString(check)) check = [check];
  // Phar install command
  const pharInstall = [
    ['curl', url, '-LsS', '-o', src],
    ['chmod', '+x', src],
    ['mv', src, dest],
    check,
  ];
  // Return
  return _.map(pharInstall, cmd => cmd.join(' ')).join(' && ');
};

/**
 * Collects relevant service config file paths from recipe options.
 * @param {object} options Recipe options.
 * @param {string[]} [types] Config sections to inspect.
 * @returns {object} Service config keyed by type.
 */
exports.getServiceConfig = (options, types = ['php', 'server', 'vhosts']) => {
  const config = {};
  _.forEach(types, type => {
    if (_.has(options, `config.${type}`)) {
      config[type] = options.config[type];
    } else if (!_.has(options, `config.${type}`) && _.has(options, `defaultFiles.${type}`)) {
      if (_.has(options, 'confDest')) {
        config[type] = path.join(options.confDest, options.defaultFiles[type]);
      }
    }
  });
  return config;
};

/**
 * Expands recipe config into the normalized object used by the factory.
 * @param {string} recipe Recipe name.
 * @param {import('../../../lib/app')} app App instance.
 * @returns {object} Normalized recipe config.
 */
exports.parseConfig = (recipe, app) => _.merge({}, _.get(app, 'config.config', {}), {
  _app: app,
  app: app.name,
  confDest: path.join(app._config.userConfRoot, 'config', recipe),
  home: app._config.home,
  project: app.project,
  recipe,
  root: app.root,
  userConfRoot: app._config.userConfRoot,
});
