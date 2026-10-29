// Command-line test runner:  node tests/run_tests.js
require('../js/geometry.js');
require('../js/dc.js');
require('../js/fortune.js');
const Verify = require('../js/verify.js');

const results = Verify.testSuite();
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name.padEnd(36) + ' n=' + String(r.n).padEnd(5) +
    ' edges=' + String(r.edges).padEnd(6) + (r.ok ? '' : r.message));
}
console.log('\n' + (results.length - failed) + '/' + results.length + ' tests passed');
process.exit(failed ? 1 : 0);
