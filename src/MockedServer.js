'use strict';

const url = require('url');
const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const mocha = require('mocha');
const Route = require('./Route');


/** @typedef {'GET'|'PUT'|'POST'|'PATCH'|'DELETE'|'DEL'} IMethod */

/**
 * @callback IHandler
 * @param {*} ctx
 * @param {Function} next
 */

/**
 * @callback IChecker
 * @throws
 */

class MockServer {

    /**
     * @param {string|number} urlOrPort
     */
    constructor (urlOrPort) {

        if (typeof urlOrPort === 'number') {
            this._port = urlOrPort;

        } else {
            const parsed = url.parse(urlOrPort);
            this._port = parseInt(parsed.port);
        }

        this._app = new Koa();
        this._app.use(bodyParser({
            enableTypes: ['json', 'form', 'text'],
            extendTypes: {
                text: 'text/xml'
            }
        }));

        this._pendingCheckers = [];
        this._nextHandledRequests = new WeakMap();
        this._nextHandlersRouter = new Router();
        this._app.use(async (ctx, next) => {
            await this._nextHandlersRouter.routes()(ctx, next);
        });

        this._commonHanlersRouter = new Router();
        this._app.use(this._commonHanlersRouter.routes());

        this._app.use((ctx) => {
            const error = new Error(`No handler match the "[${ctx.request.method}] ${ctx.request.path}" request`);
            ctx.status = 404;
            ctx.body = { error: error.toString() };
        });

        this._bindMocha();
    }

    _bindMocha () {

        let server;
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
                this.test.error(err);
            }
        });
    }

    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the 'handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @param {IMethod} method
     * @param {string} path
     * @param {IHandler} [handler]
     * @returns {IChecker} Returns function that checks the route was requested and the handler responded without error.
     */
    handleNext (method, path, handler = (ctx, next) => next()) {

        let requestReceived = false;
        let error;
        let resolvePromise;
        let rejectPromise;
        let promiseUsed = false;

        const cancel = this._addOnetimeHandler(method, path, async (ctx, next) => {
            requestReceived = true;
            try {
                await handler(ctx, next);
                if (promiseUsed) {
                    resolvePromise();
                }
            } catch (handleError) {
                error = handleError;
                if (promiseUsed) {
                    rejectPromise(error);
                }
            }
        });

        const checker = this._registerChecker(() => {
            cancel();
            if (!requestReceived) {
                error = new Error(`Mock api didn't receive expected ${method.toUpperCase()} request to '${path}' path.`);
                if (promiseUsed) {
                    rejectPromise(error);
                }
            }
            if (error) {
                throw error;
            }
        });

        const promise = new Promise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        for (const method of ['then', 'catch', 'finally']) {
            checker[method] = (...args) => {
                if (!promiseUsed) {
                    promiseUsed = true;
                    if (error) {
                        rejectPromise(error);
                    } else if (requestReceived) {
                        resolvePromise();
                    }
                }
                return promise[method](...args);
            };
        }

        return checker;
    }

    /**
     * Adds one-time check. The checker will fail in case of any request to the method and path.
     * The checks registered using 'notReceive' method.
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @param {IMethod} method
     * @param {string} path
     * @returns {IChecker} Returns function that checks the route was NOT requested.
     */
    notReceive (method, path) {
        let error;

        const cancel = this._addOnetimeHandler(method, path, async (ctx, next) => {
            error = new Error(`Mock api received unexpected ${method.toUpperCase()} request to '${path}' path`);
            next();
        });

        return this._registerChecker(() => {
            cancel();
            if (error) {
                throw error;
            }
        });
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
     *
     * @param {IMethod} method
     * @param {string} path
     * @param {IHandler} handler
     */
    handle (method, path, handler) {
        this._commonHanlersRouter[method.toLowerCase()](path, handler);
    }

    /**
     * Removes all registered one-time handlers and pending checkers
     */
    reset () {
        this._nextHandlersRouter = new Router();
        this._pendingCheckers = [];
    }

    /**
     * @param {IMethod} method
     * @param {string} path
     * @param {IHandler} [defaultHandler]
     * @returns {Route}
     */
    route (method, path, defaultHandler) {

        if (defaultHandler) {
            this.handle(method, path, defaultHandler);
        }

        return new Route(this, method, path);
    }

    _registerChecker (callback) {
        const checker = () => {
            const indexOfChecker = this._pendingCheckers.indexOf(checker);
            if (indexOfChecker >= 0) {
                this._pendingCheckers.splice(indexOfChecker, 1);
            }
            callback();
        };

        this._pendingCheckers.push(checker);

        return checker;
    }

    _addOnetimeHandler (method, path, handler) {

        let pending = true;
        const disableHandler = () => (pending = false);

        this._nextHandlersRouter[method.toLowerCase()](path, async (ctx, next) => {
            if (!pending || this._nextHandledRequests.has(ctx)) {
                return next();
            }

            this._nextHandledRequests.set(ctx, ctx);
            disableHandler();
            await handler(ctx, next);
        });

        return disableHandler;
    }

}

module.exports = MockServer;
