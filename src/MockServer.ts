
import Koa, {Context, Middleware, Next} from 'koa';
import Router from '@koa/router';
// untyped require: the koa augmentation in @types/koa-bodyparser (body?: unknown)
// conflicts with the body?: any this library publishes for backward compatibility
const bodyParser: (opts?: object) => Middleware = require('koa-bodyparser');
import { Route } from './Route';
import { getSettings } from './getSettings';
import { AwaitableChecker, Checker, DefaultHandler, LowercasedMethod, MatcherFunction, Method, MockServerOptions, Path } from './types';
import { Server } from "http";
import * as http from "http";
import { debug } from './debug';

export class MockServer {

    private _readyPromise: Promise<void> | undefined;

    /** Resolves once the server is listening; rejects when the port cannot be bound. */
    public get readyPromise (): Promise<void> | undefined {
        return this._readyPromise;
    }

    private readonly server: Server;

    private readonly _port: number;

    private readonly _app: Koa = new Koa();

    private _pendingCheckers = new Array<Checker>();

    private _nextHandledRequests = new WeakSet<Context>();

    private _nextHandlersRouter = new Router();

    private _commonHandlersRouter = new Router();

    constructor (urlOrPort: string|number, options: MockServerOptions = {}) {

        debug(`new MockedServer() called with urlOrPort: ${urlOrPort}`);

        this._port = MockServer._parsePort(urlOrPort);

        this._app.use(bodyParser({
            enableTypes: ['json', 'form', 'text'],
            extendTypes: {
                text: ['text/xml']
            }
        }));

        this._app.use(async (ctx: Context, next: Next) => {

            const routerForRequest = new Router();
            routerForRequest.use(
                this._nextHandlersRouter.routes(),
                this._commonHandlersRouter.routes()
            );

            await routerForRequest.routes()(ctx as any, next);
        });

        this._app.use((ctx) => {
            const error = new Error(`No handler match the "[${ctx.request.method}] ${ctx.request.path}" request`);
            ctx.status = 404;
            ctx.body = { error: error.toString() };
        });

        this.server = http.createServer(this._app.callback());

        const settings = getSettings(options);

        if (settings.testRunner === 'mocha') {
            this._bindMocha();

        } else if (settings.testRunner === 'jest') {
            this._bindJest();

        } else {
            // nobody awaits the promise in the 'none' mode; report instead of crashing on unhandledRejection
            this.start().catch((err) => {
                console.error(`mocked-server: unable to start the server on port ${this._port}:`, err);
            });
        }
    }

    /** The port the server is bound to. Useful when the server was created with port 0 (random port). */
    public get port (): number {
        const address = this.server.address();
        return (address !== null && typeof address === 'object') ? address.port : this._port;
    }

    private static _parsePort (urlOrPort: string|number): number {

        if (typeof urlOrPort === 'number') {
            return urlOrPort;
        }

        let parsed: URL;
        try {
            parsed = new URL(urlOrPort);
        } catch (err) {
            throw new Error(`Invalid URL "${urlOrPort}" passed to the MockServer constructor.`);
        }

        // new URL() normalizes default ports to an empty string
        const defaultPorts: Record<string, string> = { 'http:': '80', 'https:': '443' };
        const port = parsed.port || defaultPorts[parsed.protocol];

        if (!port) {
            throw new Error('URL does not contain a port number');
        }

        return parseInt(port, 10);
    }

    /**
     * Starts the server. Called automatically when the 'mocha' or 'jest' testRunner is used.
     * Repeated calls return the promise of the first call.
     */
    start (): Promise<void> {
        if (this._readyPromise) {
            return this._readyPromise;
        }
        debug(`start() called, starting server on ${this._port}`);
        this._readyPromise = new Promise<void>((resolve, reject) => {
            const onErrorCallback = (err: Error) => {
                debug(`server listen() error for port ${this._port}`);
                reject(err);
            };
            this.server.on('error', onErrorCallback); // typically EADDRINUSE
            this.server.listen(this._port, () => {
                debug(`server listening on port ${this._port}`);
                this.server.removeListener('error', onErrorCallback);
                resolve();
            });
        });
        return this._readyPromise;
    }

