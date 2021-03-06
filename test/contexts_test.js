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

const existingContext = 'thisisacontext';

exports.read =
{
    setUp: function(done)
    {
        request.get('http://localhost:8124/tickets/new?policy=manual_expiration&context=' + existingContext, err =>
        {
            if (err)
            {
                console.log('Error setting the test up: %s', err);
            }

            done();
        });
    },

    tearDown: function(done)
    {
        // Cleanup the context:
        request.get('http://localhost:8124/contexts/' + existingContext + '/expireall', err =>
        {
            if (err)
            {
                console.log('Error tearing the test down: %s', err);
            }

            done();
        });
    },

    'Contexts wrong routes': function(test)
    {
        test.expect(8);

        const context = existingContext;

        request.get('http://localhost:8124/contexts/' + context, (err, res) =>
        {
            test.ifError(err);

            test.equal(res.statusCode, 400);

            let result = JSON.parse(res.body);

            test.equal(result.status, CONST.ERROR);
            test.equal(result.cause, CONST.ERRORS.MALFORMED_REQUEST);


            request.get('http://localhost:8124/contexts/' + context + '/wrongoperation', (err2, res2) =>
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 400);

                result = JSON.parse(res2.body);

                test.equal(result.status, CONST.ERROR);
                test.equal(result.cause, CONST.ERRORS.MALFORMED_REQUEST);

                test.done();
            });
        });
    },

    'Contexts route usage': function(test)
    {
        test.expect(14);

        const context = "nonexistentcontext";

        request.get('http://localhost:8124/contexts/' + context + '/expireall', (err, res) =>
        {
            test.ifError(err);

            test.equal(res.statusCode, 404);

            let result = JSON.parse(res.body);

            test.equal(result.status, CONST.NOT_OK);
            test.equal(result.cause, CONST.ERRORS.CONTEXT_NOT_FOUND);


            request.get('http://localhost:8124/contexts/expireall', (err2, res2) =>
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 400);

                request.get('http://localhost:8124/contexts/' + existingContext + '/expireall', (err3, res3) =>
                {
                    test.ifError(err3);

                    test.equal(res3.statusCode, 200);

                    result = JSON.parse(res3.body);

                    test.strictEqual(result.expired, 1);


                    request.get('http://localhost:8124/tickets/new?policy=manual_expiration&context=' + existingContext, err4 =>
                    {
                        test.ifError(err4);

                        request.get('http://localhost:8124/tickets/new?policy=manual_expiration&context=' + existingContext, err5 =>
                        {
                            test.ifError(err5);

                            request.get('http://localhost:8124/contexts/' + existingContext + '/expireall', (err6, res6) =>
                            {
                                test.ifError(err6);

                                test.equal(res6.statusCode, 200);

                                result = JSON.parse(res6.body);

                                test.strictEqual(result.expired, 2);


                                test.done();
                            });
                        });
                    });
                });
            });
        });
    }
};
