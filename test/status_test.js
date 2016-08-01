'use strict';

const request = require('request');
const CONST   = require('../lib/const');

/*
  ======== A Handy Little Nodeunit Reference ========
  https://github.com/caolan/nodeunit

  Test methods:
    test.expect(numAssertions)
    test.done()
  Test assertions:
    test.ok(value, [message])
    test.equal(actual, expected, [message])
    test.notEqual(actual, expected, [message])
    test.deepEqual(actual, expected, [message])
    test.notDeepEqual(actual, expected, [message])
    test.strictEqual(actual, expected, [message])
    test.notStrictEqual(actual, expected, [message])
    test.throws(block, [error], [message])
    test.doesNotThrow(block, [error], [message])
    test.ifError(value)
*/

exports.read =
{
    'Status call answering OK': function(test)
    {
        test.expect(9);

        request.get('http://localhost:8124/status', (err, res) =>
        {
            test.ifError(err);

            test.equal(res.statusCode, 200);

            let result = JSON.parse(res.body);

            test.equal(result.status, CONST.OK);

            test.ok(result.memory);
            test.ok(result.memory.rss);
            test.ok(result.memory.heapTotal);
            test.ok(result.memory.heapUsed);

            test.ok(!isNaN(result.uptime));

            test.ok(result['node-version']);


            test.done();
        });
    }
};
