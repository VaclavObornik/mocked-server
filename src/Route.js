'use strict';

const isMatch = require('lodash.ismatch');

class Route {

    /**
     * @param {MockServer} mockServer
     * @param {IMethod} method
     * @param {string} path
     * @param {Function[]} matchers
     */
    constructor (mockServer, method, path, matchers = []) {
        this._mockServer = mockServer;
        this._method = method;
        this._path = path;
        this._matchers = matchers;
    }

    /**
     * @param {Function} matcher - accepts ctx and should return true or false
     * @returns {Route} Conditional route
     */
    matching (matcher) {
        return new Route(this._mockServer, this._method, this._path, [
            ...this._matchers,
            matcher
        ]);
    }

    /**
     * @param {Object} matcher - accepts ctx and should return true or false
     * @returns {Route} Conditional route
     */
    matchingParams (matcher) {
        return this.matching((ctx) => isMatch(ctx.params, matcher));
    }

    /**
     * @param {Function} matcher - accepts ctx and should return true or false
     * @returns {Route} Conditional route
     */
    matchingQuery (matcher) {
        return this.matching((ctx) => isMatch(ctx.query, matcher));
    }

    /**
     * @returns {Function}
     * @private
     */
    _getSingleMatcher () {
        return async (ctx) => {
            for (const matcher of this._matchers) {
                if (!(await matcher(ctx))) {
                    return false;
                }
            }
            return true;
        };
    }

    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the '_handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @param {IHandler} [handler]
     * @returns {IChecker}
     */
    handleNext (handler) {
        return this._mockServer._handleNext(this._method, this._path, this._getSingleMatcher(), handler);
    }

    /**
     * Adds one-time check. The checker will fail in case of any request to the method and path.
     * The checks registered using 'notReceive' method.
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @returns {IChecker} Returns function that checks the route was NOT requested.
     */
    notReceive () {
        return this._mockServer._notReceive(this._method, this._path, this._getSingleMatcher());
    }
}

module.exports = Route;

