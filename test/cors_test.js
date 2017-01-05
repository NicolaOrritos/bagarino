'use strict';

const request = require('request');

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
    'OPTIONS call': function(test)
    {
        test.expect(2);

        request({url: 'http://localhost:8124/', method: 'OPTIONS', headers: {'Origin': 'localhost'}},
                (err, res) =>
        {
            test.ifError(err);

            test.equal(res.statusCode, 204);

            let headers = res.headers;

            console.log('Headers received: %s', headers);


            test.done();
        });
    }
};
