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

export type RouteExtender<X extends object = object> = (route: Route) => X;

/**
 * The type of a route returned by Route.extend(): the route itself plus the extension.
 * Extension methods that return a Route are re-typed to return the receiver's own type,
 * so custom helpers stay chainable — even across stacked extend() calls.
 */
export type ExtendedRoute<R extends Route, X> = R & {
    [K in keyof X]: X[K] extends (...args: infer A) => infer Ret
        ? Ret extends Route ? <Self extends Route>(this: Self, ...args: A) => Self : X[K]
        : X[K];
};

// guards against infinite recursion: an extender body deriving a route (matching*/extend)
// would re-apply the same extender on the derived route, forever
let applyingExtender = false;


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
        private _matchers: MatcherFunction[] = [],
        private _extenders: RouteExtender[] = []
    ) {
        for (const extender of this._extenders) {
            if (applyingExtender) {
                throw new Error('Cannot derive a route while an extender is being applied.'
                    + ' Call matching*/extend inside the returned helper methods, not in the extender body itself.');
            }
            applyingExtender = true;
            let extension: object;
            try {
                extension = extender(this);
            } finally {
                applyingExtender = false;
            }
            if (extension === null || typeof extension !== 'object') {
                throw new Error('An extender must return an object with the extension properties.');
            }
            if (typeof (extension as { then?: unknown }).then === 'function') {
                throw new Error('An extender must return the extension object synchronously; async extenders are not supported.');
            }
            for (const key of Reflect.ownKeys(extension)) {
                if (key === '__proto__') {
                    throw new Error('Extension property "__proto__" is not allowed.');
                }
                if (this._hasConflictingMember(key)) {
                    throw new Error(`Extension property "${String(key)}" conflicts with an existing Route member or an earlier extension.`);
                }
            }
            // descriptor-based copy keeps accessors and non-enumerable properties intact,
            // which Object.assign would evaluate or silently skip
            Object.defineProperties(this, Object.getOwnPropertyDescriptors(extension));
        }
    }

    /**
     * A conflict is an own property (a private field or an earlier extension) or a member
     * found on the prototype chain before Object.prototype — inherited Object members
     * like toString may be overridden by an extension.
     */
    private _hasConflictingMember (key: PropertyKey): boolean {
        if (Object.prototype.hasOwnProperty.call(this, key)) {
            return true;
        }
        for (let proto = Object.getPrototypeOf(this); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
            if (Object.prototype.hasOwnProperty.call(proto, key)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Every derived Route goes through here so registered extenders are re-applied
     * (in the constructor) and custom extension methods survive chaining.
     */
    private _derive (matchers: MatcherFunction[], extenders: RouteExtender[]): this {
        const RouteClass = this.constructor as typeof Route;
        return new RouteClass(this._mockServer, this._method, this._path, matchers, extenders) as this;
    }

    /**
     * Returns a new Route extended with custom properties (typically chainable matcher shortcuts).
     * The extension survives chaining: routes derived via 'matching*' methods keep the custom methods.
     * An extension property whose name conflicts with an existing Route member throws.
     */
    extend <X extends object>(extender: (route: this) => X): ExtendedRoute<this, X> {
        // the `this`-typed parameter is safe here (extenders always receive the route they extend),
        // but it is contravariant to RouteExtender's Route parameter, hence the double cast
        const storableExtender = extender as unknown as RouteExtender;
        return this._derive(this._matchers, [...this._extenders, storableExtender]) as ExtendedRoute<this, X>;
    }

    /**
     * Returns a customized Route instance, which will match only requests for which the Matcher function returns true
     */
    matching (matcher: Matcher): this {

        if (isFunction(matcher)) {
            return this._derive([...this._matchers, matcher], this._extenders);
        }

        const validProps: MatcherProp[] = ['params', 'query', 'body', 'headers'];
        const usedProps = Object.keys(matcher);

        const invalidProps = usedProps.filter((prop) => !validProps.includes(prop as MatcherProp));
        if (invalidProps.length) {
            throw new Error(`Unknown matcher prop(s) "${invalidProps.join(', ')}". Only "${validProps.join(', ')}" are supported.`);
        }

        // an explicit undefined value means the prop is omitted, so the assertions below are safe
        const definedProps = (usedProps as MatcherProp[]).filter((prop) => typeof matcher[prop] !== 'undefined');

        return definedProps.reduce((prev: Route, prop: MatcherProp): Route => {
            if (prop === 'headers') {
                return prev.matchingHeaders(matcher[prop]!);
            }
            if (prop === 'params') {
                return prev.matchingParams(matcher[prop]!);
            }
            if (prop === 'query') {
                return prev.matchingQuery(matcher[prop]!);
            }
            if (prop === 'body') {
                return prev.matchingBody(matcher[prop]!);
            }
            throw new Error('This cannot happen.');
        }, this) as this;
    }

    /**
     * Returns a customized Route instance, which will match only requests with the path params specified
     */
    matchingParams (matcher: TemplateMatcher): this {
        return this.matching((ctx) => testMatch(ctx.params, matcher, true));
    }

    /**
     * Returns a customized Route instance, which will match only requests with the path param specified
     */
    matchingParam (param: string, value: ValueToMatch): this {
        return this.matchingParams({ [param]: value });
    }

    /**
     * Returns a customized Route instance, which will match only requests with the query params specified
     */
    matchingQuery (matcher: TemplateMatcher): this {
        return this.matching((ctx) => testMatch(ctx.query, matcher, true));
    }

    /**
     * Returns a customized Route instance, which will match only requests with the query params specified
     */
    matchingQueryParam (param: string, value: ValueToMatch): this {
        return this.matchingQuery({ [param]: value });
    }

    /**
     * Returns a customized Route instance, which will match only requests with the matching headers
     */
    matchingHeaders (matcher: TemplateMatcher): this {
        matcher = mapKeys(matcher, (value: any, key: any) => `${key}`.toLowerCase());
        return this.matching((ctx) => testMatch(ctx.headers, matcher, true));
    }

    /**
     * Returns a customized Route instance, which will match only requests with the matching headers
     */
    matchingHeader (header: string, value: ValueToMatch): this {
        return this.matchingHeaders({ [header]: value });
    }

    /**
     * Returns a customized Route instance, which will match only requests with the matching body
     */
    matchingBody (matcher: TemplateMatcher): this {
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

