'use strict';

// Modules
const _ = require('lodash');
const formatters = require('./formatters');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Global options
const globalOptions = {
  channel: {
    describe: 'Sets the update channel',
    choices: ['edge', 'none', 'stable'],
    global: true,
    type: 'array',
  },
  clear: {
    describe: 'Clears the lando tasks cache',
    global: true,
    type: 'boolean',
  },
  help: {
    describe: 'Shows lando or delegated command help if applicable',
    type: 'boolean',
  },
  lando: {
    hidden: true,
    type: 'boolean',
  },
  verbose: {
    alias: 'v',
    describe: 'Runs with extra verbosity',
    type: 'count',
  },
};

/*
 * Construct the CLI
 */
module.exports = class Cli {
  constructor(prefix = 'LANDO', logLevel = 'warn', userConfRoot = path.join(os.homedir(), '.lando')) {
    this.prefix = prefix;
    this.logLevel = logLevel;
    this.userConfRoot = userConfRoot;
  }

  /**
   * Returns a parsed array of CLI arguments and options
   * @since 3.0.0
   * @alias lando.cli.argv
   * @returns {object} Yarg parsed options
   * @example
   * const argv = lando.cli.argv();
   * @todo make this static and then fix all call sites
   */
  argv() {
    return require('yargs').help(false).version(false).argv;
  }

  /**
   * Checks to see if lando is running with sudo. If it is it
   * will exit the process with a stern warning
   * @since 3.0.0
   * @alias lando.cli.checkPerms
   * @example
   * lando.cli.checkPerms()
   */
  checkPerms() {
    /* Do nothing */
  }

  /*
   * Toggle the secret toggle
   */
  clearTaskCaches() {
    if (fs.existsSync(process.landoTaskCacheFile)) fs.unlinkSync(process.landoTaskCacheFile);
    if (fs.existsSync(process.landoAppTaskCacheFile)) fs.unlinkSync(process.landoAppTaskCacheFile);
  }

  /*
   * Confirm question
   */
  confirm(message = 'Are you sure?') {
    return {
      describe: 'Auto answer yes to prompts',
      alias: ['y'],
      default: false,
      boolean: true,
      interactive: {
        type: 'confirm',
        default: false,
        message: message,
      },
    };
  }

  /**
   * Returns a config object with some good default settings for bootstrapping
   * lando as a command line interface
   * @since 3.5.0
   * @alias lando.cli.defaultConfig
   * @param {object} [appConfig] Optional raw landofile
   * @returns {object} Config that can be used in a Lando CLI bootstrap
   * @example
   * const config = lando.cli.defaultConfig();
   * // Kick off our bootstrap
   * bootstrap(config).then(lando => console.log(lando));
   */
  defaultConfig(appConfig = {}) {
    const srcRoot = path.resolve(__dirname, '..');
    const version = require(path.join(__dirname, '..', 'package.json')).version;

    return {
      alliance: fs.existsSync(path.join(this.userConfRoot, 'secret-toggle')),
      channel: 'stable',
      configSources: [path.join(srcRoot, 'config.yml'), path.join(this.userConfRoot, 'config.yml')],
      command: this.argv(),
      domain: 'lndo.site',
      experimental: false,
      envPrefix: this.prefix,
      landoFile: '.lando.yml',
      landoFileConfig: appConfig,
      leia: _.has(process, 'env.LEIA_PARSER_RUNNING'),
      logLevelConsole: (this.argv().verbose) ? this.argv().verbose + 1 : this.logLevel,
      logDir: path.join(this.userConfRoot, 'logs'),
      mode: 'cli',
      packaged: _.has(process, 'pkg'),
      pluginDirs: [
        srcRoot,
        {path: path.join(srcRoot, 'integrations'), subdir: '.'},
        {path: path.join(srcRoot, 'node_modules', '@lando'), subdir: '.', namespace: '@lando'},
        {path: path.join(this.userConfRoot, 'global-plugins', '@lando'), subdir: '.', namespace: '@lando'},
        {path: path.join(this.userConfRoot, 'plugins', '@lando'), subdir: '.', namespace: '@lando'},
        this.userConfRoot,
      ],
      preLandoFiles: ['.lando.base.yml', '.lando.dist.yml', '.lando.recipe.yml', '.lando.upstream.yml'],
      postLandoFiles: ['.lando.local.yml', '.lando.user.yml'],
      product: 'lando',
      userConfRoot: this.userConfRoot,
      userAgent: `Lando/${version}`,
      version,
    };
  }

  /*
   * Format data
   */
  formatData(data, {path = '', format = 'default', filter = []} = {}, opts = {}) {
    return formatters.formatData(data, {path, format, filter}, opts);
  }

  /*
   * FormatOptios
   */
  formatOptions(omit = []) {
    return formatters.formatOptions(omit);
  }

  /**
   * Cli wrapper for error handler
   * @since 3.0.0
   * @alias lando.cli.handleError
   * @param {Error} error The error
   * @param {import('./error')} handler The error handler function
   * @param {number} verbose [verbose=this.argv().verbose] The verbosity level
   * @param {object} lando The Lando object
   * @returns {Promise<never>}
   */
  handleError(error, handler, verbose = this.argv().verbose, lando = {}) {
    // Set the verbosity
    error.verbose = verbose;
    // Report error if user has error reporting on
    return handler.handle(error).then(code => process.exit(code));
  }

  /*
   * Init
   */
  init(yargs, tasks, config, userConfig) {
    // Define usage
    const cmd = !_.has(process, 'pkg') ? '$0' : path.basename(_.get(process, 'execPath', 'lando'));
    const usage = [`Usage: ${cmd} <command> [args] [options]`];

    // Yargs!
    yargs.usage(usage.join(' '))
        .demandCommand(1, 'You need at least one command before moving on')
        .example('lando start', 'Run lando start')
        .example('lando rebuild --help', 'Get help about using the lando rebuild command')
        .example('lando destroy -y -vvv', 'Run lando destroy non-interactively and with maximum verbosity')
        .example('lando --clear', 'Clear the lando tasks cache')
        .middleware([(argv => {
          argv._app = config;
        })])
        .recommendCommands()
        .wrap(yargs.terminalWidth() * 0.70)
        .option('channel', globalOptions.channel)
        .option('clear', globalOptions.clear)
        .help(false)
        .option('lando', globalOptions.lando)
        .option('help', globalOptions.help)
        .option('verbose', globalOptions.verbose)
        .version(false);

    // Loop through the tasks and add them to the CLI
    _.forEach(_.sortBy(tasks, 'command'), task => {
      if (_.has(task, 'handler')) yargs.command(task);
      else yargs.command(this.parseToYargs(task, config));
    });

    // Show help unless this is a delegation command
    const current = _.find(tasks, {command: yargs.argv._[0]});
    if ((yargs.argv.help || yargs.argv.lando) && _.get(current, 'delegate', false) === false) {
      yargs.showHelp('log');
      process.exit(0);
    }

    // YARGZ MATEY
    yargs.argv;
  }


  /**
   * Returns some cli "art"
   * @since 3.0.0
   * @alias lando.cli.makeArt
   * @param {string} [func] The art func you want to call
   * @param {object} [opts] Func options
   * @returns {string} Usually a printable string
   */
  makeArt(func, opts) {
    return require('./art')[func](opts);
  }

  /**
   * Parses a lando task object into something that can be used by the [yargs](http://yargs.js.org/docs/) CLI.
   *
   * A lando task object is an abstraction on top of yargs that also contains some
   * metadata about how to interactively ask questions on both a CLI and GUI.
   * @since 3.5.0
   * @alias lando.cli.parseToYargs
   * @see [yargs docs](http://yargs.js.org/docs/)
   * @see [inquirer docs](https://github.com/sboudrias/Inquirer.js)
   * @param {object} task A Lando task object (@see add for definition)
   * @param task.command
   * @param task.describe
   * @param task.options
   * @param task.run
   * @param task.level
   * @param {object} [config] The landofile
   * @returns {object} A yargs command object
   * @example
   * // Add a task to the yargs CLI
   * yargs.command(lando.tasks.parseToYargs(task));
   */
  parseToYargs({command, describe, options = {}, run = {}, level = 'app'}, config = {}) {
    const handler = argv => {
      // Immediately build some arg data set opts and interactive options
      const data = {options: argv, inquiry: formatters.getInteractive(options, argv)};

      // Summon lando
      const Lando = require('./../lib/lando');
      const lando = new Lando(this.defaultConfig(config));

      // Handle uncaught things
      _.forEach(['unhandledRejection', 'uncaughtException'], exception => {
        process.on(exception, error => this.handleError(error, lando.error, this.argv().verbose, lando));
      });

      // Check for updates and get things started
      return lando.bootstrap(level).then(lando => {
        return lando.Promise.try(() => {
          // If this bootstrap level requires the engine lets do some dependency checks
          if (lando.BOOTSTRAP_LEVELS[level] >= 3) {
            // Throw NO DOCKER error
            lando.log.verbose('docker-engine exists: %s', lando.engine.dockerInstalled);
            if (lando.engine.dockerInstalled === false) {
              console.error(this.makeArt('noDockerDep'));
              throw Error('docker could not be located!');
            }
            // Throw NO DOCKER COMPOSE error
            lando.log.verbose('docker-compose exists: %s', lando.engine.composeInstalled);
            if (lando.engine.composeInstalled === false) {
              console.error(this.makeArt('noDockerDep', 'docker-compose'));
              throw Error('docker-compose could not be located!');
            }
          }
        })
        /**
         * Event that allows altering of argv or inquirer before interactive prompts
         * are run
         *
         * You will want to replace CMD with the actual task name eg `task-start-answers`.
         * @since 3.0.0
         * @event task_CMD_answers
         * @property {object} answers argv and inquirer questions
         */
            .then(() => lando.events.emit('cli-answers', data, argv._[0]))
            .then(() => lando.events.emit(`cli-${argv._[0]}-answers`, data, argv._[0]))

        // Attempt to filter out questions that have already been answered
        // Prompt the use for feedback if needed and sort by weight
            .then(() => formatters.handleInteractive(data.inquiry, data.options, command, lando))

        /**
         * Event that allows final altering of answers before the task runs
         *
         * You will want to replace CMD with the actual task name eg `task-start-run`.
         * @since 3.0.0
         * @event task_CMD_run
         * @property {object} answers object
         */
            .then(answers => lando.events.emit('cli-run', _.merge(data.options, answers), argv._[0]))
            .then(() => lando.events.emit(`cli-${argv._[0]}-run`, data, argv._[0]))

        // Find and run the task, unless we already have one
        // @TODO: somehow handle when commands break eg change task name, malformed tasks
            .then(() => {
              if (_.isFunction(run)) return run(data.options, lando);
              else return _.find(lando.tasks, {command}).run(data.options);
            })

        // Add a final event for other stuff
            .then(() => lando.events.emit('before-end'))

        // Handle all other errors eg likely things that happen pre bootstrap
            .catch(error => this.handleError(error, lando.error, this.argv().verbose, lando))
        // If we caught an error that resulted in an error code lets make sure we exit non0
            .finally(() => process.exit(_.get(lando, 'exitCode', 0)));
      });
    };

    // Return our yarg command
    return {command, describe, builder: formatters.sortOptions(options), handler};
  }

  /*
   * Run the CLI
   */
  run(tasks = [], config = {}) {
    const yargs = require('yargs');
    const {clear} = yargs.argv;

    // Handle all our configuration global opts first
    const userConfig = this.updateUserConfig();
    if (clear) console.log('Lando has cleared the tasks cache!');
    if (clear) {
      this.clearTaskCaches();
      process.exit(0);
    }

    // Initialize
    this.init(yargs, tasks, config, userConfig);
  }

  /*
   * Toggle a toggle
   */
  updateUserConfig(data = {}) {
    const Yaml = require('./yaml');
    const yaml = new Yaml();
    const configFile = path.join(this.defaultConfig().userConfRoot, 'config.yml');
    const config = (fs.existsSync(configFile)) ? yaml.load(configFile) : {};
    const file = yaml.dump(configFile, _.assign({}, config, data));
    return yaml.load(file);
  }
};
