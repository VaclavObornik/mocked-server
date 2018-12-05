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

        this._nextHandlerCheckers = [];
        this._nextHandlersRouter = new Router();
        this._app.use((ctx, next) => {
            this._nextHandlersRouter.routes()(ctx, next);
        });

        this._commonHanlersRouter = new Router();
        this._app.use(this._commonHanlersRouter.routes());

        this._app.use((ctx) => {
            const error = new Error(`No handler match the "[${ctx.req.method}] ${ctx.req.path}" request`);
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

        mocha.afterEach(() => this.assertAllNextHandlersProcessed());
    }

    assertAllNextHandlersProcessed () {
        this._nextHandlerCheckers.forEach(checker => checker());
    }

    /**
     * @param {string} method
     * @param {string} path
     * @param {Function} handler
     * @returns {Function} Returns function that checks the handler was called and responded successfully
     */
    handleNext (method, path, handler) {
        let handlerCalled = false;
        let error;
        let checker;

        const removeChecker = () => {
            if (checker) {
                const checkIndex = this._nextHandlerCheckers.indexOf(checker);
                this._nextHandlerCheckers.splice(checkIndex, 1);
            }
        };

        // const stack = new Error().stack.split('\n').slice(2).join('\n');
        checker = () => {
            removeChecker();
            if (!handlerCalled) {
                handlerCalled = true;
                error = new Error(`Mock api didn't receive expected ${method.toUpperCase()} request to '${path}' path.`);
            }
            if (error) {
                // error.stack = stack;
                throw error;
            }
        };

        this._nextHandlerCheckers.push(checker);

        this._nextHandlersRouter[method.toLowerCase()](path, async (ctx, next) => {
            if (handlerCalled) {
                return next();
            }
            handlerCalled = true;

            try {
                await handler(ctx, next);
            } catch (e) {
                error = e;
            }
        });

        return checker;
    }

    /**
     * @param {string} method
     * @param {string} path
     * @param {Function} handler
     */
    handle (method, path, handler) {
        this._commonHanlersRouter[method.toLowerCase()](path, handler);
    }

    reset () {
        this._nextHandlersRouter = new Router();
        this._nextHandlerCheckers = [];
    }

}

module.exports = MockServer;
