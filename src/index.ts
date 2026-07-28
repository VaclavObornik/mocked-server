
import { MockServer } from "./MockServer";
export default MockServer;
export { MockServer } from "./MockServer";
export { Route } from "./Route";
export {
    AwaitableChecker,
    Checker,
    DefaultHandler,
    LowercasedMethod,
    Matcher,
    MatcherFunction,
    Method,
    MockServerOptions,
    Path,
    TemplateMatcher,
    TestRunner,
} from './types';

// koa-bodyparser request additions; body stays `any` (not `unknown` as in current
// @types/koa-bodyparser) so existing consumer handlers keep compiling
declare module "koa" {
    interface Request {
        body?: any;
        rawBody: string;
    }
}
