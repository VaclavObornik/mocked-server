"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const url_1 = __importDefault(require("url"));
const koa_1 = __importDefault(require("koa"));
const koa_router_1 = __importDefault(require("koa-router"));
const koa_bodyparser_1 = __importDefault(require("koa-bodyparser"));
const mocha_1 = __importDefault(require("mocha"));
const Route_1 = __importDefault(require("./Route"));
class MockServer {
    /**
     * @param {string|number} urlOrPort
     */
    constructor(urlOrPort) {
        this._app = new koa_1.default();
        this._pendingCheckers = new Array();
        this._nextHandledRequests = new WeakMap();
        this._nextHandlersRouter = new koa_router_1.default();
        this._commonHandlersRouter = new koa_router_1.default();
        if (typeof urlOrPort === 'number') {
            this._port = urlOrPort;
        }
        else {
            const parsed = url_1.default.parse(urlOrPort);
            if (!parsed.port) {
                throw new Error('URL does not contains port number');
            }
            this._port = parseInt(parsed.port);
        }
        this._app.use(koa_bodyparser_1.default({
            enableTypes: ['json', 'form', 'text'],
            extendTypes: {
                text: ['text/xml']
            }
        }));
        this._app.use(async (ctx, next) => {
            await this._nextHandlersRouter.routes()(ctx, next);
        });
        this._app.use(this._commonHandlersRouter.routes());
        this._app.use((ctx) => {
            const error = new Error(`No handler match the "[${ctx.request.method}] ${ctx.request.path}" request`);
            ctx.status = 404;
            ctx.body = { error: error.toString() };
        });
        this._bindMocha();
    }
    _bindMocha() {
        let server;
        mocha_1.default.before((done) => {
            server = this._app.listen(this._port, () => done());
        });
        mocha_1.default.after(() => server && server.close());
        mocha_1.default.beforeEach(() => this.reset());
        const runAllCheckers = this.runAllCheckers.bind(this);
        mocha_1.default.afterEach(function () {
            try {
                runAllCheckers();
            }
            catch (err) {
                // @ts-ignore
                this.test.error(err);
            }
        });
    }
    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the '_handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @returns {IChecker} Returns function that checks the route was requested and the handler responded without error.
     */
    _handleNext(method, path, matcher, handler = (ctx, next) => next()) {
        let requestReceived = false;
        let error;
        let wasPromiseUsed = false;
        let resolvePromise;
        let rejectPromise;
        const promise = new Promise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });
        const cancel = this._addOnetimeHandler(method, path, matcher, async (ctx, next) => {
            requestReceived = true;
            try {
                await handler(ctx, next);
                if (wasPromiseUsed) {
                    resolvePromise();
                }
            }
            catch (handleError) {
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
            then(onfulfilled, onrejected) {
                if (!wasPromiseUsed) {
                    unregister();
                    wasPromiseUsed = true;
                    if (error) {
                        rejectPromise(error);
                    }
                    else if (requestReceived) {
                        resolvePromise();
                    }
                }
                return promise.then(onfulfilled, onrejected);
            }
        });
    }
    _notReceive(method, path, matcher) {
        let error;
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
     * Runs all not-called checkers.
     */
    runAllCheckers() {
        // slice because of the original array is being changed during the iteration
        this._pendingCheckers.slice().forEach(checker => checker());
    }
    /**
     * Add general handler that respond to all method and path requests.
     */
    _handle(method, path, handler) {
        this._commonHandlersRouter[this._lowercaseMethod(method)](path, handler);
        this._commonHandlersRouter['put'](path, handler);
    }
    /**
     * Removes all registered one-time handlers and pending checkers
     */
    reset() {
        this._nextHandlersRouter = new koa_router_1.default();
        this._pendingCheckers = [];
    }
    get(path, defaultHandler) {
        return this.route('GET', path, defaultHandler);
    }
    post(path, defaultHandler) {
        return this.route('POST', path, defaultHandler);
    }
    put(path, defaultHandler) {
        return this.route('PUT', path, defaultHandler);
    }
    patch(path, defaultHandler) {
        return this.route('PATCH', path, defaultHandler);
    }
    delete(path, defaultHandler) {
        return this.route('DELETE', path, defaultHandler);
    }
    link(path, defaultHandler) {
        return this.route('LINK', path, defaultHandler);
    }
    unlink(path, defaultHandler) {
        return this.route('UNLINK', path, defaultHandler);
    }
    head(path, defaultHandler) {
        return this.route('HEAD', path, defaultHandler);
    }
    options(path, defaultHandler) {
        return this.route('OPTIONS', path, defaultHandler);
    }
    all(path, defaultHandler) {
        return this.route('ALL', path, defaultHandler);
    }
    route(method, path, defaultHandler) {
        if (defaultHandler) {
            this._handle(method, path, defaultHandler);
        }
        return new Route_1.default(this, method, path);
    }
    _registerChecker(callback) {
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
    _lowercaseMethod(method) {
        return method.toLowerCase();
    }
    _addOnetimeHandler(method, path, matcher, handler) {
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
exports.default = MockServer;
//# sourceMappingURL=MockedServer.js.map