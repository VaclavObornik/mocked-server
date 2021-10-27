
# mocker-server

Mock server built with real testing needs in mind.

The ``mocha`` or ``jest`` test runner is needed to be used as the MockedServer automatically binds "checkers" to test all assertions were fulfilled during all tests.
The MockedServer uses Koa inside for routing and request handling, so you write Koa-like request handlers.

## Example

```javascript
const { MockServer } = require('mocked-server');

class SomeService extends MockedServer {
    
    constructor () {
        
        // the MockService will listen on localhost:3000, 
        // you need to direct your tested code to use this URL instead of real API 
        this.super(3000);
        
        // define an endpoint and store it as a member property
        // all POST request to /somePath will be handled by the default handler
        // unless you specify 
        this.endpoint = this.post('/somePath/:id', (ctx) => {
            ctx.body = { message: 'default response' };
            ctx.status = 200;
        });
    }
    
}

const myServer = new MockedService();
```
Assume we are testing a ```testedProcedure``` function (or an API) which should call SomeService:

```javascript

async function testedProcedure (id = 1) {
    // ...some logic calling SomeService via http request to localhost:3000
    // ... assume it will use the id as endpoint's path parameter
}

describe('testedProcedure', () => {

    /**
     * This way we test the endpoint was called before the test ends
     * In case the endpoint wasn't called, the test automatically fail!
     */
    it('should call our endpoint', async () => {
        myServer.endpoint.handleNext(); // default handler will be used to respond the endpoint call
        await testedProcedure();
    });

    /**
     * This way we test the endpoint was called before the test ends
     * The first http call to the endpoint will be processed by the custom handler
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
     * We can register multiple handlers, each of them will process exactly one next request
     * If the endpoint is called less-times than expected, the test fails
     */
    it('should call our endpoint - with custom handler', async () => {
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
     * We can implement a test-specific logic in the custom handler
     */
    it('should use an authorization', async () => {
        myServer.endpoint.handleNext(async (ctx) => {
            assert(ctx.get('Authorization'), 'Bearer myToken');
            assert.strictEqual(ctx.params.id, 'expected-id-value');
            await next(); // this will forward the request to the default handler
        });
        await testedProcedure(); // this call will receive the 'default response' message
    });

    /**
     * We can test the testedProcedure will not call our endpoint
     * If the endpoint is called, the test fails
     */
    it('should not call the endpoint', async () => {
        myServer.endpoint.notReceive();
        await testedProcedure();
    });

    /**
     * We can check the endpoint was called in a specific time during the test
     */
    it('should call the endpoint', async () => {
        const checker = myServer.endpoint.handleNext();
        await testedProcedure();
        checker(); // will throw if the endpoint has not been called yet
                   // or the endpoint's handler throwed an error (i.e., an assertion error)
        // ...rest of the test
    });

    /**
     * We can use the cecker as "expect" function for supertest
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
            .expect(myServer.endpoint.handleNext()) // the result checker can be passed as the
                                                    // supertest expectation, so it will be called
                                                    // right after the request finish
                                                    // and check if the endpoint has been called   
    });

    /**
     * We can await for the API call. This is usefull in case we test an code where 
     * the endpoint is called on time-basis and we cannot simply say when
     */
    it('should not call the endpoint', async () => {
        setTimeout(() => testedProcedure(), 1000);
        await myServer.endpoint.handleNext(); // by the 'await', we can wait for the next endpoint call
                                              // it will throw in case the handler throws an error (i.e., an assertion error)
                                              // if the endpoint is not called, the test will time out
        // ...rest of the test
    });

    /**
     * We can use 'matchers' to test specific endpoint calls
     */
    it('should call our endpoint - with custom handler', async () => {
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

});
```




