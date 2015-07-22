
'use strict';

/* jshint -W116 */

var P     = require('bluebird');
var redis = require('redis');
var CONST = require('./const');


module.exports =
{
    run: function(verbose)
    {
        return new P(function(resolve, reject)
        {
            console.log('Starting garbage collection' + (verbose ? ', with "verbose" option' : '') + '...');


            var client = redis.createClient();

            client.on("error", function(err)
            {
                reject(err);
            });


            var cleaned   = 0;


            function scan(cursor)
            {
                if (cursor === undefined || cursor === null)
                {
                    cursor = 0;
                }

                client.scan(cursor,
                            'MATCH', CONST.VALID_PREFIX + '*',
                            'COUNT', 128,
                            function(err2, res)
                {
                    if (err2)
                    {
                        reject(err2);
                    }
                    else
                    {
                        cursor = parseInt(res[0]);


                        var keys = res[1];

                        var total     = keys.length;
                        var processed = 0;

                        if (verbose)
                        {
                            console.log('Cursor is now "%s"...', cursor);
                            console.log('Got %s key(s) to analyze...', total);
                        }

                        var deleted = function(count)
                        {
                            cleaned += count;
                            processed++;

                            if (processed === total)
                            {
                                if (cursor === 0)
                                {
                                    resolve(cleaned);
                                }
                                else
                                {
                                    scan(cursor);
                                }
                            }
                        };


                        if (keys.length === 0)
                        {
                            if (cursor === 0)
                            {
                                resolve(cleaned);
                            }
                            else
                            {
                                scan(cursor);
                            }
                        }
                        else
                        {
                            keys.forEach(function(key)
                            {
                                if (key)
                                {
                                    var ticket = key.slice(CONST.VALID_PREFIX.length);

                                    if (verbose) console.log('Analyzing ticket "%s" (from key "%s")...', ticket, key);

                                    if (ticket)
                                    {
                                        client.hget(CONST.VALID_PREFIX + ticket, 'policy', function(err3, policy_str)
                                        {
                                            if (err3)
                                            {
                                                if (verbose) console.log('Could not get "%s"\'s policy. %s', CONST.VALID_PREFIX + ticket, err3);

                                                deleted(0);
                                            }
                                            else if (policy_str)
                                            {
                                                var policy = JSON.parse(policy_str);

                                                if (policy.requests_based)
                                                {
                                                    client.get(CONST.EXPIRED_PREFIX + ticket, function(err4, exists)
                                                    {
                                                        if (err4)
                                                        {
                                                            if (verbose) console.log('Could not get "%s". %s', CONST.EXPIRED_PREFIX + ticket, err4);

                                                            deleted(0);
                                                        }
                                                        else if (exists)
                                                        {
                                                            if (verbose) console.log('"%s"\'s not a stale ticket', ticket);

                                                            deleted(0);
                                                        }
                                                        else
                                                        {
                                                            // Stale ticket, delete
                                                            client.del(CONST.VALID_PREFIX + ticket, function(err5)
                                                            {
                                                                if (err5)
                                                                {
                                                                    if (verbose) console.log('Could not delete stale ticket "%s"\'. %s', CONST.VALID_PREFIX + ticket, err5);

                                                                    deleted(0);
                                                                }
                                                                else
                                                                {
                                                                    if (verbose) console.log('Deleted stale ticket "%s"\'', ticket);

                                                                    deleted(1);
                                                                }
                                                            });
                                                        }
                                                    });
                                                }
                                                else
                                                {
                                                    if (verbose) console.log('Skipping non "requests_based" "%s" ticket...', ticket);

                                                    deleted(0);
                                                }
                                            }
                                            else
                                            {
                                                if (verbose) console.log('Could not get "%s"\'s policy. Unknown reason...', CONST.VALID_PREFIX + ticket);

                                                deleted(0);
                                            }
                                        });
                                    }
                                    else
                                    {
                                        if (verbose) console.log('Could not find ticket "%s" anymore', key);

                                        deleted(0);
                                    }
                                }
                                else
                                {
                                    if (verbose) console.log('Skipping empty key...');

                                    deleted(0);
                                }
                            });
                        }
                    }
                });
            }

            var REDIS_DB = CONST.DB;

            client.select(REDIS_DB, function()
            {
                if (verbose) console.log('Opened DB "%s"...', REDIS_DB);

                scan();
            });
        });
    }
};
