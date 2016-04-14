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

    'Tickets generation speeds': function(test)
    {
        test.expect(12);

        let seconds = 2;

        let genspeed = CONST.SPEED.FASTER;

        request.get('http://localhost:8124/tickets/new?policy=time_based&seconds=' + seconds + '&generation_speed=' + genspeed, (err, res) =>
        {
            test.ifError(err);
            test.equal(res.statusCode, 200);

            let result = JSON.parse(res.body);

            test.equal(result.result, CONST.OK);

            let ticket = result.ticket;

            test.ok(ticket);


            genspeed = CONST.SPEED.FAST;

            request.get('http://localhost:8124/tickets/new?policy=time_based&seconds=' + seconds + '&generation_speed=' + genspeed, (err2, res2) =>
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 200);

                result = JSON.parse(res2.body);

                test.equal(result.result, CONST.OK);

                ticket = result.ticket;

                test.ok(ticket);


                genspeed = CONST.SPEED.SLOW;

                request.get('http://localhost:8124/tickets/new?policy=time_based&seconds=' + seconds + '&generation_speed=' + genspeed, (err3, res3) =>
                {
                    test.ifError(err3);
                    test.equal(res3.statusCode, 200);

                    result = JSON.parse(res3.body);

                    test.equal(result.result, CONST.OK);

                    ticket = result.ticket;

                    test.ok(ticket);


                    test.done();
                });
            });
        });
    }
};
