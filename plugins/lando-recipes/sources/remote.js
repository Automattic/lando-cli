'use strict';

module.exports = {
  sources: [{
    name: 'remote',
    label: 'remote git repo or archive',
    options: lando => ({
      'remote-url': {
        describe: 'The URL of your git repo or archive, only works when you set source to remote',
        string: true,
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
