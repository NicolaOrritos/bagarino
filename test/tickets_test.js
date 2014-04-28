'use strict';

var request = require('request');
var CONST   = require('../lib/const');

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
    setUp: function(done)
    {
        done();
    },
    'Tickets route': function(test)
    {
        test.expect(6);
        
        request.get('http://localhost:8124/tickets/new?policy=manual_expiration', function(err, res)
        {
            console.log("Result: %s", res.body);
            
            test.ifError(err);
            
            test.equal(res.statusCode, 200);
            
            var result = JSON.parse(res.body);
            
            test.equal(result.result, CONST.OK);
            
            
            request.get('http://localhost:8124/tickets/' + result.ticket + '/expire', function(err2, res2)
            {
                console.log("Result: %s", res2.body);

                test.ifError(err2);

                test.equal(res2.statusCode, 200);

                result = JSON.parse(res2.body);

                test.equal(result.status, CONST.EXPIRED_TICKET);

                test.done();
            });
        });
    }
};
