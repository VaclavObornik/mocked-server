'use strict';

const assert = require('assert');
const { describe, it } = require('mocha');
const supertest = require('supertest');

const { url: mockApiUrl } = require('./mockApiUrlAndPort');
const mockApi = require('./mockApi');

const request = supertest(mockApiUrl);


describe('default handler', () => {

    it('can be called multiple times', async () => {

        // NOTE the router is already defined in ./mockApi.js

        await request.get('/general-endpoint')
            .expect(200, { endpoint: 1 });

        await request.get('/general-endpoint')
            .expect(200, { endpoint: 1 });
    });

});

describe('handleNext', () => {

    it('should precede to defaultHandler and can be called only once', async () => {

        await request.get('/general-endpoint')
            .expect(mockApi.generalEndpoint.handleNext((ctx) => {
                ctx.status = 201;
                ctx.body = 'onetimeHandler';
            }))
            .expect(201, 'onetimeHandler');

        await request.get('/general-endpoint')
            .expect(200, { endpoint: 1 });
    });

    it('should be able to just check a request comes and forward request to defaultHandler', async () => {

        await request.get('/general-endpoint')
            .expect(mockApi.generalEndpoint.handleNext())
            .expect(200, { endpoint: 1 });

        await request.get('/general-endpoint')
            .expect(200, { endpoint: 1 });
    });

    it('should not forward request to a next handleNext handler', async () => {

        const handleNextCheck1 = mockApi.generalEndpoint.handleNext();

        const handleNextCheck2 = mockApi.generalEndpoint.handleNext((ctx) => {
            ctx.body = { endpoint: 'myCustomBody' };
        });

        await request.get('/general-endpoint')
            .expect(handleNextCheck1)
            .expect(200, { endpoint: 1 });

        await request.get('/general-endpoint')
            .expect(handleNextCheck2)
            .expect(200, { endpoint: 'myCustomBody' });
    });

    it('should propagate error by checker', async () => {

        await assert.rejects(
            async () => {
                await request.get('/general-endpoint')
                    .expect(mockApi.generalEndpoint.handleNext(async () => {
                        assert.strictEqual(false, true, 'assertion fail message');
                    }));
            },
            /assertion fail message/,
            'Expect function should fail when the handleNext fails'
        );
    });

    it('should fail by checker when no request came', async () => {

        await assert.rejects(
            async () => {
                await request.get('/some-unknown-path')
                    .expect(mockApi.generalEndpoint.handleNext(async (ctx) => {
                        ctx.body = { success: true };
                    }));
            },
            /Mock api didn't receive expected GET request to '\/general-endpoint\/:resourceId\?' path/,
            'Expect function should fail when expected call was not received'
        );
    });

    it('should be able to process async awaited handler', async () => {
        await request.get('/general-endpoint')
            .expect(mockApi.generalEndpoint.handleNext(async (ctx, next) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                await next();
            }))
            .expect(200, { endpoint: 1 });
    });

    it('should return checker which is thenable with promise resolved once the handler is called', async () => {

        const interval = 300;
        const start = Date.now();

        setTimeout(async () => {
            await request.get('/general-endpoint');
        }, interval);

        await mockApi.generalEndpoint.handleNext((ctx) => {
            ctx.body = {};
            ctx.status = 200;
        });

        assert(Date.now() - start >= interval);
    });

    it('should return checker which is thenable with promise rejected by error', async () => {

        const interval = 300;
        const start = Date.now();

        setTimeout(async () => {
            await request.get('/general-endpoint');
        }, interval);

        let checker;

        await assert.rejects(
            async () => {
                checker = mockApi.generalEndpoint.handleNext(() => {
                    throw new Error('Bad request');
                });

                await checker;
            },
            /Bad request/,
            'Promise from handleNext should propagate error'
        );

        assert(Date.now() - start >= interval);
    });

    it('should be able to receive text requests', async () => {
        await request.get('/general-endpoint')
            .set({ 'Content-Type': 'text/plain' })
            .send('articleText')
            .expect(mockApi.generalEndpoint.handleNext((ctx) => {
                assert.strictEqual(ctx.request.body, 'articleText');
            }));
    });

    it('should be able to receive xml as text requests', async () => {
        await request.get('/general-endpoint')
            .set({ 'Content-Type': 'text/xml' })
            .send('articleText')
            .expect(mockApi.generalEndpoint.handleNext((ctx) => {
                assert.strictEqual(ctx.request.body, 'articleText');
            }));
    });

    describe('notReceive', () => {

        it('should fail when any request came to the endpoint', async () => {

            await assert.rejects(
                async () => {
                    await request.get('/general-endpoint')
                        .expect(mockApi.generalEndpoint.notReceive());
                },
                /Mock api received unexpected GET request to '\/general-endpoint\/:resourceId\?' path/,
                'Expect function should fail when API receives not expected request'
            );
        });

        it('should be ok when no request came to endpoint', async () => {
            await request.get('/general-endpoint-wrong-path')
                .expect(mockApi.generalEndpoint.notReceive());
        });

    });

     describe('matching', () => {

        it('should be possible to use matcher', async () => {

            mockApi.generalEndpoint
                .matching(({ params: { resourceId }}) => resourceId === '99')
                .handleNext((ctx) => {
                    ctx.status = 202;
                    ctx.body = 'onetimeHandler2';
                });

            mockApi.generalEndpoint.handleNext((ctx) => {
                ctx.status = 201;
                ctx.body = 'onetimeHandler1';
            });

            await request.get('/general-endpoint')
                .expect(201, 'onetimeHandler1');

            await request.get('/general-endpoint')
                .expect(200, { endpoint: 1 });

            await request.get('/general-endpoint/99')
                .expect(202, 'onetimeHandler2');

        });
    });

});

describe('MockedServer', () => {

    it('should return 404 to not-existing path request', async () => {
        await request.get('/not-existing-path')
            .expect(404);
    });


    describe('runAllCheckers', () => {

        it('should call not-called checker', async () => {
            mockApi.generalEndpoint.handleNext();
            await assert.throws(
                () => mockApi.runAllCheckers(),
                /Mock api didn't receive expected GET request to '\/general-endpoint\/:resourceId\?' path/,
                'The runAllCheckers should check all next handlers'
            );
        });

        it('should call multiple not-called checkers', async () => {
            mockApi.generalEndpoint.notReceive();
            mockApi.generalEndpoint.handleNext();
            mockApi.generalEndpoint.notReceive();
            await assert.throws(
                () => mockApi.runAllCheckers(),
                /Mock api didn't receive expected GET request to '\/general-endpoint\/:resourceId\?' path/,
                'The runAllCheckers should check all next handlers'
            );
        });

    });

});

