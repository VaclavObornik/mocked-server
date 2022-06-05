import fs from 'fs';
import pkgUp from 'pkg-up';

const packageJsonPath = pkgUp.sync();

export interface Settings {
    testRunner: 'mocha' | 'jest' | 'none' | string;
}

let packageResult: Settings;

if (packageJsonPath) {
    try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (typeof pkg['mocked-server'] === 'object') {
            packageResult = pkg['mocked-server'];
        }
    } catch (err) {
        console.error('Unable to parse package.json');
    }
}


export function getSettings (): Settings {

    // @ts-ignore
    if (typeof packageResult === 'undefined') {
        throw new Error('Missing required "mocked-server" settings in the package.json. See documentation for example. https://www.npmjs.com/package/mocked-server');
    }

    const validTestRunners = ['mocha', 'jest', 'none'];
    if (!validTestRunners.includes(packageResult.testRunner)) {
        throw new Error(`Missing or invalid option for key "testRunner" in the package.json. Valid options are: ${validTestRunners.join(', ')}.`);
    }

    return packageResult;
}

