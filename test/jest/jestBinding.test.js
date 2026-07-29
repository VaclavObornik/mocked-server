'use strict';

const supertest = require('supertest');
const MockedServer = require('../../dist').default;

// port 0 avoids collisions; the real port is known once the server is listening,
// so the supertest client is created lazily inside the tests
const server = new MockedServer(0, { testRunner: 'jest' });
const endpoint = server.get('/thing/:id', (ctx) => {
    ctx.status = 200;
    ctx.body = { default: true };
});

const request = () => supertest(`http://127.0.0.1:${server.port}`);

describe('jest binding', () => {

    it('should start the server and process a one-time handler', async () => {
        await request().get('/thing/1')
            .expect(endpoint.handleNext((ctx) => {
                ctx.status = 201;
                ctx.body = { custom: true };
            }))
            .expect(201, { custom: true });
    });

    it('should reset one-time handlers between tests and use the default handler', async () => {
        await request().get('/thing/2')
            .expect(200, { default: true });
    });

    it('should support awaiting waitForNext', async () => {
        setTimeout(() => request().get('/thing/3').end(() => {}), 50);
        await endpoint.waitForNext();
    });

});
