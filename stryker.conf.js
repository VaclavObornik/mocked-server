'use strict';

/**
 * @type {StrykerOptions}
 */
module.exports = {
    mutator: 'javascript',
    packageManager: 'npm',
    reporters: ['html', 'clear-text', 'progress'],
    transpilers: [],
    testFramework: 'mocha',
    coverageAnalysis: 'perTest',
    mutate: [
        'src/**/*.js'
    ],
    testRunner: 'mocha'
};
