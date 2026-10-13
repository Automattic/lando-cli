/**
 * Tests for network attachment during startup.
 * @file app.spec.js
 */

'use strict';

const {expect} = require('chai');
const sinon = require('sinon');
const Bluebird = require('../../../lib/promise');
const networking = require('../app');

describe('networking startup', () => {
  ['app containers', 'proxy aliases'].forEach((target, index) => {
    describe(target, () => {
      let hook;
      let resolveConnection;
      let rejectConnection;
      let connectionStarted;
      let debug;

      beforeEach(() => {
        const hooks = [];
        const connection = new Bluebird((resolve, reject) => {
          resolveConnection = resolve;
          rejectConnection = reject;
        });
        let markStarted;
        connectionStarted = new Bluebird(resolve => {
          markStarted = resolve;
        });
        const network = {
          disconnect: sinon.stub().returns(Bluebird.resolve()),
          connect: () => {
            markStarted();
            return connection;
          },
        };
        debug = sinon.spy();
        networking({
          events: {on: (name, priority, handler) => {
            if (name === 'post-start') hooks.push(handler);
          }},
          project: 'example',
          config: {proxy: {appserver: ['example.lndo.site']}},
          log: {debug},
        }, {
          Promise: Bluebird,
          config: {networkBridge: 'lando', proxy: 'ON', proxyContainer: 'proxy'},
          engine: {
            getNetwork: () => network,
            list: () => Bluebird.resolve([{id: 'appserver', service: 'appserver', app: 'example'}]),
            exists: () => Bluebird.resolve(true),
            scan: () => Bluebird.resolve({}),
          },
        });
        hook = hooks[index];
      });

      it('should wait for attachment before completing startup and logging success', async () => {
        let completed = false;
        const startup = hook().then(() => {
          completed = true;
        });
        await connectionStarted;
        await Bluebird.delay(20);
        expect(completed).to.equal(false);
        expect(debug.called).to.equal(false);
        resolveConnection();
        await startup;
        expect(completed).to.equal(true);
        expect(debug.calledOnce).to.equal(true);
      });

      it('should propagate attachment failures instead of reporting success', async () => {
        const failure = new Error('network attachment failed');
        const startup = hook().reflect();
        await connectionStarted;
        rejectConnection(failure);
        const result = await startup;
        expect(result.isRejected()).to.equal(true);
        expect(result.reason()).to.equal(failure);
        expect(debug.called).to.equal(false);
      });
    });
  });
});
