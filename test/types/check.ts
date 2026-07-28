/**
 * Compile-only checks of the published typings; run via `npm run test:types`.
 */
import MockServerDefault, { MockServer, MockServerOptions, Route } from '../../dist';
import { Context } from 'koa';

declare const route: Route;

// object matchers accept any subset of the supported props
route.matching({ query: { a: 1 } });
route.matching({ body: { nested: /pattern/ } });
route.matching({ params: { id: '1' }, headers: { authorization: (value: any) => value === 'token' } });
route.matching((ctx: Context) => ctx.path === '/x');

const options: MockServerOptions = { testRunner: 'none' };
const server = new MockServer(3000, options);
const viaUrl: MockServerDefault = new MockServerDefault('http://localhost:3000');

// the request body typing comes from the published koa augmentation
server.get('/path', (ctx) => {
    ctx.body = { value: ctx.request.body?.property };
});

export async function lifecycle (): Promise<void> {
    await server.start();
    await server.readyPromise;
    await viaUrl.close();
    const boundPort: number = server.port;
    void boundPort;
}
