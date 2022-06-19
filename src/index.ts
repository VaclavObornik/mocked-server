
import { MockServer } from "./MockServer";
export default MockServer;
export { MockServer } from "./MockServer";
export { Route } from "./Route";
export { AwaitableChecker, Checker, MatcherFunction, TemplateMatcher, Method, Path, LowercasedMethod, DefaultHandler } from './types';

// koa body parser Request definition
declare module "koa" {
    interface Request {
        body?: any;
        rawBody: string;
    }
}
