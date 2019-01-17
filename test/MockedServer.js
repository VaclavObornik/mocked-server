'use strict';

const assert = require('assert');
const { describe, it } = require('mocha');
const supertest = require('supertest');

const { url: mockApiUrl } = require('./mockApiUrlAndPort');
const mockApi = require('./mockApi');

const request = supertest(mockApiUrl);

describe('MockedServer', function () {

    it('should work', async () => {

        const responseGeneral = await request.get('/general-endpoint')
            .expect(200, { data: 'aaa' });

        const responseOverrided = await request.get('/general-endpoint')
            .expect(mockApi.handleNext('GET', '/general-endpoint', async (ctx) => {
                ctx.body = {};
            }))
            .expect(200);

        const responseFail = await request.get('/fail')
            .expect(mockApi.handleNext('GET', '/fail', async (ctx) => {
                ctx.status = 500;
                ctx.body = { error: 'some error' };
            }))
            .expect(500);


        const response404 = await request.get('/not-existing-path')
            .expect(404);

        await assert.rejects(
            async () => {
                await request.get('/not-success-path')
                    .expect(mockApi.handleNext('GET', '/not-success-path', async (ctx) => {
                        assert.strictEqual(false, true, 'assertion fail message');
                    }));
            },
            /assertion fail message/,
            'Expect function should fail when the handleNext fails'
        );


        await assert.rejects(
            async () => {
                await request.get('/some-unknown-path')
                    .expect(mockApi.handleNext('GET', '/success-path', async (ctx) => {
                        ctx.body = { success: true };
                    }));
            },
            /Mock api didn't receive expected GET request to '\/success-path' path/,
            'Expect function should fail when expected call was not received'
        );


        mockApi.handleNext('GET', '/success-path', async (ctx) => {
            ctx.body = { success: true };
        });
        await assert.throws(
            () => mockApi.runAllCheckers(),
            /Mock api didn't receive expected GET request to '\/success-path' path/,
            'The runAllCheckers should check all next handlers'
        );

        await request.get('/some-path')
            .expect(mockApi.notReceive('GET', '/unexpected-path'));

        await assert.rejects(
            async () => {
                await request.get('/success-path')
                    .expect(mockApi.notReceive('GET', '/success-path'));
            },
            /Mock api received unexpected GET request to '\/success-path' path/,
            'Expect function should fail when API receives not expected request'
        );

    });

});
