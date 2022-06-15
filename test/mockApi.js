'use strict';

const MockedServer = require('../dist').default;
const { url } = require('./mockApiUrlAndPort');

class MockApi extends MockedServer {

    constructor () {
        super(url);

        this.generalEndpoint = this.get('/general-endpoint/:resourceId?', (ctx) => {
            ctx.state.paramsInDefaultHandler = ctx.params;
            ctx.body = { endpoint: 1 };
        });

        this.putEndpointGeneralPath = this.put('/general-endpoint/:resourceId?', (ctx) => {
            ctx.state.paramsInDefaultHandler = ctx.params;
            ctx.body = { calledMethod: 'put' };
        });

    }

}

module.exports = new MockApi();
