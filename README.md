
# mocked-server

Mock server built with real testing needs in mind.

Use it to stand in for a remote HTTP API that your tested code calls. The server binds to your test runner (`mocha` or `jest`) and automatically verifies after each test that all expected calls happened. Routing and request handling use [Koa](https://koajs.com/), so you write Koa-like request handlers.

Requires Node.js 18 or newer.

## Installation & Configuration

1. run:
```shell
npm i mocked-server -D
```

2. tell mocked-server which test runner you use — either in your package.json:
```json
{
    "mocked-server": {
        "testRunner": "mocha"
    }
}
```
or per server instance via a constructor option (overrides the package.json setting):
```javascript
new MockServer(3000, { testRunner: 'jest' });
```
Valid options for the `testRunner`: `mocha` / `jest` / `none`.

With `mocha` or `jest`, the server automatically starts before your tests, stops after them, resets one-time handlers before each test and verifies all pending checks after each test. With `none`, you control the lifecycle yourself (see [Manual lifecycle](#manual-lifecycle-testrunner-none)).

## Example

```javascript
const { MockServer } = require('mocked-server');

class SomeService extends MockServer {

    constructor () {

        // the MockServer will listen on localhost:3000;
        // point your tested code to this URL instead of the real API
        super(3000);

        // define an endpoint and store it as a member property:
        // all POST requests to /somePath/:id are handled by the default handler
        // unless a one-time handler is registered (shown in the following examples)
        this.endpoint = this.post('/somePath/:id', (ctx) => {
            ctx.body = { message: 'default response' };
            ctx.status = 200;
        });
    }

}

const myServer = new SomeService();
```
Assume we are testing a ```testedProcedure``` function (or an API) which should call SomeService:

```javascript

async function testedProcedure (id = 1) {
    // ...some logic calling SomeService via http request to localhost:3000
    // ...assume it will use the id as the endpoint's path parameter
}

describe('testedProcedure', () => {

    /**
     * This way we test the endpoint was called before the test ends.
     * In case the endpoint wasn't called, the test automatically fails!
     */
    it('should call our endpoint', async () => {
        myServer.endpoint.handleNext(); // the default handler will be used to respond to the endpoint call
        await testedProcedure();
    });

    /**
     * This way we test the endpoint was called before the test ends.
     * The first http call to the endpoint will be processed by the custom handler.
     */
    it('should call our endpoint - with custom handler', async () => {
        myServer.endpoint.handleNext((ctx) => {
            ctx.body = { message: 'very special message' };
            ctx.status = 201;
        });
        await testedProcedure(); // this call will receive the 'very special message' message
        await testedProcedure(); // this call will receive the 'default response' message
    });


    /**
     * We can register multiple handlers, each of them will process exactly one next request.
     * If the endpoint is called fewer times than expected, the test fails.
     */
    it('should call our endpoint multiple times', async () => {
        myServer.endpoint.handleNext((ctx) => {
            ctx.body = { message: 'first response' };
            ctx.status = 201;
        });
        myServer.endpoint.handleNext((ctx) => {
            ctx.body = { message: 'second response' };
            ctx.status = 201;
        });
        await testedProcedure(); // this call will receive the 'first response' message
        await testedProcedure(); // this call will receive the 'second response' message
        await testedProcedure(); // this call will receive the 'default response' message
    });

    /**
     * We can implement test-specific logic in the custom handler.
     * When a handler throws (a failed assertion for example), the mock responds
     * with status 500 and the error, and the error fails the test.
     */
    it('should use an authorization', async () => {
        myServer.endpoint.handleNext(async (ctx, next) => {
            assert.strictEqual(ctx.get('Authorization'), 'Bearer myToken');
            assert.strictEqual(ctx.params.id, 'expected-id-value');
            await next(); // this will forward the request to the default handler
        });
        await testedProcedure(); // this call will receive the 'default response' message
    });

    /**
     * We can test the testedProcedure will not call our endpoint.
     * If the endpoint is called, the test fails.
     */
    it('should not call the endpoint', async () => {
        myServer.endpoint.notReceive();
        await testedProcedure();
    });

    /**
     * We can check the endpoint was called at a specific time during the test.
     */
    it('should call the endpoint', async () => {
        const checker = myServer.endpoint.handleNext();
        await testedProcedure();
        checker(); // will throw if the endpoint has not been called yet
                   // or if the endpoint's handler threw an error (i.e., an assertion error)
        // ...rest of the test
    });

    /**
     * We can use the checker as an "expect" function for supertest.
     */
    it('should call the endpoint via API', async () => {

        const request = require('supertest');
        const express = require('express');

        const app = express();
        app.post('/endpoint-caller', function(req, res, next) {
            testedProcedure().then(() => {
                res.status(200).json({ name: 'john' });
            }, next);
        });

        await request(app)
            .post('/endpoint-caller')
            .expect(200)
            .expect(myServer.endpoint.handleNext()) // the returned checker can be passed as the
                                                    // supertest expectation, so it will be called
                                                    // right after the request finishes
                                                    // and checks that the endpoint has been called
    });

    /**
     * We can await the API call. This is useful in case we test code where
     * the endpoint is called on a time basis and we cannot simply say when.
     */
    it('should wait for the endpoint call', async () => {
        setTimeout(() => testedProcedure(), 1000);
        await myServer.endpoint.waitForNext(); // by the 'await', we can wait for the next endpoint call;
                                               // it will throw in case the handler throws an error (i.e., an assertion error);
                                               // if the endpoint is not called, the test will time out
        // ...rest of the test
    });

    /**
     * We can use 'matchers' to test specific endpoint calls.
     */
    it('should call our endpoint - with matcher', async () => {
        myServer.endpoint
            .matching((ctx) => ctx.params.id === '2')
            .handleNext((ctx) => {
                ctx.body = { message: 'received the id 2!' };
                ctx.status = 201;
            });

        await testedProcedure(1); // this call will receive the 'default response' message
        await testedProcedure(2); // this call will receive the 'received the id 2!' message
        await testedProcedure(3); // this call will receive the 'default response' message
    });

    /**
     * We can use 'matchingParams', 'matchingQuery', 'matchingHeaders', 'matchingBody' to test specific endpoint calls
     * - to decide whether params/query/body match or not, lodash's isMatch function is used, see https://lodash.com/docs/#isMatch
     * - headers comparison is case-insensitive, because the HTTP standard says so
     * - values provided to matching params/query/headers are stringified before comparison
     */
    it('should call our endpoint - with matching helpers', async () => {
        myServer.endpoint
            .matchingParams({ myPathParam: 'someValue' })
            .matchingQuery({ myQueryParam: 1 })
            .matchingHeaders({ Authorization: 'token-1' })
            .matchingBody({ bodyProperty: 'expectedValue' })
            .handleNext((ctx) => {
                ctx.body = { message: 'received expected request!' };
                ctx.status = 201;
            });

        await testedProcedure();
    });

});
```

## Custom matcher shortcuts: `extend`

When the same matcher appears in many tests, give it a name with `extend`. It returns a new route
with your helper methods added; the original route is not changed.

```javascript
class SomeService extends MockServer {

    constructor () {
        super(3000);

        this.endpoint = this.post('/somePath/:id', (ctx) => {
            ctx.body = { message: 'default response' };
        }).extend((route) => ({
            withId (id) {
                return route.matchingParam('id', id);
            },
            authorizedBy (token) {
                return route.matchingHeader('Authorization', `Bearer ${token}`);
            },
        }));
    }

}
```

The helpers stay chainable — with the built-in matchers and with each other:

```javascript
myServer.endpoint
    .withId(42)
    .authorizedBy('myToken')
    .matchingBody({ some: 'property' }) // built-in matchers still work
    .withId(42)                         // ...and your helpers stay available after them
    .handleNext();
```

Notes:
- `extend` can be called repeatedly; later extensions can use the earlier helpers.
- The extender function runs again for every derived route — keep it pure (no side effects)
  and synchronous (an async extender throws). Create derived routes only inside the returned
  helpers; calling `matching*` or `extend` in the extender body itself throws an error.
- A helper name that conflicts with an existing route member (like `handleNext`) or with an
  earlier extension throws an error.
- In TypeScript, the helpers and the chaining are fully typed (see the `ExtendedRoute` and `RouteExtender` exported types).

## Failed checks

When a one-time handler is not called (or a `notReceive()` check fails), the test fails automatically after it finishes. If several checks fail within one test, they are reported together as an `AggregateError`.

## Manual lifecycle (testRunner: 'none')

With `testRunner: 'none'`, the server starts automatically but you drive the test integration yourself:

```javascript
const { MockServer } = require('mocked-server');

const server = new MockServer(0, { testRunner: 'none' }); // port 0 picks a random free port

await server.start();          // resolves once the server is listening (same as `await server.readyPromise`)
console.log(server.port);      // the actually bound port

// wire these into your own test hooks:
server.reset();                // before each test: removes one-time handlers and pending checks
server.runAllCheckers();       // after each test: throws if some checks did not pass

await server.close();          // after all tests
```

## Debugging

Run your tests with the `DEBUG=mocked-server` environment variable to log the server lifecycle and request handling.
