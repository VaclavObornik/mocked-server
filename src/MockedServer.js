'use strict';

const url = require('url');
const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-body');
const mocha = require('mocha');

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
        this._app.use(bodyParser());

        this._pendingCheckers = [];
        this._nextHandlersRouter = new Router();
        this._app.use((ctx, next) => {
            this._nextHandlersRouter.routes()(ctx, next);
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

        mocha.afterEach(() => this.runAllCheckers());
    }

    /**
     * Runs all not-called checkers.
     */
    runAllCheckers () {
        this._pendingCheckers.forEach(checker => checker());
    }

    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the 'handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @param {string} method
     * @param {string} path
     * @param {Function} handler
     * @returns {Function} Returns function that checks the route was requested and the handler responded without error.
     */
    handleNext (method, path, handler) {

        let requestReceived = false;
        let error;

        const cancel = this._addOnetimeHandler(method, path, async (ctx, next) => {
            requestReceived = true;
            try {
                await handler(ctx, next);
            } catch (handleError) {
                error = handleError;
            }
        });

        return this._registerChecker(() => {
            cancel();
            if (!requestReceived) {
                error = new Error(`Mock api didn't receive expected ${method.toUpperCase()} request to '${path}' path.`);
            }
            if (error) {
                throw error;
            }
        });
    }

    /**
     * Adds one-time check. The checker will fail in case of any request to the method and path.
     * The checks registered using 'notReceive' method.
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @param {string} method
     * @param {string} path
     * @returns {Function} Returns function that checks the route was NOT requested.
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
            if (!pending) {
                return next();
            }
            disableHandler();
            await handler(ctx, next);
        });

        return disableHandler;
    }

    /**
     * Add general handler that respond to all method and path requests.
     *
     * @param {string} method
     * @param {string} path
     * @param {Function} handler
     */
    handle (method, path, handler) {
        this._commonHanlersRouter[method.toLowerCase()](path, handler);
    }

    reset () {
        this._nextHandlersRouter = new Router();
        this._pendingCheckers = [];
    }

}

module.exports = MockServer;
