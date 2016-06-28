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
    setUp: function(done)
    {
        done();
    },

    tearDown: function(done)
    {
        done();
    },

    'Tickets with payloads wrong routes': function(test)
    {
        test.expect(4);

        request.get('http://localhost:8124/tickets/new/withpayload', (err, res) =>
        {
            test.ifError(err);
            test.equal(res.statusCode, 400);

            request.post('http://localhost:8124/tickets/new', (err2, res2) =>
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 400);

                test.done();
            });
        });
    },

    'Tickets with payloads - creation and payload retrieval - manual_expiration': function(test)
    {
        test.expect(15);

        const payload = {'key': 'value'};

        request.post('http://localhost:8124/tickets/new/withpayload?policy=manual_expiration&can_force_expiration=true',
                     {body: payload, json: true},
                     (err, res) =>
        {
            test.ifError(err);
            test.equal(res.statusCode, 200);

            let result = res.body;

            test.equal(result.result, CONST.OK);
            test.equal(result.policy, 'manual_expiration');
            test.ok(result.ticket);

            const ticket = result.ticket;

            request.get('http://localhost:8124/tickets/' + ticket + '/payload',
                        (err2, res2) =>
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 200);

                result = JSON.parse(res2.body);

                test.ok(result);
                test.equal(result.key, 'value');

                request.get('http://localhost:8124/tickets/' + ticket + '/expire', (err) =>
                {
                    test.ifError(err);

                    request.get('http://localhost:8124/tickets/' + ticket + '/payload',
                                (err, res) =>
                    {
                        test.ifError(err);
                        test.ok(res);
                        test.equal(res.statusCode, 200);

                        result = JSON.parse(res.body);

                        test.ok(result);
                        test.equal(result.status, CONST.EXPIRED_TICKET);


                        test.done();
                    });
                });
            });
        });
    }
};
