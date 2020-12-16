import { Middleware } from 'koa';
import Route from './Route';
import { AwaitableChecker, Checker, DefaultHandler, LowercasedMethod, Matcher, Method, Path } from './types';
export default class MockServer {
    private readonly _port;
    private readonly _app;
    private _pendingCheckers;
    private _nextHandledRequests;
    private _nextHandlersRouter;
    private _commonHandlersRouter;
    /**
     * @param {string|number} urlOrPort
     */
    constructor(urlOrPort: string | number);
    _bindMocha(): void;
    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the '_handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @returns {IChecker} Returns function that checks the route was requested and the handler responded without error.
     */
    _handleNext(method: Method, path: Path, matcher: Matcher, handler?: Middleware): AwaitableChecker;
    _notReceive(method: Method, path: Path, matcher: Matcher): Checker;
    /**
     * Runs all not-called checkers.
     */
    runAllCheckers(): void;
    /**
     * Add general handler that respond to all method and path requests.
     */
    _handle(method: Method, path: Path, handler: Middleware): void;
    /**
     * Removes all registered one-time handlers and pending checkers
     */
    reset(): void;
    get(path: Path, defaultHandler?: DefaultHandler): Route;
    post(path: Path, defaultHandler?: DefaultHandler): Route;
    put(path: Path, defaultHandler?: DefaultHandler): Route;
    patch(path: Path, defaultHandler?: DefaultHandler): Route;
    delete(path: Path, defaultHandler?: DefaultHandler): Route;
    link(path: Path, defaultHandler?: DefaultHandler): Route;
    unlink(path: Path, defaultHandler?: DefaultHandler): Route;
    head(path: Path, defaultHandler?: DefaultHandler): Route;
    options(path: Path, defaultHandler?: DefaultHandler): Route;
    all(path: Path, defaultHandler?: DefaultHandler): Route;
    route(method: Method, path: Path, defaultHandler?: Middleware): Route;
    _registerChecker(callback: Function): {
        checker: Checker;
        unregister: () => void;
    };
    _lowercaseMethod(method: Method): LowercasedMethod;
    _addOnetimeHandler(method: Method, path: Path, matcher: Matcher, handler: Middleware): () => boolean;
}
