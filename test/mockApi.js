'use strict';

const MockedServer = require('../src/MockedServer');
const { url } = require('./mockApiUrlAndPort');

const mockApi = new MockedServer(url);

mockApi.handle('GET', '/general-endpoint', async (ctx) => {
    ctx.body = { data: 'aaa' };
});

module.exports = mockApi;
