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

    'Tickets policy retrieval': function(test)
    {
        request.get('http://localhost:8124/tickets/new?policy=time_based&seconds=2', (err, res) =>
        {
            test.ifError(err);
            test.equal(res.statusCode, 200);

            let result = JSON.parse(res.body);

            test.equal(result.result, CONST.OK);
            test.equal(result.policy, 'time_based');

            const ticket = result.ticket;

            test.ok(ticket);


            request.get('http://localhost:8124/tickets/' + ticket + '/policy', (err2, res2) =>
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 200);

                result = JSON.parse(res2.body);

                test.equal(result.policy, 'time_based');

                test.ok(result.more);
                test.equal(result.more.context, undefined);
                test.equal(result.more.autorenew, false);
                test.equal(result.more.depends_on, undefined);
                test.equal(result.more.generation_speed, CONST.SPEED.SLOW);
                test.equal(result.more.can_force_expiration, false);


                test.done();
            });
        });
    }
};
