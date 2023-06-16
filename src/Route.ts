import {
    AwaitableChecker,
    Checker,
    Matcher,
    MatcherFunction,
    MatcherProp,
    Method,
    Path,
    TemplateMatcher,
    ValueToMatch,
} from './types';

import { mapKeys, isMatchWith, isFunction, isRegExp } from 'lodash';

import { MockServer } from "./MockServer";
import { Context, Middleware } from 'koa';


function testMatch (tested: Record<any, any>, template: TemplateMatcher, expectStrings: boolean): boolean {
    return isMatchWith(tested, template, (currentValue: any, expectedValue: any) => {
        if (isRegExp(expectedValue)) {
            return expectedValue.test(currentValue);
        }
        if (isFunction(expectedValue)) {
            return expectedValue(currentValue);
        }

        if (expectStrings) {
            return currentValue === `${expectedValue}`;
        }

        return undefined; // default isMatch behavior
    });
}

export class Route {

    constructor (
        private _mockServer: MockServer,
        private _method: Method,
        private _path: Path,
        private _matchers: MatcherFunction[] = []
    ) {}

    extend <X>(extend: (route: Route) => X): Route & X {
        const updatedRoute = new Route(this._mockServer, this._method, this._path, this._matchers);
        return Object.assign(updatedRoute, extend(updatedRoute));
    }

    a () {
        const extended = this.extend((route) => ({
            matchGlobalDataId (id: any) {
                // return this.matchingParam('globalDataId', id); //
                return route.matchingParam('globalDataId', id); // nad timhle uz nemohu zavolat matchGlobalDataId()
            }
        }));

        extended.matchGlobalDataId(1).

    }

    /**
     * Returns a customized Route instance, which will match only requests for which the Matcher function returns true
     */
    matching (matcher: Matcher): Route {

        if (isFunction(matcher)) {
            return new Route(this._mockServer, this._method, this._path, [
                ...this._matchers,
                matcher
            ]);
        }

        const validProps: MatcherProp[] = ['params', 'query', 'body', 'headers'];
        const usedProps = Object.keys(matcher);

        const invalidProps = usedProps.filter((prop) => !validProps.includes(prop as MatcherProp));
        if (invalidProps.length) {
            throw new Error(`Unknown matcher prop(s) "${invalidProps.join(', ')}". Only "${validProps.join(', ')}" are supported.`);
        }

        return (usedProps as MatcherProp[]).reduce((prev: Route, prop: MatcherProp): Route => {
            if (prop === 'headers') {
                return prev.matchingHeaders(matcher[prop]);
            }
            if (prop === 'params') {
                return prev.matchingParams(matcher[prop]);
            }
            if (prop === 'query') {
                return prev.matchingQuery(matcher[prop]);
            }
            if (prop === 'body') {
                return prev.matchingBody(matcher[prop]);
            }
            throw new Error('This cannot happen.');
        }, this);
    }

    /**
     * Returns a customized Route instance, which will match only requests with the path params specified
     */
    matchingParams (matcher: TemplateMatcher): Route {
        return this.matching((ctx) => testMatch(ctx.params, matcher, true));
    }

    /**
     * Returns a customized Route instance, which will match only requests with the path param specified
     */
    matchingParam (param: string, value: ValueToMatch): Route {
        return this.matchingParams({ [param]: value });
    }

    /**
     * Returns a customized Route instance, which will match only requests with the query params specified
     */
    matchingQuery (matcher: TemplateMatcher): Route {
        return this.matching((ctx) => testMatch(ctx.query, matcher, true));
    }

    /**
     * Returns a customized Route instance, which will match only requests with the query params specified
     */
    matchingQueryParam (param: string, value: ValueToMatch): Route {
        return this.matchingQuery({ [param]: value });
    }

    /**
     * Returns a customized Route instance, which will match only requests with the matching headers
     */
    matchingHeaders (matcher: TemplateMatcher): Route {
        matcher = mapKeys(matcher, (value: any, key: any) => `${key}`.toLowerCase());
        return this.matching((ctx) => testMatch(ctx.headers, matcher, true));
    }

    /**
     * Returns a customized Route instance, which will match only requests with the matching headers
     */
    matchingHeader (header: string, value: ValueToMatch): Route {
        return this.matchingHeaders({ [header]: value });
    }

    /**
     * Returns a customized Route instance, which will match only requests with the matching body
     */
    matchingBody (matcher: TemplateMatcher): Route {
        return this.matching((ctx) => testMatch(ctx.request.body, matcher, false));
    }

    private _getSingleMatcher (): MatcherFunction {
        return async (ctx: Context) => {
            for (const matcher of this._matchers) {
                if (!(await matcher(ctx))) {
                    return false;
                }
            }
            return true;
        };
    }

    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the '_handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     */
    handleNext <T>(handler?: Middleware<T>): Checker {
        return this._mockServer._handleNext<T>(this._method, this._path, this._getSingleMatcher(), handler, false);
    }

    /**
     * Adds one-time handler. First request to the 'method' and 'path' will be processed by the handler and cause
     * the handler removal.
     * The handlers registered using 'handleNext' method has precedence over handlers registered via the '_handle' method
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     * The function is also thenable/awaitable - if then/await is applied, the returned Promise will be resolved after
     * request come
     */
    waitForNext <T>(handler?: Middleware<T>): AwaitableChecker {
        return this._mockServer._handleNext<T>(this._method, this._path, this._getSingleMatcher(), handler, true);
    }

    /**
     * Adds one-time check. The checker will fail in case of any request to the method and path.
     * The checks registered using 'notReceive' method.
     * Returned function can be used to manual check. Function will throw in case of the handler did not receive request
     * and cause the handler removal.
     *
     * @returns Returns function that checks the route was NOT requested.
     */
    notReceive (): Checker {
        return this._mockServer._notReceive(this._method, this._path, this._getSingleMatcher());
    }
}

