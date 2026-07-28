'use strict';

const supertest = require('supertest');
const MockedServer = require('../../dist').default;

const port = 9392;
// the constructor option overrides the package.json setting, which is 'mocha' in this repo
const server = new MockedServer(port, { testRunner: 'jest' });
const endpoint = server.get('/thing/:id', (ctx) => {
    ctx.status = 200;
    ctx.body = { default: true };
});

const request = supertest(`http://127.0.0.1:${port}`);

describe('jest binding', () => {

    it('should start the server and process a one-time handler', async () => {
        await request.get('/thing/1')
            .expect(endpoint.handleNext((ctx) => {
                ctx.status = 201;
                ctx.body = { custom: true };
            }))
            .expect(201, { custom: true });
    });

    it('should reset one-time handlers between tests and use the default handler', async () => {
        await request.get('/thing/2')
            .expect(200, { default: true });
    });

    it('should support awaiting waitForNext', async () => {
        setTimeout(() => request.get('/thing/3').end(() => {}), 50);
        await endpoint.waitForNext();
    });

});
