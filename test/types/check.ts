/**
 * Compile-only checks of the published typings; run via `npm run test:types`.
 */
import MockServerDefault, { ExtendedRoute, MockServer, MockServerOptions, Route, RouteExtender } from '../../dist';
import { Context } from 'koa';

declare const route: Route;

// object matchers accept any subset of the supported props
route.matching({ query: { a: 1 } });
route.matching({ body: { nested: /pattern/ } });
route.matching({ params: { id: '1' }, headers: { authorization: (value: any) => value === 'token' } });
route.matching((ctx: Context) => ctx.path === '/x');

// extend(): custom helpers are typed and stay chainable with built-in matchers
const extended = route.extend((r) => ({
    matchResourceId (resourceId: number) {
        return r.matchingParam('resourceId', resourceId);
    },
    describePath (): string {
        return 'just a non-Route helper';
    },
}));
extended.matchResourceId(1).matchingQueryParam('flag', 'on').matchResourceId(2).handleNext();
const description: string = extended.describePath();
void description;

// the helper types are exported
const namedExtender: RouteExtender<{ helper (): Route }> = (r) => ({ helper: () => r });
declare const namedExtended: ExtendedRoute<Route, { helper (): Route }>;
namedExtended.helper().matchingParam('id', 1).helper();
void namedExtender;

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
