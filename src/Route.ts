import {AwaitableChecker, Checker, Matcher, Method, Path} from './types';

import MockServer from "./MockedServer";
import { Context, Middleware } from 'koa';


export default class Route {

    constructor (
        private _mockServer: MockServer,
        private _method: Method,
        private _path: Path,
        private _matchers: Matcher[] = []
    ) {}

    matching (matcher: Matcher) {
        return new Route(this._mockServer, this._method, this._path, [
            ...this._matchers,
            matcher
        ]);
    }

    _getSingleMatcher (): Matcher {
        return async (ctx: Context) => {
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
    handleNext (handler?: Middleware): AwaitableChecker {
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
    notReceive (): Checker {
        return this._mockServer._notReceive(this._method, this._path, this._getSingleMatcher());
    }
}

