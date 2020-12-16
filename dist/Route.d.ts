import { AwaitableChecker, Checker, Matcher, Method, Path } from './types';
import MockServer from "./MockedServer";
import { Middleware } from 'koa';
export default class Route {
    private _mockServer;
    private _method;
    private _path;
    private _matchers;
    constructor(_mockServer: MockServer, _method: Method, _path: Path, _matchers?: Matcher[]);
    matching(matcher: Matcher): Route;
    _getSingleMatcher(): Matcher;
    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the '_handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     */
    handleNext(handler?: Middleware): AwaitableChecker;
    /**
     * Adds one-time check. The checker will fail in case of any request to the method and path.
     * The checks registered using 'notReceive' method.
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @returns Returns function that checks the route was NOT requested.
     */
    notReceive(): Checker;
}
