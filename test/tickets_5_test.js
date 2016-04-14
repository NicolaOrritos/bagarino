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

    'Bandwidth-based tickets': function(test)
    {
        test.expect(35);

        let requests = 4;

        request.get('http://localhost:8124/tickets/new?policy=bandwidth_based&reqs_per_minute=' + requests, (err, res) =>
        {
            test.ifError(err);
            test.equal(res.statusCode, 200);

            let result = JSON.parse(res.body);

            test.equal(result.result, CONST.OK);

            let ticket = result.ticket;

            test.ok(ticket);


            request.get('http://localhost:8124/tickets/' + ticket + '/status', (err2, res2) =>
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 200);

                result = JSON.parse(res2.body);

                test.equal(result.status, CONST.VALID_TICKET);
                test.equal(result.expires_in, requests - 1);


                // Consume the requests and get an "expired" status
                request.get('http://localhost:8124/tickets/' + ticket + '/status', (err3, res3) =>
                {
                    test.ifError(err3);
                    test.equal(res3.statusCode, 200);

                    result = JSON.parse(res3.body);

                    test.equal(result.status, CONST.VALID_TICKET);
                    test.equal(result.expires_in, requests - 2);

                    request.get('http://localhost:8124/tickets/' + ticket + '/status', (err4, res4) =>
                    {
                        test.ifError(err4);
                        test.equal(res4.statusCode, 200);

                        result = JSON.parse(res4.body);

                        test.equal(result.status, CONST.VALID_TICKET);
                        test.equal(result.expires_in, requests - 3);


                        // Then wait a bit more of a minute to reset the counter and try the lightweight parameter
                        const wait = 61 * 1000;
                        console.log('\n\n Waiting %s seconds for the bandwith check to reset... \n\n', wait / 1000);

                        setTimeout( () =>
                        {
                            request.get('http://localhost:8124/tickets/' + ticket + '/status', (err5, res5) =>
                            {
                                test.ifError(err5);
                                test.equal(res5.statusCode, 200);

                                result = JSON.parse(res5.body);

                                test.equal(result.status, CONST.VALID_TICKET);
                                test.equal(result.expires_in, requests - 1);

                                request.get('http://localhost:8124/tickets/' + ticket + '/status', (err6, res6) =>
                                {
                                    test.ifError(err6);
                                    test.equal(res6.statusCode, 200);

                                    result = JSON.parse(res6.body);

                                    test.equal(result.status, CONST.VALID_TICKET);
                                    test.equal(result.expires_in, requests - 2);

                                    request.get('http://localhost:8124/tickets/' + ticket + '/status', (err7, res7) =>
                                    {
                                        test.ifError(err7);
                                        test.equal(res7.statusCode, 200);

                                        result = JSON.parse(res7.body);

                                        test.equal(result.status, CONST.VALID_TICKET);
                                        test.equal(result.expires_in, requests - 3);


                                        request.get('http://localhost:8124/tickets/' + ticket + '/status', (err8, res8) =>
                                        {
                                            test.ifError(err8);
                                            test.equal(res8.statusCode, 200);

                                            result = JSON.parse(res8.body);

                                            test.equal(result.status, CONST.VALID_TICKET);
                                            test.equal(result.expires_in, requests - 4);


                                            request.get('http://localhost:8124/tickets/' + ticket + '/status', (err9, res9) =>
                                            {
                                                test.ifError(err9);
                                                test.equal(res9.statusCode, 200);

                                                result = JSON.parse(res9.body);

                                                test.equal(result.status, CONST.EXPIRED_TICKET);


                                                test.done();
                                            });
                                        });
                                    });
                                });
                            });

                        }, wait);
                    });
                });
            });
        });
    }
};
