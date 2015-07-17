
'use strict';

var P     = require('bluebird');
var redis = require('redis');
var CONST = require('./const');


module.exports =
{
    run: function(verbose)
    {
        return new P(function(resolve, reject)
        {
            if (verbose)
            {
                console.log('Starting garbage collection, with "verbose" option...');
            }
            else
            {
                console.log('Starting garbage collection...');
            }

            var client = redis.createClient();

            client.on("error", function(err)
            {
                reject(err);
            });

            var REDIS_DB = CONST.DB;

            client.select(REDIS_DB, function()
            {
                console.log('Opened DB "%s"...', REDIS_DB);

                client.keys(CONST.VALID_PREFIX + '*', function(err, keys)
                {
                    if (err)
                    {
                        reject(err);
                    }
                    else if (keys && keys.length)
                    {
                        var total     = keys.length;
                        var cleaned   = 0;
                        var processed = 0;

                        console.log('Got %s keys to analyze...', total);

                        var deleted = function(count)
                        {
                            cleaned += count;
                            processed++;

                            if (processed === total)
                            {
                                resolve(cleaned);
                            }
                        };

                        keys.forEach(function(key)
                        {
                            if (key)
                            {
                                var ticket = key.slice(CONST.VALID_PREFIX.length);

                                if (verbose)
                                {
                                    console.log('Analyzing ticket "%s" (from key "%s")...', ticket, key);
                                }

                                if(ticket)
                                {
                                    client.get(CONST.EXPIRED_PREFIX + ticket, function(err3, exists)
                                    {
                                        if (err3)
                                        {
                                            if (verbose)
                                            {
                                                console.log('Could not get "%s"\'s. %s', CONST.EXPIRED_PREFIX + ticket, err3);
                                            }

                                            deleted(0);
                                        }
                                        else if (exists)
                                        {
                                            if (verbose)
                                            {
                                                console.log('"%s"\'s not a stale ticket', CONST.EXPIRED_PREFIX + ticket);
                                            }

                                            deleted(0);
                                        }
                                        else
                                        {
                                            // Stale ticket, delete
                                            client.del(CONST.VALID_PREFIX + ticket, function(err4)
                                            {
                                                if (err4)
                                                {
                                                    if (verbose)
                                                    {
                                                        console.log('Could not delete stale ticket "%s"\'. %s', CONST.VALID_PREFIX + ticket, err4);
                                                    }

                                                    deleted(0);
                                                }
                                                else
                                                {
                                                    if (verbose)
                                                    {
                                                        console.log('Deleted stale ticket "%s"\'', CONST.VALID_PREFIX + ticket);
                                                    }

                                                    deleted(1);
                                                }
                                            });
                                        }
                                    });
                                }
                                else
                                {
                                    if (verbose)
                                    {
                                        console.log('Could not find ticket "%s" anymore', key);
                                    }

                                    deleted(0);
                                }
                            }
                            else
                            {
                                if (verbose)
                                {
                                    console.log('Skipping empty key...');
                                }
                            }
                        });
                    }
                    else
                    {
                        resolve(0);
                    }
                });
            });
        });
    }
};
