'use strict';

const expect = require('chai').expect;
const utils = require('../lib/utils');
const tooling = require('../plugins/lando-tooling/lib/utils');

describe('utils', () => {
  describe('#shellEscape', () => {
    it('should parse string commands with quoted arguments when extra args are present', () => {
      expect(utils.shellEscape('echo "hello world"', false, ['extra']))
          .to.deep.equal(['echo', 'hello world']);
    });

    it('should preserve empty quoted arguments', () => {
      expect(utils.shellEscape('echo ""', false, ['extra']))
          .to.deep.equal(['echo', '']);
    });

    it('should wrap shell operators after parsing a string command', () => {
      expect(utils.shellEscape('echo hello && echo world', true, ['extra']))
          .to.deep.equal(['/bin/sh', '-c', 'echo hello && echo world']);
    });

    it('should preserve string commands without extra args for the shell', () => {
      expect(utils.shellEscape('echo "hello world"', false, []))
          .to.deep.equal(['/bin/sh', '-c', 'echo "hello world"']);
    });
  });

  describe('tooling command parsing', () => {
    it('should append CLI args to the parsed tooling command', () => {
      const originalArgv = process.argv;
      try {
        process.argv = ['node', 'lando.js', 'say', 'extra'];
        expect(tooling.parseConfig(['echo "hello world"'], 'appserver'))
            .to.deep.equal([{service: 'appserver', args: ['extra'], command: ['echo', 'hello world', 'extra']}]);
      } finally {
        process.argv = originalArgv;
      }
    });
  });
});
