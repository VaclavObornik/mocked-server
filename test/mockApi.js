'use strict';

const MockedServer = require('../src/MockedServer');
const { url } = require('./mockApiUrlAndPort');

class MockApi extends MockedServer {

    constructor () {
        super(url);

        /**
         * @type {Route}
         */
        this.generalEndpoint = this.route('GET', '/general-endpoint', (ctx) => {
            ctx.body = { endpoint: 1 };
        });

    }

}

module.exports = new MockApi();
