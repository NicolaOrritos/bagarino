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

var existingContext = 'thisisacontext';

exports.read =
{
    setUp: function(done)
    {
        request.get('http://localhost:8124/tickets/new?policy=manual_expiration&context=' + existingContext, function(err)
        {
            if (err)
            {
                console.log('Error setting up the test: %s', err);
            }
            
            done();
        });
    },
    'Contexts route': function(test)
    {
        test.expect(14);
        
        var context = "nonexistentcontext";
        
        request.get('http://localhost:8124/contexts/' + context + '/expireall', function(err, res)
        {
            test.ifError(err);
            
            test.equal(res.statusCode, 404);
            
            var result = JSON.parse(res.body);
            
            test.equal(result.status, CONST.NOT_OK);
            test.equal(result.cause, CONST.ERRORS.CONTEXT_NOT_FOUND);
            
            
            request.get('http://localhost:8124/contexts/expireall', function(err2, res2)
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 404);
                
                request.get('http://localhost:8124/contexts/' + existingContext + '/expireall', function(err3, res3)
                {
                    test.ifError(err3);

                    test.equal(res3.statusCode, 200);
                    
                    result = JSON.parse(res3.body);
                    
                    test.strictEqual(result.expired, 1);
                    
                    
                    request.get('http://localhost:8124/tickets/new?policy=manual_expiration&context=' + existingContext, function(err4)
                    {
                        test.ifError(err4);
                        
                        request.get('http://localhost:8124/tickets/new?policy=manual_expiration&context=' + existingContext, function(err5)
                        {
                            test.ifError(err5);
                            
                            request.get('http://localhost:8124/contexts/' + existingContext + '/expireall', function(err6, res6)
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
