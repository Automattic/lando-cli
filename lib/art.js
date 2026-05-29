'use strict';

// Modules
const _ = require('lodash');
const chalk = require('chalk');
const os = require('os');

/**
 * Warning payload used by start and rebuild status messages.
 * @typedef {object} ArtWarning
 * @property {string} title Warning title.
 * @property {string[]} [detail] Additional warning detail lines.
 * @property {string} [command] Suggested command to run.
 * @property {string} [url] Optional help URL.
 */

/**
 * Stylizes code or shell commands in terminal output.
 * @param {string} text Text to stylize.
 * @returns {string} Styled text.
 */
const codeMe = text => chalk.italic(text);

/**
 * Stylizes app names and emphasis text.
 * @param {string} name Text to stylize.
 * @returns {string} Styled text.
 */
const italicize = name => chalk.italic(name);

/**
 * Formats a warning block for terminal output.
 * @param {ArtWarning} [warning] Warning payload.
 * @returns {string} Formatted warning block.
 */
const warningMessage = ({title, detail = [], command = '', url = ''} = {}) => `
 ${chalk.yellow(`■ ${title}`)}
   ${detail.join(`${os.EOL}   `)}
   ${(url) ? chalk.green(url) : codeMe(command)}
`;

/**
 * Builds destroy lifecycle messaging.
 * @param {object} [options] Destroy message options.
 * @param {string} [options.name] App name.
 * @param {'abort'|'pre'|'post'} [options.phase] Lifecycle phase.
 * @returns {string|undefined} Rendered message for the selected phase.
 */
exports.appDestroy = ({name, phase = 'pre'} = {}) => {
  switch (phase) {
    case 'abort':
      return chalk.yellow('DESTRUCTION AVERTED!');
    case 'pre':
      return chalk.cyan(`Preparing to consign ${italicize(name)} to the dustbin of history...`);
    case 'post':
      return [
        chalk.red(`The app known as ${italicize(name)} has paid the ${chalk.bold('IRON PRICE')}. App destroyed!`),
      ].join(os.EOL);
  }
};

/**
 * Builds rebuild lifecycle messaging.
 * @param {object} [options] Rebuild message options.
 * @param {string} [options.name] App name.
 * @param {'abort'|'error'|'pre'|'post'|'report'} [options.phase] Lifecycle phase.
 * @param {ArtWarning[]|object[]} [options.warnings] Collected warnings.
 * @returns {string|undefined} Rendered message for the selected phase.
 */
exports.appRebuild = ({name, phase = 'pre', warnings = {}} = {}) => {
  switch (phase) {
    case 'abort':
      return chalk.yellow('REBUILD ABORTED!');
    case 'error':
      return exports.appStart({name, phase: 'error', warnings});
    case 'pre':
      return chalk.cyan('Rising anew like a fire phoenix from the ashes! Rebuilding app...');
    case 'post':
      return exports.appStart({name, phase: 'post'});
    case 'report':
      return exports.appStart({name, phase: 'report', warnings});
  }
};

/**
 * Builds restart lifecycle messaging.
 * @param {object} [options] Restart message options.
 * @param {string} [options.name] App name.
 * @param {'error'|'pre'|'post'|'report'} [options.phase] Lifecycle phase.
 * @param {ArtWarning[]|object[]} [options.warnings] Collected warnings.
 * @returns {string|undefined} Rendered message for the selected phase.
 */
exports.appRestart = ({name, phase = 'pre', warnings = {}} = {}) => {
  switch (phase) {
    case 'error':
      return exports.appStart({name, phase: 'error', warnings});
    case 'pre':
      return chalk.cyan('Stopping and restarting your app...Shiny!');
    case 'post':
      return exports.appStart({name, phase: 'post'});
    case 'report':
      return exports.appStart({name, phase: 'report', warnings});
  }
};

/**
 * Builds start lifecycle messaging.
 * @param {object} [options] Start message options.
 * @param {string} [options.name] App name.
 * @param {'error'|'pre'|'post'|'report'} [options.phase] Lifecycle phase.
 * @param {ArtWarning[]|object[]} [options.warnings] Collected warnings.
 * @returns {string|undefined} Rendered message for the selected phase.
 */
exports.appStart = ({name, phase = 'pre', warnings = {}} = {}) => {
  switch (phase) {
    case 'error':
      return [
        '',
        chalk.red('Uh oh!'),
        '',
        'An error occurred while starting up your app!',
        'Here are a few things you can try to get back into a good state:',
        '',
        chalk.yellow(`  ■ Try running ${codeMe('lando rebuild')}`),
        chalk.yellow(`  ■ Try restarting in debug mode ${codeMe('lando restart -vvv')}`),
        chalk.yellow(`  ■ Try checking the logs with ${codeMe('lando logs')}`),
        '',
        'If those fail then consult the troubleshooting materials:',
        '',
        chalk.magenta('  ■ https://docs.lando.dev/help/logs.html'),
        chalk.magenta('  ■ https://docs.lando.dev/help/updating.html'),
        '',
        'Or post your issue to Slack or GitHub',
        '',
        chalk.green('  ■ Slack - https://launchpass.com/devwithlando'),
        chalk.green('  ■ GitHub - https://github.com/lando/lando/issues/new/choose'),
        '',
      ].join(os.EOL);
    case 'pre':
      return chalk.cyan(`Let's get this party started! Starting app ${italicize(name)}...`);
    case 'post':
      return [
        '',
        chalk.magenta('Boomshakalaka!!!'),
        '',
        'Your app has started up correctly.',
        'Here are some vitals:',
        '',
      ].join(os.EOL);
    case 'report': {
      const message = [
        '',
        chalk.yellow('Warning!'),
        '',
        'Your app started up but we detected some things you may wish to investigate.',
        `These only ${italicize('may')} be a problem.`,
        '',
      ];

      // Add in all our warnings
      _.forEach(warnings, warning => {
        message.push(warningMessage(warning));
      });

      message.push('');
      message.push('Here are some vitals:');
      message.push('');
      return message.join(os.EOL);
    }
  }
};

