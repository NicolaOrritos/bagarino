
'use strict';

const redis = require('redis');
const CONST = require('./const');
const CONF  = require('./conf');


module.exports =
{
    run: function()
    {
        return new Promise( (resolve, reject) =>
        {
            const started = Date.now();


            const client = redis.createClient({
                host: CONF.REDIS.HOST,
                port: CONF.REDIS.PORT,
                db:   CONF.REDIS.DB
            });

            client.on('error', reject);

            let ignored    = 0;
            let orphans    = 0;
            let grandTotal = 0;

            const policies = {};
            policies[CONST.POLICIES.REQUESTS_BASED]    = 0;
            policies[CONST.POLICIES.TIME_BASED]        = 0;
            policies[CONST.POLICIES.MANUAL_EXPIRATION] = 0;
            policies[CONST.POLICIES.BANDWIDTH_BASED]   = 0;
            policies[CONST.POLICIES.CASCADING]         = 0;

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

                        const areWeFinished = function(instructions)
                        {
                            if (instructions && instructions.ignored)
                            {
                                ignored++;
                            }

                            processed++;

                            if (processed === total)
                            {
                                grandTotal += processed;

                                const duration = ((Date.now() - started) / 1000).toPrecision(2) + 's';

                                if (cursor === 0)
                                {
                                    const result =
                                    {
                                        tickets:
                                        {
                                            total: grandTotal,
                                            ignored,
                                            orphans,
                                            policies,

                                            exploration: 'valid-based'
                                        },

                                        duration
                                    };

                                    resolve(result);
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
                                resolve();
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

                                    if (ticket)
                                    {
                                        client.hget(CONST.VALID_PREFIX + ticket, 'policy', (err3, policy_str) =>
                                        {
                                            if (err3)
                                            {
                                                areWeFinished({ignore: true});
                                            }
                                            else if (policy_str)
                                            {
                                                const policy = JSON.parse(policy_str);

                                                for (let policyName in policies)
                                                {
                                                    if (policy[policyName] === true)
                                                    {
                                                        policies[policyName]++;
                                                    }
                                                }

                                                if (policy.requests_based)
                                                {
                                                    client.get(CONST.EXPIRED_PREFIX + ticket, (err4, exists) =>
                                                    {
                                                        if (!err4 && !exists)
                                                        {
                                                            // Stale ticket
                                                            orphans++;
                                                        }

                                                        areWeFinished();
                                                    });
                                                }
                                                else
                                                {
                                                    areWeFinished();
                                                }
                                            }
                                            else
                                            {
                                                areWeFinished({ignore: true});
                                            }
                                        });
                                    }
                                    else
                                    {
                                        areWeFinished({ignore: true});
                                    }
                                }
                                else
                                {
                                    areWeFinished({ignore: true});
                                }
                            });
                        }
                    }
                });
            }

            /* jshint +W116 */

            scan();
        });
    }
};
