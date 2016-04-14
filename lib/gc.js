
'use strict';

const P     = require('bluebird');
const redis = require('redis');
const CONST = require('./const');


module.exports =
{
    run: function(verbose)
    {
        return new P(function(resolve, reject)
        {
            console.log('Starting garbage collection' + (verbose ? ', with "verbose" option' : '') + '...');


            const client = redis.createClient();

            client.on("error", reject);


            let cleaned = 0;

            /* jshint -W116 */

            function scan(cursor)
            {
                if (cursor === undefined || cursor === null)
                {
                    cursor = 0;
                }

                client.scan(cursor,
                            'MATCH', CONST.VALID_PREFIX + '*',
                            'COUNT', 128,
                            (err2, res) =>
                {
                    if (err2)
                    {
                        reject(err2);
                    }
                    else
                    {
                        cursor = parseInt(res[0]);


                        const keys = res[1];

                        const total   = keys.length;
                        let processed = 0;

                        if (verbose)
                        {
                            console.log('Cursor is now "%s"...', cursor);
                            console.log('Got %s key(s) to analyze...', total);
                        }

                        const deleted = function(count)
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
                            keys.forEach( key =>
                            {
                                if (key)
                                {
                                    const ticket = key.slice(CONST.VALID_PREFIX.length);


                                    if (verbose) console.log('Analyzing ticket "%s" (from key "%s")...', ticket, key);

                                    if (ticket)
                                    {
                                        client.hget(CONST.VALID_PREFIX + ticket, 'policy', (err3, policy_str) =>
                                        {
                                            if (err3)
                                            {
                                                if (verbose) console.log('Could not get "%s"\'s policy. %s', CONST.VALID_PREFIX + ticket, err3);

                                                deleted(0);
                                            }
                                            else if (policy_str)
                                            {
                                                const policy = JSON.parse(policy_str);

                                                if (policy.requests_based)
                                                {
                                                    client.get(CONST.EXPIRED_PREFIX + ticket, (err4, exists) =>
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
                                                            client.del(CONST.VALID_PREFIX + ticket, err5 =>
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

            const REDIS_DB = CONST.DB;

            client.select(REDIS_DB, () =>
            {
                if (verbose) console.log('Opened DB "%s"...', REDIS_DB);

                /* jshint +W116 */

                scan();
            });
        });
    }
};
