'use strict';

const MockedServer = require('../'); // todo how to get rid of default?
const { url } = require('./mockApiUrlAndPort');

class MockApi extends MockedServer {

    constructor () {
        super(url);

        this.generalEndpoint = this.get('/general-endpoint/:resourceId?', (ctx) => {
            ctx.state.paramsInDefaultHandler = ctx.params;
            ctx.body = { endpoint: 1 };
        });

    }

}

module.exports = new MockApi();
