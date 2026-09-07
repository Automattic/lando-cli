'use strict';

const chai = require('chai');
const expect = chai.expect;

const proxyBuilder = require('./../services/proxy/builder');

class FakeLandoService {
  constructor(name, config, ...sources) {
    this.name = name;
    this.config = config;
    this.sources = sources;
  }
}

const buildProxy = options => {
  const LandoProxy = proxyBuilder.builder(FakeLandoService, proxyBuilder.config);
  return new LandoProxy('8080', '8443', options);
};

const baseOptions = () => ({
  proxyCommand: ['traefik'],
  proxyPassThru: false,
  proxyDomain: 'lndo.site',
  userConfRoot: '/user/conf/root',
});

describe('lando-proxy.builder', () => {
  describe('proxyPublishAddress', () => {
    it('an app with no publish-address preference keeps today\'s default binding', () => {
      const proxy = buildProxy(baseOptions());
      const ports = proxy.sources[1].services.proxy.ports;
      expect(ports).to.eql(['127.0.0.1:8080:80', '127.0.0.1:8443:443', '127.0.0.1::8080']);
    });

    it('the proxy publishes on the address a consumer configures', () => {
      const proxy = buildProxy({...baseOptions(), proxyPublishAddress: '0.0.0.0'});
      const ports = proxy.sources[1].services.proxy.ports;
      expect(ports).to.eql(['0.0.0.0:8080:80', '0.0.0.0:8443:443', '0.0.0.0::8080']);
    });

    it('proxyBindAddress still governs the binding when a consumer sets it without proxyPublishAddress', () => {
      const proxy = buildProxy({...baseOptions(), proxyBindAddress: '192.168.1.1'});
      const ports = proxy.sources[1].services.proxy.ports;
      expect(ports).to.eql(['192.168.1.1:8080:80', '192.168.1.1:8443:443', '192.168.1.1::8080']);
    });
  });

  describe('proxySocket', () => {
    it('an app with no socket preference keeps today\'s default docker socket mount', () => {
      const proxy = buildProxy(baseOptions());
      const volumes = proxy.sources[0].services.proxy.volumes;
      expect(volumes).to.include('/var/run/docker.sock:/var/run/docker.sock');
      expect(proxy.sources[0].services.proxy).to.not.have.property('security_opt');
    });

    it('the proxy mounts the docker socket a consumer configures', () => {
      const proxy = buildProxy({...baseOptions(), proxySocket: {source: '/run/podman/podman.sock'}});
      const volumes = proxy.sources[0].services.proxy.volumes;
      expect(volumes).to.include('/run/podman/podman.sock:/var/run/docker.sock');
      expect(proxy.sources[0].services.proxy).to.not.have.property('security_opt');
    });

    it('the proxy disables the selinux label on the socket mount when a consumer requests it', () => {
      const proxy = buildProxy({
        ...baseOptions(),
        proxySocket: {source: '/run/podman/podman.sock', selinuxLabelDisable: true},
      });
      const proxyService = proxy.sources[0].services.proxy;
      expect(proxyService.volumes).to.include('/run/podman/podman.sock:/var/run/docker.sock');
      expect(proxyService.security_opt).to.eql(['label=disable']);
    });
  });
});
