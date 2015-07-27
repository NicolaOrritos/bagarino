
'use strict';

var P       = require('bluebird');
var redis   = require('redis');
var CONST   = require('./const');


var client = redis.createClient();

client.on('error', function (err)
{
    global.log.error('Got an error from the Redis client: ' + err);
});

var REDIS_DB = CONST.DB;


module.exports =
{
    detectRequestsBased: function(query_string, policy)
    {
        return new P(function(resolve, reject)
        {
            if (query_string && policy)
            {
                policy.requests_based = true;

                if (query_string.requests)
                {
                    var reqs = parseInt(query_string.requests);

                    // Added "reqs < 0" condition to fix bug #10
                    if (isNaN(reqs) || reqs < 0)
                    {
                        policy.expires_in = CONST.DEFAULT_EXPIRES_IN_REQUESTS;
                    }
                    else
                    {
                        policy.expires_in = reqs;
                    }
                }
                else
                {
                    policy.expires_in = CONST.DEFAULT_EXPIRES_IN_REQUESTS;
                }

                if (policy.autorenew)
                {
                    policy.original_expires_in = policy.expires_in;
                }

                resolve(policy);
            }
            else
            {
                reject(new Error('Missing query-string and/or policy'));
            }
        });
    },

    detectManual: function(query_string, policy)
    {
        return new P(function(resolve, reject)
        {
            if (query_string && policy)
            {
                policy.manual_expiration = true;

                resolve(policy);
            }
            else
            {
                reject(new Error('Missing query-string and/or policy'));
            }
        });
    },

    detectTimeBased: function(query_string, policy)
    {
        return new P(function(resolve, reject)
        {
            if (query_string && policy)
            {
                policy.time_based = true;

                if (query_string.seconds)
                {
                    var secs = parseInt(query_string.seconds);

                    if (isNaN(secs))
                    {
                        policy.expires_in = CONST.DEFAULT_EXPIRES_IN_SECONDS;
                    }
                    else
                    {
                        policy.expires_in = secs;
                    }
                }
                else
                {
                    policy.expires_in = CONST.DEFAULT_EXPIRES_IN_SECONDS;
                }


                resolve(policy);
            }
            else
            {
                reject(new Error('Missing query-string and/or policy'));
            }
        });
    },

    detectCascading: function(query_string, policy)
    {
        return new P(function(resolve, reject)
        {
            if (query_string && policy)
            {
                policy.cascading = true;

                var dep_ticket = query_string.depends_on;

                global.log.debug('Creating cascading-policy ticket dependent on ticket "%s"...', dep_ticket);

                if (dep_ticket)
                {
                    client.select(REDIS_DB, function()
                    {
                        client.exists(CONST.VALID_PREFIX + dep_ticket, function(error, exists)
                        {
                            if(exists)
                            {
                                global.log.debug('Dependency ticket "%s" exists', dep_ticket);

                                policy.depends_on = dep_ticket;

                                global.log.debug('Resulting policy for cascading ticket is: ' + JSON.stringify(policy));
                            }
                            else
                            {
                                global.log.debug('Dependency ticket "%s" DOES NOT exists', dep_ticket);

                                policy = undefined;
                            }


                            resolve(policy);
                        });
                    });
                }
                else
                {
                    policy = undefined;

                    reject(new Error('No dependent ticket found'));
                }
            }
            else
            {
                reject(new Error('Missing query-string and/or policy'));
            }
        });
    },

    detectBandwithBased: function(query_string, policy)
    {
        return new P(function(resolve, reject)
        {
            if (query_string && policy)
            {
                policy.bandwidth_based = true;

                if (query_string.reqs_per_minute)
                {
                    var reqsPerMin = parseInt(query_string.reqs_per_minute);

                    if (isNaN(reqsPerMin))
                    {
                        policy.expires_in = CONST.DEFAULT_REQUESTS_PER_MINUTE;
                    }
                    else
                    {
                        policy.expires_in = reqsPerMin;
                    }
                }
                else
                {
                    policy.expires_in = CONST.DEFAULT_REQUESTS_PER_MINUTE;
                }


                resolve(policy);
            }
            else
            {
                reject(new Error('Missing query-string and/or policy'));
            }
        });
    }
};