    /**
     * Stops the server. Called automatically when the 'mocha' or 'jest' testRunner is used.
     * Rejects when the server is not running.
     */
    close (): Promise<void> {
        debug(`server.close called; closing port ${this._port}`);
        // keep-alive sockets would otherwise block close() until their timeout (available since Node 18.2)
        this.server.closeIdleConnections?.();
        return new Promise<void>((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    debug(`server closing error for port ${this._port}; error: ${err}`);
                    reject(err);
                } else {
                    debug(`server closed for port ${this._port}`);
                    resolve();
                }
            });
        });
    }

    private _bindMocha () {

        debug('Binding Mocha');

        const mocha = require('mocha');

        mocha.before(async () => {
            debug(`mocha.before called; port ${this._port}`);
            try {
                await this.start();
                debug(`mocha.before success for port ${this._port}`);

            } catch (err) {
                debug(`mocha.before error for port ${this._port}; error: ${err}`);
                throw err;
            }
        });

        mocha.after(async () => {
            debug(`mocha.after called; port ${this._port}`);
            try {
                await this.close();
                debug(`mocha.after success for port ${this._port}`);

            } catch (err) {
                debug(`mocha.after error for port ${this._port}; error: ${err}`);
                throw err;
            }
        });

        mocha.beforeEach(() => this.reset());

        const runAllCheckers = this.runAllCheckers.bind(this);
        mocha.afterEach(function () {
            try {
                runAllCheckers();
            } catch (err) {
                // report via the hook so mocha fails the test but keeps running the rest of the suite
                // @ts-ignore
                this.test.error(err);
            }
        });
    }

    private _bindJest () {

        const workerId = process.env.JEST_WORKER_ID ?? 'undefined';
        debug(`Binding Jest; workerId: ${workerId}`);

        const jest = require('@jest/globals');

        jest.beforeAll(async () => {
            debug(`jest.beforeAll called; port ${this._port}; workerId: ${workerId}`);
            try {
                await this.start();
                debug(`jest.beforeAll success for port ${this._port}; workerId: ${workerId}`);

            } catch (err) {
                debug(`jest.beforeAll error for port ${this._port}; workerId: ${workerId}; error: ${err}`);
                throw err;
            }
        });

        jest.afterAll(async () => {
            debug(`jest.afterAll called; port ${this._port}; workerId: ${workerId}`);
            try {
                await this.close();
                debug(`jest.afterAll success for port ${this._port}; workerId: ${workerId}`);

            } catch (err) {
                debug(`jest.afterAll error for port ${this._port}; error: ${err}; workerId: ${workerId}`);
                throw err;
            }
        });

        jest.beforeEach(() => this.reset());

        const runAllCheckers = this.runAllCheckers.bind(this);
        jest.afterEach(function () {
            runAllCheckers();
        });
    }

    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the '_handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @returns {AwaitableChecker} Returns function that checks the route was requested and the handler responded without error.
     * @internal
     */
    _handleNext<T> (method: Method, path: Path, matcher: MatcherFunction, handler: Middleware<T>|undefined, promiseLike: true): AwaitableChecker;
    _handleNext<T> (method: Method, path: Path, matcher: MatcherFunction, handler: Middleware<T>|undefined, promiseLike: false): Checker;
    _handleNext<T> (method: Method, path: Path, matcher: MatcherFunction, handler: Middleware<T> = (ctx, next) => next(), promiseLike: boolean): AwaitableChecker | Checker {

        let requestReceived = false;
        let handlerFinished = false;
        let error: Error | undefined;

        let resolvePromise: () => void;
        let rejectPromise: (error: Error) => void;
        const promise = new Promise<void>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });
        // the promise settles even when nobody awaits the checker; this no-op branch
        // prevents an unhandledRejection crash while `then()` callers still get the rejection
        promise.catch(() => {});

        const cancel = this._addOnetimeHandler(method, path, matcher, async (ctx, next) => {
            requestReceived = true;
            try {
                await handler(ctx, next);
                resolvePromise();
            } catch (handlerError) {
                error = handlerError as Error;
                if (!ctx.headerSent) {
                    // a default Koa 404 would point the tested code away from the real cause
                    ctx.status = 500;
                    ctx.body = { error: `${error}` };
                }
                rejectPromise(error);
            } finally {
                handlerFinished = true;
            }
        });

        const { checker, unregister } = this._registerChecker(() => {
            cancel();
            if (!requestReceived) {
                error = new Error(`Mock api didn't receive expected ${method.toUpperCase()} request to '${path}' path.`);
                rejectPromise(error);
            } else if (!handlerFinished) {
                throw new Error(`Mock api received the expected ${method.toUpperCase()} request to '${path}' path, but its handler has not finished yet. Await the response in the test, or await the checker returned by waitForNext().`);
            }
            if (error) {
                throw error;
            }
        });

        if (!promiseLike) {
            return checker;
        }

        return Object.assign(checker, {
            then (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => never | any) {
                // unregister so the automatic afterEach check does not fire for an awaited checker
                unregister();
                return promise.then(onfulfilled, onrejected);
            }
        });
    }

    /** @internal */
    _notReceive (method: Method, path: Path, matcher: MatcherFunction): Checker {
        let error: Error;

        const cancel = this._addOnetimeHandler(method, path, matcher, async (ctx, next) => {
            error = new Error(`Mock api received unexpected ${method.toUpperCase()} request to '${path}' path`);
            return next();
        });

        return this._registerChecker(() => {
            cancel();
            if (error) {
                throw error;
            }
        }).checker;
    }

    /**
     * Runs all not-called checkers. Throws the failure when exactly one check fails,
     * or an AggregateError when multiple checks fail.
     */
    runAllCheckers () {
        const errors: Error[] = [];

        // slice because checkers unregister themselves from the array as they run
        for (const checker of this._pendingCheckers.slice()) {
            try {
                checker();
            } catch (err) {
                errors.push(err as Error);
            }
        }

        if (errors.length === 1) {
            throw errors[0];
        }
        if (errors.length > 1) {
            const summary = errors.map((err) => ` - ${err.message}`).join('\n');
            throw new AggregateError(errors, `${errors.length} mocked-server checks failed:\n${summary}`);
        }
    }

    /**
     * Add general handler that respond to all method and path requests.
     */
    private _handle (method: Method, path: Path, handler: Middleware): void {
        this._commonHandlersRouter[this._lowercaseMethod(method)](path, handler);
    }

    /**
     * Removes all registered one-time handlers and pending checkers
     */
    reset () {
        this._nextHandlersRouter = new Router();
        this._pendingCheckers = [];
    }

    get (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('GET', path, defaultHandler);
    }

    post (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('POST', path, defaultHandler);
    }

    put (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('PUT', path, defaultHandler);
    }

    patch (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('PATCH', path, defaultHandler);
    }

    delete (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('DELETE', path, defaultHandler);
    }

    link (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('LINK', path, defaultHandler);
    }

    unlink (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('UNLINK', path, defaultHandler);
    }

    head (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('HEAD', path, defaultHandler);
    }

    options (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('OPTIONS', path, defaultHandler);
    }

    all (path: Path, defaultHandler?: DefaultHandler) {
        return this.route('ALL', path, defaultHandler);
    }

    route (method: Method, path: Path, defaultHandler?: Middleware): Route {

        if (defaultHandler) {
            this._handle(method, path, defaultHandler);
        }

        return new Route(this, method, path);
    }

    private _registerChecker (callback: Function): { checker: Checker, unregister: () => void } {

        const unregister = () => {
            const indexOfChecker = this._pendingCheckers.indexOf(checker);
            if (indexOfChecker >= 0) {
                this._pendingCheckers.splice(indexOfChecker, 1);
            }
        };

        const checker = () => {
            unregister();
            callback();
        };

        this._pendingCheckers.push(checker);

        return { checker, unregister };
    }

    private _lowercaseMethod (method: Method): LowercasedMethod {
        return method.toLowerCase() as LowercasedMethod;
    }

    private _addOnetimeHandler (method: Method, path: Path, matcher: MatcherFunction, handler: Middleware) {

        let pending = true;
        const disableHandler = () => (pending = false);

        this._nextHandlersRouter[this._lowercaseMethod(method)](path, async (ctx, next) => {

            if (!pending || this._nextHandledRequests.has(ctx)) {
                return next();
            }

            if (!(await matcher(ctx))) {
                return next();
            }

            // re-check: a concurrent request could have consumed this handler while the matcher was awaited
            if (!pending) {
                return next();
            }

            this._nextHandledRequests.add(ctx);
            disableHandler();
            await handler(ctx, next);
        });

        return disableHandler;
    }

}
