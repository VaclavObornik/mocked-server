import { Context } from "koa";

export type MatcherFunction = (ctx: Context) => boolean | Promise<boolean>;

export type ValueToMatch = any | RegExp | ((val: any) => boolean);

export type TemplateMatcher = Record<string|number, ValueToMatch>;

export type MatcherProp = 'params' | 'query' | 'body' | 'headers';

export type Matcher = MatcherFunction | Partial<Record<MatcherProp, TemplateMatcher>>;

export type TestRunner = 'mocha' | 'jest' | 'none';

export interface MockServerOptions {
    /** Overrides the "mocked-server" configuration from package.json. */
    testRunner?: TestRunner;
}

export type LowercasedMethod = 'get' | 'post' | 'put' | 'link' | 'unlink' | 'delete' | 'del' | 'head' | 'options' | 'patch' | 'all';

export type Method = LowercasedMethod | 'GET' | 'POST' | 'PUT' | 'LINK' | 'UNLINK' | 'DELETE' | 'DEL' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'ALL';

export type Path = string;

export interface Checker {
    (): void | never; // can throw an validation error
}

export interface AwaitableChecker extends Checker, PromiseLike<void> {}

export type DefaultHandler = (ctx: Context) => void | never | Promise<void>;
