'use strict';

const url = require('url');
const express = require('express');
const Router = require('express').Router;
const bodyParser = require('body-parser');
const assert = require('assert');
const pathToRegexp = require('path-to-regexp');


class MockServer {

    constructor (urlOrPort, done) {

        if (typeof urlOrPort === 'number') {
            this._port = urlOrPort;

        } else {
            const parsed = url.parse(urlOrPort);
            this._port = parsed.port;
        }

        this._app = express();
        this._app.use(bodyParser.json());

        this._server = this._app.listen(this._port, () => {
            done();
        });

        this._handlers = [];

        this._app.use((req, res) => {

            const currentHandler = this._handlers.shift();
            if (!currentHandler) {
                throw new Error('No handler registered.');
            }

            const router = new Router();

            const method = currentHandler.method.toLowerCase();
            router[method](currentHandler.path, (req, res) => {
                currentHandler.handler(req, res);
                currentHandler.resolve();
            });

            router.handle(req, res, () => {
                let error = new Error('The path or method does not match');
                currentHandler.reject(error);
                throw error;
            });

        });
    }

    assertAllHandlersProcessed () {
        assert.equal(this._handlers.length, 0, 'Not all handlers has been processed.');
    }

    handleNext (method, path, handler) {
        return new Promise((resolve, reject) => {
            this._handlers.push({ method, path, handler, resolve, reject });
        });
    }

    reset (done) {
        this._handlers.splice(0, this._handlers.length);
        done();
    }

    close (done) {
        this._server.close();
        done();
    }

}

module.exports = MockServer;
