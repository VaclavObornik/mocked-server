'use strict';

const MockedServer = require('../').default; // todo how to get rid of default?
const { url } = require('./mockApiUrlAndPort');

class MockApi extends MockedServer {

    constructor () {
        super(url);

        this.generalEndpoint = this.get('/general-endpoint/:resourceId?', (ctx) => {
            ctx.body = { endpoint: 1 };
        });

    }

}

module.exports = new MockApi();
