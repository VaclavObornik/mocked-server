import fs from 'fs';
import pkgUp from 'pkg-up';
import { MockServerOptions, TestRunner } from './types';

const packageJsonPath = pkgUp.sync();

export interface Settings {
    testRunner: TestRunner;
}

const validTestRunners: TestRunner[] = ['mocha', 'jest', 'none'];

let packageResult: Settings | undefined;

if (packageJsonPath) {
    try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (typeof pkg['mocked-server'] === 'object') {
            packageResult = pkg['mocked-server'];
        }
    } catch (err) {
        console.error(`mocked-server: unable to parse "${packageJsonPath}":`, err);
    }
}

export function getSettings (options: MockServerOptions = {}): Settings {

    if (options.testRunner) {
        if (!validTestRunners.includes(options.testRunner)) {
            throw new Error(`Invalid "testRunner" option "${options.testRunner}". Valid options are: ${validTestRunners.join(', ')}.`);
        }
        return { testRunner: options.testRunner };
    }

    if (!packageResult) {
        throw new Error('Missing required "mocked-server" settings in the package.json. See documentation for example. https://www.npmjs.com/package/mocked-server');
    }

    if (!validTestRunners.includes(packageResult.testRunner)) {
        throw new Error(`Missing or invalid option for key "testRunner" in the package.json. Valid options are: ${validTestRunners.join(', ')}.`);
    }

    return packageResult;
}
