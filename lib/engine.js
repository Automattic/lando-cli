'use strict';

// Modules
const LandoDaemon = require('./daemon');
const Landerode = require('./docker');
const router = require('./router');

/**
 * Engine wrapper around router, daemon, docker, and compose operations.
 */
module.exports = class Engine {
  // @TODO: We need to figure out compose a bit better here, there is no default option right now, see similar comments in ./lando.js
  /**
   * @param {object} [daemon] Daemon adapter instance.
   * @param {object} [docker] Docker adapter instance.
   * @param {function(object): object} [compose] Compose command builder.
   * @param {object} [config] Engine config.
   */
  constructor(daemon = new LandoDaemon(), docker = new Landerode(), compose = () => {}, config = {}) {
    /** @type {object} */
    this.docker = docker;
    /** @type {object} */
    this.daemon = daemon;
    /** @type {function(object): object} */
    this.compose = compose;
    /** @type {function(string, object, function(): (Promise|object|void)): Promise} */
    this.engineCmd = (name, data, run = () => router[name](data, this.compose, this.docker)) => router.eventWrapper(
        name,
        daemon,
        daemon.events,
        data,
        run,
    );
    // Determine install status
    /** @type {boolean} */
    this.composeInstalled = config.composeBin !== false;
    /** @type {boolean} */
    this.dockerInstalled = this.daemon.docker !== false;
  };

  /**
   * Event that allows you to do some things before a `compose` object's containers are
   * built
   * @since 3.0.0
   * @event pre_engine_build
   */
  /**
   * Event that allows you to do some things after a `compose` object's containers are
   * built
   * @since 3.0.0
   * @event post_engine_build
   */
  /**
   * Tries to pull the services for a `compose` object, and then tries to build them if they are found
   * locally. This is a wrapper around `docker pull` and `docker build`.
   * **NOTE:** Generally an instantiated `App` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.build
   * @fires pre_engine_build
   * @fires post_engine_build
   * @param {object} data Compose object or array item wrapper.
   * @param {string[]} data.compose Array of Docker Compose file paths.
   * @param {string} data.project Project name, usually the app name.
   * @param {object} [data.opts] Options for building containers.
   * @param {string[]} [data.opts.services] Services to build.
   * @param {boolean} [data.opts.nocache] Ignore the build cache.
   * @param {boolean} [data.opts.pull] Try to pull images first.
   * @returns {Promise} A promise.
   * @example
   * return lando.engine.build(app);
   */
  build(data) {
    return this.engineCmd('build', data, data => router.build(data, this.compose));
  };

  /**
   * Creates a Docker network
   * @since 3.0.0
   * @function
   * @alias lando.engine.createNetwork
   * @see [docker api network docs](https://docs.docker.com/engine/api/v1.35/#operation/NetworkCreate) for info on opts.
   * @param {string} name The network name.
   * @returns {Promise} A promise with inspect data.
   * @example
   * return lando.engine.createNetwork('mynetwork')
   */
  createNetwork(name) {
    return this.docker.createNet(name);
  };

  /**
   * Event that allows you to do some things before some containers are destroyed.
   * @since 3.0.0
   * @event pre_engine_destroy
   */
  /**
   * Event that allows you to do some things after some containers are destroyed.
   * @since 3.0.0
   * @event post_engine_destroy
   */
  /**
   * Removes containers for a `compose` object or a particular container.
   * There are two ways to remove containers:
   *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
   *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
   * These are detailed more below.
   * **NOTE:** Generally an instantiated `App` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.destroy
   * @fires pre_engine_destroy
   * @fires post_engine_destroy
   * @param {object} data Remove criteria for a container or compose context.
   * @param {string} [data.id] Docker-recognizable id, name, or cid.
   * @param {string[]} [data.compose] Array of Docker Compose file paths.
   * @param {string} [data.project] Project name, usually the app name.
   * @param {object} [data.opts] Options controlling removal behavior.
   * @param {string[]} [data.opts.services] Services to remove.
   * @param {boolean} [data.opts.volumes] Remove associated volumes.
   * @param {boolean} [data.opts.force] Force container removal.
   * @param {boolean} [data.opts.purge] Also imply `volumes` and `force`.
   * @returns {Promise} A promise.
   * @example
   * return lando.engine.destroy(app);
   */
  destroy(data) {
    return this.engineCmd('destroy', data);
  };

  /**
   * Checks whether a specific service exists or not.
   * There are two ways to check whether a container exists:
   *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
   *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
   * These are detailed more below.
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.exists
   * @param {object} data Search criteria for a container or compose context.
   * @param {string} [data.id] Docker-recognizable id, name, or cid.
   * @param {string[]} [data.compose] Array of Docker Compose file paths.
   * @param {string} [data.project] Project name, usually the app name.
   * @param {object} data.opts Options controlling the existence check.
   * @param {string[]} data.opts.services Services to check.
   * @returns {Promise<boolean>} Promise resolving to whether the service exists.
   * @example
   * return lando.engine.exists(compose);
   */
  exists(data) {
    return this.engineCmd('exists', data);
  };

  /**
   * Gets a Docker network
   * @since 3.0.0
   * @function
   * @alias lando.engine.getNetwork
   * @param {string} id The network id.
   * @returns {object} Dockerode network object.
   * @example
   * const network = lando.engine.getNetwork('mynetwork')
   */
  getNetwork(id) {
    return this.docker.getNetwork(id);
  };

  /**
   * Gets the docker networks.
   * @since 3.0.0
   * @function
   * @alias lando.engine.getNetworks
   * @see [docker api network docs](https://docs.docker.com/engine/api/v1.27/#operation/NetworkList) for info on filters option.
   * @param {object} [opts] Options for the Docker networks call.
   * @param {object} [opts.filters] Filter options.
   * @returns {Promise<object[]>} Promise resolving to network objects.
   */
  getNetworks(opts) {
    return this.docker.listNetworks(opts);
  };

  /**
   * Determines whether a container is running or not
   * @since 3.0.0
   * @alias lando.engine.isRunning
   * @param {string} data Docker-recognizable container id or name.
   * @returns {Promise<boolean>} Promise resolving to whether the container is running.
   * @example
   * // Check to see if our app's web service is running
   * return lando.engine.isRunning('myapp-web-1').then(isRunning) {
   *   lando.log.info('Container %s is running: %s', 'myapp-web-1', isRunning);
   * });
   */
  isRunning(data) {
    return this.engineCmd('isRunning', data, data => this.docker.isRunning(data));
  };

  /**
   * Lists all the Lando containers. Optionally filter by app name.
   * @since 3.0.0
   * @alias lando.engine.list
   * @param {object} [options] Options to filter the list.
   * @param {boolean} [options.all] Show even stopped containers.
   * @param {string} [options.app] Show containers for only one app.
   * @param {string[]} [options.filter] Additional `key=value` filters.
   * @returns {Promise<object[]>} Promise resolving to container objects.
   * @example
   * return lando.engine.list().each(function(container) {
   *   lando.log.info(container);
   * });
   */
  list(options = {}) {
    return this.engineCmd('list', options, options => this.docker.list(options));
  };

  /**
   * Returns logs for a given `compose` object
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.logs
   * @param {object} data Compose object or array item wrapper.
   * @param {string[]} data.compose Array of Docker Compose file paths.
   * @param {string} data.project Project name, usually the app name.
   * @param {object} [data.opts] Options for log collection.
   * @param {boolean} [data.opts.follow] Follow the log stream like `tail -f`.
   * @param {boolean} [data.opts.timestamps] Show timestamps in output.
   * @returns {Promise} A promise.
   * @example
   * // Get logs for an app
   * return lando.engine.logs(app);
   */
  logs(data) {
    return this.engineCmd('logs', data, data => router.logs(data, this.compose));
  };

  /**
   * Event that allows you to do some things before a command is run on a particular
   * container.
   * @since 3.0.0
   * @event pre_engine_run
   */
  /**
   * Event that allows you to do some things after a command is run on a particular
   * container.
   * @since 3.0.0
   * @event post_engine_run
   */
  /**
   * Runs a command on a given service/container. This is a wrapper around `docker exec`.
   * UNTIL the resolution of https://github.com/apocas/docker-modem/issues/83 data needs to also be or be an
   * array of compose objects for this to work correctly on Windows as well. See some of the other engine
   * documentation for what a compose object looks like.
   * @since 3.0.0
   * @alias lando.engine.run
   * @fires pre_engine_run
   * @fires post_engine_run
   * @param {object} data Run object or array item wrapper.
   * @param {string} data.id Container id or name to run against.
   * @param {string|string[]} data.cmd Command string or argv parts.
   * @param {object} [data.opts] Options for command execution.
   * @param {string} [data.opts.mode] Either `collect` or `attach`.
   * @param {string|string[]} [data.opts.pre] Arguments to prepend before the user command.
   * @param {string[]} [data.opts.env] Additional environment variables as `KEY=VALUE`.
   * @param {string} [data.opts.user] User, `user:group`, `uid`, or `uid:gid`.
   * @param {boolean} [data.opts.detach] Run the process in the background.
   * @param {boolean} [data.opts.autoRemove] Automatically remove the container.
   * @returns {Promise} Promise resolving with command output.
   * @example
   * // Run composer install on the appserver container for an app called myapp
   * return lando.engine.run({id: 'myapp-appserver-1', cmd: ['composer', 'install']});
   * // Drop into an interactive bash shell on the database continer for an app called myapp
   * return lando.engine.run({
   *   id: 'myapp-database-1',
   *   cmd: ['bash'],
   *   opts: {
   *     mode: 'attach'
   *   }
   * });
   */
  run(data) {
    return this.engineCmd('run', data);
  };

  /**
   * Returns comprehensive service metadata. This is a wrapper around `docker inspect`.
   * There are two ways to get container metadata:
   *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
   *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
   * These are detailed more below.
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.scan
   * @param {object} data Search criteria for a container or compose context.
   * @param {string} [data.id] Docker-recognizable id, name, or cid.
   * @param {string[]} [data.compose] Array of Docker Compose file paths.
   * @param {string} [data.project] Project name, usually the app name.
   * @param {object} data.opts Options controlling what to scan.
   * @param {string[]} data.opts.services Services to scan.
   * @returns {Promise<object>} Promise resolving to service metadata.
   * @example
   * // Log scan data using an id
   * return lando.engine.scan({id: '146d321f212d'}).then(function(data) {
   *   lando.log.info('Container data is %j', data);
   * });
   */
  scan(data) {
    return this.engineCmd('scan', data);
  };

  /**
   * Event that allows you to do some things before a `compose` Objects containers are
   * started
   * @since 3.0.0
   * @event pre_engine_start
   */
  /**
   * Event that allows you to do some things after a `compose` Objects containers are
   * started
   * @since 3.0.0
   * @event post_engine_start
   */
  /**
   * Starts the containers/services for the specified `compose` object.
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.start
   * @fires pre_engine_start
   * @fires post_engine_start
   * @param {object} data Compose object or array item wrapper.
   * @param {string[]} data.compose Array of Docker Compose file paths.
   * @param {string} data.project Project name, usually the app name.
   * @param {object} [data.opts] Options for starting containers.
   * @param {string[]} [data.opts.services] Services to start.
   * @param {boolean} [data.opts.background] Start services in the background.
   * @param {boolean} [data.opts.recreate] Recreate services.
   * @param {boolean} [data.opts.removeOrphans] Remove orphaned containers.
   * @returns {Promise} A promise.
   * @example
   * return lando.engine.start(app);
   */
  start(data) {
    return this.engineCmd('start', data, data => router.start(data, this.compose));
  };

  /**
   * Event that allows you to do some things before some containers are stopped.
   * @since 3.0.0
   * @event pre_engine_stop
   */
  /**
   * Event that allows you to do some things after some containers are stopped.
   * @since 3.0.0
   * @event post_engine_stop
   */
  /**
   * Stops containers for a `compose` object or a particular container.
   * There are two ways to stop containers:
   *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
   *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
   * These are detailed more below.
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.stop
   * @fires pre_engine_stop
   * @fires post_engine_stop
   * @param {object} data Stop criteria for a container or compose context.
   * @param {string} [data.id] Docker-recognizable id, name, or cid.
   * @param {string[]} [data.compose] Array of Docker Compose file paths.
   * @param {string} [data.project] Project name, usually the app name.
   * @param {object} [data.opts] Options controlling which services to stop.
   * @param {string[]} [data.opts.services] Services to stop.
   * @returns {Promise} A promise.
   * @example
   * return lando.engine.stop(app);
   */
  stop(data) {
    return this.engineCmd('stop', data);
  };
};

