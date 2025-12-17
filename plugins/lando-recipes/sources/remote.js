'use strict';

/**
 * Validates that a given input is a valid URI.
 *
 * @param {string} input The input string to validate.
 * @return {boolean} True if the input is a valid URI, false otherwise.
 */
function isValidUri(input) {
  try {
    const url = new URL(input);
    return (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'git:') &&
      url.hostname.length > 0;
  } catch {
    return false;
  }
}

module.exports = {
  sources: [{
    name: 'remote',
    label: 'remote git repo or archive',
    options: lando => ({
      'remote-url': {
        describe: 'The URL of your git repo or archive, only works when you set source to remote',
        string: true,
        interactive: {
          type: 'input',
          message: 'Please enter the URL of the git repo or tar archive containing your application code',
          when: answers => answers.source === 'remote',
          validate: input => {
            if (isValidUri(input)) return true;
            return `${input} does not seem to be a valid uri!`;
          },
          weight: 110,
        },
      },
      'remote-options': {
        default: '',
        describe: 'Some options to pass into either the git clone or archive extract command',
        string: true,
      },
    }),
    build: options => {
      return [{
        name: 'get-asset',
        cmd: `/helpers/get-remote-url.sh ${options['remote-url']} "${options['remote-options']}"`,
        remove: true,
      }];
    },
  }],
};
