'use strict';


class Route {

    /**
     * @param {MockServer} mockServer
     * @param {IMethod} method
     * @param {string} path
     */
    constructor (mockServer, method, path) {
        this._mockServer = mockServer;
        this._method = method;
        this._path = path;
    }

    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the 'handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @param {IHandler} [handler]
     * @returns {IChecker}
     */
    handleNext (handler) {
        return this._mockServer.handleNext(this._method, this._path, handler);
    }

    /**
     * Adds one-time check. The checker will fail in case of any request to the method and path.
     * The checks registered using 'notReceive' method.
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @returns {IChecker}
     */
    notReceive () {
        return this._mockServer.notReceive(this._method, this._path);
    }
}

module.exports = Route;

