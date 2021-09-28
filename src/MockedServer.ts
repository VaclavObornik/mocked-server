
import url from 'url';
import Koa, {Context, Middleware, Next} from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import mocha from 'mocha';
import Route from './Route';
import {AwaitableChecker, Checker, DefaultHandler, LowercasedMethod, Matcher, Method, Path} from './types';
import {Server} from "http";

export default class MockServer {

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

        if (mocha && 'before' in mocha) {
            this._bindMocha();

        } else if ('beforeAll' in global) {
            this._bindJest();
        }
    }

    private _bindMocha () {

        let server: Server;
        mocha.before((done) => {
            server = this._app.listen(this._port, () => done());
        });

        mocha.after(() => server && server.close());

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

        let server: Server;
        global.beforeAll((done) => {
            server = this._app.listen(this._port, () => done());
        });

        global.afterAll(() => server && server.close());

        global.beforeEach(() => this.reset());

        const runAllCheckers = this.runAllCheckers.bind(this);
        global.afterEach(function () {
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
     */
    _handleNext (
        method: Method,
        path: Path,
        matcher: Matcher,
        handler: Middleware = (ctx, next) => next()
    ): AwaitableChecker {

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
                error = handleError;
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

    _notReceive (method: Method, path: Path, matcher: Matcher): Checker {
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
        this._commonHandlersRouter['put'](path, handler);
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

    private _addOnetimeHandler (method: Method, path: Path, matcher: Matcher, handler: Middleware) {

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

