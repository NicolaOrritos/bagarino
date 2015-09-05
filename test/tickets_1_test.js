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
    
    'Tickets route - Part 1': function(test)
    {
        test.expect(15);

        request.get('http://localhost:8124/tickets/new?policy=manual_expiration', function(err, res)
        {
            test.ifError(err);
            test.equal(res.statusCode, 200);

            var result = JSON.parse(res.body);

            test.equal(result.result, CONST.OK);


            request.get('http://localhost:8124/tickets/' + result.ticket + '/expire', function(err2, res2)
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 200);

                result = JSON.parse(res2.body);

                test.equal(result.status, CONST.EXPIRED_TICKET);


                request.get('http://localhost:8124/tickets/new?policy=requests_based&requests=1', function(err3, res3)
                {
                    test.ifError(err3);
                    test.equal(res3.statusCode, 200);

                    result = JSON.parse(res3.body);

                    test.equal(result.result, CONST.OK);
                    test.equal(result.expires_in, 1);
                    test.ok(result.ticket);


                    request.get('http://localhost:8124/tickets/' + result.ticket + '/status', function(err4, res4)
                    {
                        test.ifError(err4);
                        test.equal(res4.statusCode, 200);

                        result = JSON.parse(res4.body);

                        test.equal(result.status, CONST.VALID_TICKET);
                        test.deepEqual(result.expires_in, 0);

                        test.done();
                    });
                });
            });
        });
    }
};
