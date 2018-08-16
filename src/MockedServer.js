'use strict';

const url = require('url');
const express = require('express');
const Router = require('express').Router;
const bodyParser = require('body-parser');
const assert = require('assert');


class MockServer {

    constructor (urlOrPort, done) {

        if (typeof urlOrPort === 'number') {
            this._port = urlOrPort;

        } else {
            const parsed = url.parse(urlOrPort);
            this._port = parsed.port;
        }

        this._app = express();
        this._app.use(bodyParser.text({ type: 'text/*' }));
        this._app.use(bodyParser.json({ type: '*/json' }));

        this._server = this._app.listen(this._port, () => {
            done();
        });

        this._nextHandlersCounter = 0;
        this._nextHandlersRouter = new Router();
        this._app.use((req, res, next) => {
            this._nextHandlersRouter.handle(req, res, next);
        });

        this._commonHanlersRouter = new Router();
        this._app.use(this._commonHanlersRouter);

        this._app.use((req, res) => {
            let error = new Error(`No handler match the "[${req.method}] ${req.path}" request`);
            res.status(500).send({
                error: error.toString()
            });
        });
    }

    assertAllNextHandlersProcessed () {
        assert.equal(this._nextHandlersCounter, 0, 'Not all next-handlers has been processed.');
    }

    handleNext (method, path, handler) {
        this._nextHandlersCounter++;
        var alreadyUsed = false;
        return new Promise((resolve, reject) => {
            this._nextHandlersRouter[method.toLowerCase()](path, (req, res, next) => {
                if (alreadyUsed) {
                    return next();
                }
                this._nextHandlersCounter--;
                alreadyUsed = true;
                Promise.resolve(handler(req, res, next)).then(() => resolve(), reject);
            });
        });
    }

    handle (method, path, handler) {
        this._commonHanlersRouter[method.toLowerCase()](path, handler);
    }

    reset (done) {
        this._nextHandlersRouter = new Router();
        this._nextHandlersCounter = 0;
        done();
    }

    close (done) {
        this._server.close();
        done();
    }

}

module.exports = MockServer;
