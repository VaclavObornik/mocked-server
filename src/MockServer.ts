
import url from 'url';
import Koa, {Context, Middleware, Next} from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import { Route } from './Route';
import { getSettings } from './getSettings';
import { AwaitableChecker, Checker, DefaultHandler, LowercasedMethod, MatcherFunction, Method, Path } from './types';
import { Server } from "http";
import * as http from "http";
import { debug } from './debug';

export class MockServer {

    public _readyPromise: Promise<void> | undefined;

    public get readyPromise (): Promise<void> | undefined {
        return this._readyPromise;
    }

    private readonly server: Server;

    private readonly _port: number;

    private readonly _app: Koa = new Koa();

    private _pendingCheckers = new Array<Checker>();

    private _nextHandledRequests = new WeakMap<Context, Context>();

    private _nextHandlersRouter = new Router();

    private _commonHandlersRouter = new Router();

    /**
     * @param {string|number} urlOrPort
     */
    constructor (urlOrPort: string|number) {

        debug(`new MockedServer() called with urlOrPort: ${urlOrPort}`);

        if (typeof urlOrPort === 'number') {
            this._port = urlOrPort;

        } else {
            const parsed = url.parse(urlOrPort);

            if (!parsed.port) {
                throw new Error('URL does not contains port number');
            }

            this._port = parseInt(parsed.port);
        }

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

        const settings = getSettings();

        if (settings.testRunner === 'mocha') {
            this._bindMocha();

        } else if (settings.testRunner === 'jest') {
            this._bindJest();

        } else {
            this.start();
        }
    }

    private start () {
        debug(`start() called, staring server on ${this._port}`);
        this._readyPromise = new Promise<void>((resolve, reject) => {
            const onErrorCallback = (err: Error) => {
                debug(`sever listen() error for port ${this._port}`);
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

    private close () {
        debug(`server.close called; closing port ${this._port}`);
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
            debug(`jest.beforeAll called; port ${this._port}`);
            try {
                await this.start();
                debug(`jest.beforeAll success for port ${this._port}`);

            } catch (err) {
                debug(`jest.beforeAll error for port ${this._port}; error: ${err}`);
                throw err;
            }
        });

        mocha.after(async () => {
            debug(`mocha.afterAll called; port ${this._port}`);
            try {
                await this.close();
                debug(`mocha.afterAll success for port ${this._port}`);

            } catch (err) {
                debug(`mocha.afterAll error for port ${this._port}; error: ${err}`);
                throw err;
            }
        });

        mocha.beforeEach(() => this.reset());

        const runAllCheckers = this.runAllCheckers.bind(this);
        mocha.afterEach(function () {
            try {
                runAllCheckers();
            } catch (err) {
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
        let error: Error;
        let wasPromiseUsed = false;
        let resolvePromise: (value?: unknown) => void;
        let rejectPromise: (error: Error) => void;
        const promise = new Promise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        const cancel = this._addOnetimeHandler(method, path, matcher,async (ctx, next) => {
            requestReceived = true;
            try {
                await handler(ctx, next);
                if (wasPromiseUsed) {
                    resolvePromise();
                }
            } catch (handleError) {
                error = handleError as Error;
                if (wasPromiseUsed) {
                    rejectPromise(error);
                }
            }
        });

        const { checker, unregister } = this._registerChecker(() => {
            cancel();
            if (!requestReceived) {
                error = new Error(`Mock api didn't receive expected ${method.toUpperCase()} request to '${path}' path.`);
                if (wasPromiseUsed) {
                    rejectPromise(error);
                }
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
                if (!wasPromiseUsed) {
                    unregister();
                    wasPromiseUsed = true;
                    if (error) {
                        rejectPromise(error);
                    } else if (requestReceived) {
                        resolvePromise();
                    }
                }
                return promise.then(onfulfilled, onrejected);
            }
        });
    }

    /** @internal */
    _notReceive (method: Method, path: Path, matcher: MatcherFunction): Checker {
        let error: Error;

        const cancel = this._addOnetimeHandler(method, path, matcher,async (ctx, next) => {
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
     * Runs all not-called checkers.
     */
    runAllCheckers () {
        // slice because of the original array is being changed during the iteration
        this._pendingCheckers.slice().forEach(checker => checker());
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

            if (!pending) {
                return next();
            }

            if (this._nextHandledRequests.has(ctx)) {
                return next();
            }

            if (!(await matcher(ctx))) {
                return next();
            }

            this._nextHandledRequests.set(ctx, ctx);
            disableHandler();
            await handler(ctx, next);
        });

        return disableHandler;
    }

}

