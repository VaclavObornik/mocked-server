'use strict';

const assert = require('assert');
const { describe, it } = require('mocha');
const supertest = require('supertest');

const MockedServer = require('../dist').default;
const { url: mockApiUrl, port: mockApiPort } = require('./mockApiUrlAndPort');
const mockApi = require('./mockApi');

const request = supertest(mockApiUrl);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('handler error response', () => {

    it('should respond 500 with the error when a one-time handler throws', async () => {
        const checker = mockApi.generalEndpoint.handleNext(() => {
            throw new Error('assertion failed in handler');
        });

        await request.get('/general-endpoint')
            .expect(500, { error: 'Error: assertion failed in handler' });

        assert.throws(checker, /assertion failed in handler/);
    });

});

describe('concurrent requests with an async matcher', () => {

    it('should let a one-time handler process only one of two concurrent requests', async () => {
        const checker = mockApi.generalEndpoint
            .matching(async () => {
                await delay(50);
                return true;
            })
            .handleNext((ctx) => {
                ctx.status = 201;
                ctx.body = 'consumed';
            });

        const [first, second] = await Promise.all([
            request.get('/general-endpoint'),
            request.get('/general-endpoint')
        ]);

        const statuses = [first.status, second.status].sort();
        assert.deepStrictEqual(statuses, [200, 201], 'exactly one request should be consumed by the one-time handler');
        checker();
    });

});

describe('object matcher edge cases', () => {

    it('should treat an explicitly undefined matcher prop as omitted', async () => {
        mockApi.generalEndpoint
            .matching({ query: undefined })
            .handleNext((ctx) => {
                ctx.status = 201;
                ctx.body = 'matched';
            });

        await request.get('/general-endpoint')
            .expect(201, 'matched');
    });

});

describe('runAllCheckers aggregation', () => {

    it('should report all failed checks at once', () => {
        mockApi.generalEndpoint.handleNext();
        mockApi.putEndpointGeneralPath.handleNext();

        assert.throws(
            () => mockApi.runAllCheckers(),
            (err) => {
                assert(err instanceof AggregateError, 'expected an AggregateError');
                assert.strictEqual(err.errors.length, 2);
                assert.match(err.message, /2 mocked-server checks failed/);
                assert.match(err.message, /GET request/);
                assert.match(err.message, /PUT request/);
                return true;
            }
        );
    });

});

describe('checker consulted while the handler is still running', () => {

    it('should throw an explanatory error instead of passing silently', async () => {
        let releaseHandler;
        const gate = new Promise((resolve) => (releaseHandler = resolve));

        const checker = mockApi.generalEndpoint.handleNext(async (ctx) => {
            await gate;
            ctx.status = 200;
            ctx.body = {};
        });

        const requestPromise = request.get('/general-endpoint').then((res) => res);
        await delay(100); // let the request reach the handler

        assert.throws(checker, /handler has not finished yet/);

        releaseHandler();
        await requestPromise;
    });

    it('should propagate a late handler error through an awaited waitForNext checker', async () => {
        let releaseHandler;
        const gate = new Promise((resolve) => (releaseHandler = resolve));

        const awaitable = mockApi.generalEndpoint.waitForNext(async () => {
            await gate;
            throw new Error('late assertion error');
        });

        const requestPromise = request.get('/general-endpoint').then((res) => res);
        await delay(100); // the request was received, but the handler has not finished

        const verification = assert.rejects(async () => {
            await awaitable;
        }, /late assertion error/);

        releaseHandler();
        await verification;
        await requestPromise;
    });

});

describe('MockServer construction and lifecycle', () => {

    it('should reject readyPromise when the port is already in use, without crashing the process', async () => {
        const originalConsoleError = console.error;
        console.error = () => {}; // silence the intentional 'unable to start' report
        try {
            const conflicting = new MockedServer(mockApiPort, { testRunner: 'none' });
            await assert.rejects(conflicting.readyPromise, /EADDRINUSE/);
        } finally {
            console.error = originalConsoleError;
        }
    });

    it('should validate the testRunner option', () => {
        assert.throws(
            () => new MockedServer(9999, { testRunner: 'invalid' }),
            /Invalid "testRunner" option "invalid"/
        );
    });

    it('should throw a clear error for an invalid URL', () => {
        assert.throws(() => new MockedServer('not a url'), /Invalid URL "not a url"/);
    });

    it('should throw when the URL has no port', () => {
        assert.throws(() => new MockedServer('ftp://localhost/'), /URL does not contain a port number/);
    });

    it('should support port 0 and expose the actually bound port', async () => {
        const server = new MockedServer(0, { testRunner: 'none' });
        await server.readyPromise;
        assert(server.port > 0, 'the real bound port should be exposed');

        await supertest(`http://127.0.0.1:${server.port}`)
            .get('/no-handler')
            .expect(404);

        await server.close();
    });

    it('should return the same promise from repeated start() calls', async () => {
        const server = new MockedServer(0, { testRunner: 'none' });
        const readyPromise = server.readyPromise;
        assert.strictEqual(server.start(), readyPromise);
        await readyPromise;
        await server.close();
    });

    it('should be able to start again after close', async () => {
        const server = new MockedServer(0, { testRunner: 'none' });
        await server.readyPromise;
        await server.close();

        await server.start();
        assert(server.port > 0);
        await supertest(`http://127.0.0.1:${server.port}`)
            .get('/no-handler')
            .expect(404);
        await server.close();
    });

    it('should allow start() to retry after a failed listen', async () => {
        const net = require('net');
        const blocker = net.createServer();
        await new Promise((resolve) => blocker.listen(0, resolve));
        const blockedPort = blocker.address().port;

        const originalConsoleError = console.error;
        console.error = () => {}; // silence the intentional 'unable to start' report
        let server;
        try {
            server = new MockedServer(blockedPort, { testRunner: 'none' });
            await assert.rejects(server.readyPromise, /EADDRINUSE/);
        } finally {
            console.error = originalConsoleError;
        }

        await new Promise((resolve) => blocker.close(resolve));

        await server.start(); // must attempt a fresh listen, not return the stale rejected promise
        await supertest(`http://127.0.0.1:${blockedPort}`)
            .get('/no-handler')
            .expect(404);
        await server.close();
    });

    it('should keep port assignable in subclasses as it was in v8.4', async () => {
        class LegacySubclass extends MockedServer {
            constructor () {
                super(0, { testRunner: 'none' });
                this.port = 12345; // v8.4 subclasses could use 'port' as a plain property
            }
        }
        const server = new LegacySubclass();
        assert.strictEqual(server.port, 12345);
        await server.readyPromise;
        await server.close();
    });

});
