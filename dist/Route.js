"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Route {
    constructor(_mockServer, _method, _path, _matchers = []) {
        this._mockServer = _mockServer;
        this._method = _method;
        this._path = _path;
        this._matchers = _matchers;
    }
    matching(matcher) {
        return new Route(this._mockServer, this._method, this._path, [
            ...this._matchers,
            matcher
        ]);
    }
    _getSingleMatcher() {
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
     */
    handleNext(handler) {
        return this._mockServer._handleNext(this._method, this._path, this._getSingleMatcher(), handler);
    }
    /**
     * Adds one-time check. The checker will fail in case of any request to the method and path.
     * The checks registered using 'notReceive' method.
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @returns Returns function that checks the route was NOT requested.
     */
    notReceive() {
        return this._mockServer._notReceive(this._method, this._path, this._getSingleMatcher());
    }
}
exports.default = Route;
//# sourceMappingURL=Route.js.map