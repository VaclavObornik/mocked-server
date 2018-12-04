'use strict';

const url = require('url');
const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-body');
const assert = require('assert');
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

        this._nextHandlersCounter = 0;
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
        assert.strictEqual(this._nextHandlersCounter, 0, 'Not all next-handlers has been processed.');
    }

    /**
     * @param {string} method
     * @param {string} path
     * @param {Function} handler
     * @returns {Function} Returns function that checks the handler was called and responded successfully
     */
    handleNext (method, path, handler) {
        this._nextHandlersCounter++;
        let alreadyUsed = false;
        let error;

        this._nextHandlersRouter[method.toLowerCase()](path, async (ctx, next) => {
            if (alreadyUsed) {
                return next();
            }
            this._nextHandlersCounter--;
            alreadyUsed = true;

            try {
                await handler(ctx, next);
            } catch (e) {
                error = e;
            }
        });

        const stack = new Error().stack.split('\n').slice(2).join('\n');
        // TODO continue stack from error if is caused by the handler

        return () => {
            if (!alreadyUsed) {
                this._nextHandlersCounter--;
                alreadyUsed = true;
                error = new Error(`Mock api didn't receive expected ${method.toUpperCase()} request to '${path}' path.`);
            }
            if (error) {
                // error.stack = stack;
                throw error;
            }
        };
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
        this._nextHandlersCounter = 0;
    }

}

module.exports = MockServer;
