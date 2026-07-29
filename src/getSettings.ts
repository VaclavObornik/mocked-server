import fs from 'fs';
import pkgUp from 'pkg-up';
import { MockServerOptions, TestRunner } from './types';

export interface Settings {
    testRunner: TestRunner;
}

const validTestRunners: TestRunner[] = ['mocha', 'jest', 'none'];

let packageRead = false;
let packageResult: Settings | undefined;
let packageError: Error | undefined;

// lazy so that projects configured purely via constructor options
// never read (or complain about) their package.json
function readPackageSettings (): void {
    if (packageRead) {
        return;
    }
    packageRead = true;

    const packageJsonPath = pkgUp.sync();
    if (!packageJsonPath) {
        return;
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (typeof pkg['mocked-server'] === 'object') {
            packageResult = pkg['mocked-server'];
        }
    } catch (err) {
        packageError = new Error(`Unable to parse "${packageJsonPath}": ${err}`);
    }
}

export function getSettings (options: MockServerOptions = {}): Settings {

    // != null: undefined/null mean "not provided"; anything else (incl. '') must validate
    if (options.testRunner != null) {
        if (!validTestRunners.includes(options.testRunner)) {
            throw new Error(`Invalid "testRunner" option "${options.testRunner}". Valid options are: ${validTestRunners.join(', ')}.`);
        }
        return { testRunner: options.testRunner };
    }

    readPackageSettings();

    if (packageError) {
        throw packageError;
    }

    if (!packageResult) {
        throw new Error('Missing required "mocked-server" settings in the package.json. See documentation for example. https://www.npmjs.com/package/mocked-server');
    }

    if (!validTestRunners.includes(packageResult.testRunner)) {
        throw new Error(`Missing or invalid option for key "testRunner" in the package.json. Valid options are: ${validTestRunners.join(', ')}.`);
    }

    return packageResult;
}