/**
 * Builds stop lifecycle messaging.
 * @param {object} [options] Stop message options.
 * @param {string} [options.name] App name.
 * @param {'pre'|'post'} [options.phase] Lifecycle phase.
 * @returns {string|undefined} Rendered message for the selected phase.
 */
exports.appStop = ({name, phase = 'pre'} = {}) => {
  switch (phase) {
    case 'pre':
      return chalk.cyan(`This party's over :( Stopping app ${italicize(name)}`);
    case 'post':
      return chalk.red(`App ${italicize(name)} has been stopped!`);
  }
};

/**
 * Builds the crash reporting prompt.
 * @returns {string} Crash prompt.
 */
exports.crash = () => [
  '',
  chalk.red('CRASH!!!'),
  '',
  'Would you like to report it, and subsequent crashes, to Lando?',
  '',
  'This data is only used by the Lando team to ensure the application runs as well as it can.',
  chalk.green('For more details check out https://docs.lando.dev/privacy/'),
].join(os.EOL);

/**
 * Builds the initialization success banner.
 * @returns {string} Initialization banner.
 */
exports.init = () => [
  '',
  chalk.green('Now we\'re'),
  chalk.magenta('COOKING WITH FIRE!'),
  'Your app has been initialized!',
  '',
  `Go to the directory where your app was initialized and run ${codeMe('lando start')} to get rolling.`,
  'Check the LOCATION printed below if you are unsure where to go.',
  '',
  'Oh... and here are some vitals:',
  '',
].join(os.EOL);

/**
 * Builds the new-content banner.
 * @param {string} [type] Content type label.
 * @returns {string} New-content banner.
 */
exports.newContent = (type = 'guide') => [
  '',
  chalk.green(`New ${type} has been...`),
  chalk.magenta('Created!'),
  '',
  `Make sure you have run ${codeMe('lando start')} to get the docs running locally.`,
  '',
  'Oh... and here are some vitals about your new content:',
  '',
].join(os.EOL);

/**
 * Builds the missing dependency message.
 * @param {string} [dep] Missing dependency name.
 * @returns {string} Missing dependency message.
 */
exports.noDockerDep = (dep = 'Docker') => [
  '',
  chalk.red('Uh oh!'),
  '',
  `Lando could not detect an installation of ${dep}, which is a required dependency!`,
  'This most often happens if you have installed from source and have not RTFM.',
  '',
  'We recommend you check out the Install From Source docs and make sure you have',
  'manually installed all the needed dependencies first.',
  chalk.green('https://docs.lando.dev/basics/installation.html#from-source'),
  '',
  'When you have completed the above, try running Lando again. If you still have issues',
  'we recommend you install Lando from the latest package installer as this will install',
  'and setup the needed dependencies for you.',
  chalk.green('https://github.com/lando/lando/releases'),
  '',
  'If you are still having issues after that we recommend you post an issue on Github',
  'or ping us in the Slack channel',
  '',
  chalk.magenta('  ■ Slack - https://launchpass.com/devwithlando'),
  chalk.magenta('  ■ GitHub - https://github.com/lando/lando/issues/new/choose'),
  '',
].join(os.EOL);

/**
 * Builds the poweroff lifecycle message.
 * @param {object} [options] Poweroff message options.
 * @param {'pre'|'post'} [options.phase] Lifecycle phase.
 * @returns {string|undefined} Rendered message for the selected phase.
 */
exports.poweroff = ({phase = 'pre'} = {}) => {
  switch (phase) {
    case 'pre':
      return [
        '',
        chalk.cyan('NO!! SHUT IT ALL DOWN!!!'),
        chalk.magenta('Powering off...'),
        '',
      ].join(os.EOL);
    case 'post':
      return chalk.green('Lando containers have been spun down.');
  }
};

/**
 * Prints colored terminal text.
 * @param {object} [options] Print options.
 * @param {string} [options.text] Text to print.
 * @param {string} [options.color] Chalk color name.
 * @returns {string} Styled text.
 */
exports.print = ({text, color = 'white'} = {}) => {
  return chalk[color](text);
};

/**
 * Prints stylized banner text.
 * @param {object} [options] Print options.
 * @param {string} [options.text] Text to print.
 * @param {string} [options.color] Chalk color name.
 * @param {string} [options.font] Unused font hint kept for API compatibility.
 * @returns {string} Styled text.
 */
exports.printFont = ({text, color = 'magenta', font = 'Small Slant'} = {}) => {
  return chalk[color](text);
};
