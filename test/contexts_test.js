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
        // setup here
        
        done();
    },
    'Contexts route': function(test)
    {
        test.expect(6);
        
        var context = "nonexistentcontext";
        
        request.get('http://localhost:8124/contexts/' + context + '/expireall', function(err, res)
        {
            console.log("Result: %s", res.body);
            
            test.ifError(err);
            
            test.equal(res.statusCode, 200);
            
            var result = JSON.parse(res.body);
            
            test.equal(result.status, CONST.OK);
            test.equal(result.cause, CONST.ERRORS.EMPTY_CONTEXT);
            
            
            request.get('http://localhost:8124/contexts//expireall', function(err2, res2)
            {
                test.ifError(err2);
                test.equal(res2.statusCode, 404);
                
                test.done();
            });
        });
    }
};
